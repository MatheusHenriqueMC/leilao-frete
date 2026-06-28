"""
Gateway (BFF) — async_mode="threading" com HTTP long-polling.

Traduz eventos Socket.IO do navegador em chamadas gRPC para os microsservicos:
- login / create_carrier  -> auth-service
- restante (leiloes, lances, status, historico, stream) -> auction-service

Nao usa eventlet para evitar conflito com gRPC (C extension + monkey_patch
causam fechamento imediato de WebSocket). Long-polling via polling transport
funciona bem para leilao com poucos usuarios simultaneos.
"""

import sys
import os
import threading
import logging
import time

from dotenv import load_dotenv
from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import grpc

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))

import auth_pb2, auth_pb2_grpc
import auction_pb2, auction_pb2_grpc
import notification_pb2, notification_pb2_grpc

logging.basicConfig(level=logging.INFO,
                    format="[%(asctime)s] GATEWAY %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

AUTH_HOST    = os.environ.get("AUTH_HOST", "localhost")
AUTH_PORT    = os.environ.get("AUTH_PORT", "50052")
AUCTION_HOST = os.environ.get("AUCTION_HOST", "localhost")
AUCTION_PORT = os.environ.get("AUCTION_PORT", "50051")
NOTIFICATION_HOST = os.environ.get("NOTIFICATION_HOST", "localhost")
NOTIFICATION_PORT = os.environ.get("NOTIFICATION_PORT", "50053")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "5000"))
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173")

app = Flask(__name__)
CORS(app, origins=CORS_ORIGINS.split(","))
socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS.split(","),
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)

# ── Stubs gRPC (um por microsservico) ─────────────────────────────────────────

_auth_stub: auth_pb2_grpc.AuthServiceStub | None = None
_auction_stub: auction_pb2_grpc.AuctionServiceStub | None = None
_notification_stub: notification_pb2_grpc.NotificationServiceStub | None = None
_stub_lock = threading.Lock()


def get_auth_stub() -> auth_pb2_grpc.AuthServiceStub:
    global _auth_stub
    with _stub_lock:
        if _auth_stub is None:
            ch = grpc.insecure_channel(f"{AUTH_HOST}:{AUTH_PORT}")
            _auth_stub = auth_pb2_grpc.AuthServiceStub(ch)
            logger.info("gRPC auth conectado em %s:%s", AUTH_HOST, AUTH_PORT)
        return _auth_stub


def get_auction_stub() -> auction_pb2_grpc.AuctionServiceStub:
    global _auction_stub
    with _stub_lock:
        if _auction_stub is None:
            ch = grpc.insecure_channel(f"{AUCTION_HOST}:{AUCTION_PORT}")
            _auction_stub = auction_pb2_grpc.AuctionServiceStub(ch)
            logger.info("gRPC auction conectado em %s:%s", AUCTION_HOST, AUCTION_PORT)
        return _auction_stub


def get_notification_stub() -> notification_pb2_grpc.NotificationServiceStub:
    global _notification_stub
    with _stub_lock:
        if _notification_stub is None:
            ch = grpc.insecure_channel(f"{NOTIFICATION_HOST}:{NOTIFICATION_PORT}")
            _notification_stub = notification_pb2_grpc.NotificationServiceStub(ch)
            logger.info("gRPC notification conectado em %s:%s", NOTIFICATION_HOST, NOTIFICATION_PORT)
        return _notification_stub

# ── Streams por leilao (threads OS reais — sem conflito com gRPC) ─────────────

_streams: dict[int, threading.Thread] = {}
_streams_lock = threading.Lock()


def _room(leilao_id: int) -> str:
    return f"leilao_{leilao_id}"


def _stream_thread(leilao_id: int):
    """Thread OS real que mantem stream gRPC e faz broadcast via socketio."""
    room = _room(leilao_id)
    while True:
        try:
            stub = get_notification_stub()
            logger.info("Stream ativa para leilão %d.", leilao_id)
            for update in stub.SubscribeUpdates(
                notification_pb2.SubscriptionRequest(
                    transportadora_id="gateway",
                    leilao_id=leilao_id,
                ),
                wait_for_ready=True,
            ):
                data = {
                    "leilao_id":            update.leilao_id,
                    "menor_lance":          update.menor_lance,
                    "transportadora_lider": update.transportadora_lider,
                    "timestamp":            update.timestamp,
                    "encerrado":            update.encerrado,
                    "mensagem":             update.mensagem,
                    "tempo_restante_s":     update.tempo_restante_s,
                }
                socketio.emit("auction_update", data, to=room)
                logger.info("Broadcast leilão %d → room %s", leilao_id, room)
                if update.encerrado:
                    break

        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.CANCELLED:
                break
            logger.error("Stream leilão %d perdida (%s). Reconectando em 3s...",
                         leilao_id, e.code())
            time.sleep(3)
        except Exception as e:
            logger.error("Erro na stream %d: %s. Reconectando em 3s...", leilao_id, e)
            time.sleep(3)
        else:
            break  # stream encerrada normalmente

    with _streams_lock:
        _streams.pop(leilao_id, None)
    logger.info("Stream do leilão %d encerrada.", leilao_id)


def start_stream(leilao_id: int):
    with _streams_lock:
        if leilao_id in _streams:
            return
        t = threading.Thread(target=_stream_thread, args=(leilao_id,), daemon=True)
        _streams[leilao_id] = t
        t.start()
        logger.info("Thread de stream iniciada para leilão %d.", leilao_id)


def _carregar_streams_existentes():
    time.sleep(3)  # aguarda auction-service ficar pronto
    try:
        resp = get_auction_stub().ListAuctions(
            auction_pb2.ListAuctionsRequest(apenas_ativos=True),
            wait_for_ready=True,
        )
        for l in resp.leiloes:
            start_stream(l.id)
            logger.info("Stream recarregada: leilão %d (%s).", l.id, l.titulo)
    except Exception as e:
        logger.warning("Não foi possível carregar streams existentes: %s", e)


threading.Thread(target=_carregar_streams_existentes, daemon=True).start()

# ── Eventos WebSocket/Polling ─────────────────────────────────────────────────


@socketio.on("connect")
def on_connect():
    logger.info("Cliente conectado: %s", request.sid)
    emit("connected", {"mensagem": "Conectado ao gateway."})


@socketio.on("disconnect")
def on_disconnect():
    logger.info("Cliente desconectado: %s", request.sid)


@socketio.on("login")
def on_login(data):
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    try:
        resp = get_auth_stub().Login(
            auth_pb2.LoginRequest(username=username, password=password)
        )
        emit("login_response", {
            "sucesso":  resp.sucesso,
            "role":     resp.role,
            "mensagem": resp.mensagem,
            "userId":   username,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro no servidor: {e.details()}"})


@socketio.on("create_carrier")
def on_create_carrier(data):
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        emit("error", {"mensagem": "Usuário e senha obrigatórios."})
        return
    try:
        resp = get_auth_stub().CreateCarrier(
            auth_pb2.CreateCarrierRequest(username=username, password=password)
        )
        emit("create_carrier_response", {"sucesso": resp.sucesso, "mensagem": resp.mensagem})
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("create_auction")
def on_create_auction(data):
    try:
        resp = get_auction_stub().CreateAuction(auction_pb2.CreateAuctionRequest(
            titulo=data.get("titulo", ""),
            descricao=data.get("descricao", ""),
            especificacoes=data.get("especificacoes", ""),
            valor_inicial=float(data.get("valor_inicial", 0)),
            tempo_segundos=int(data.get("tempo_segundos", 0)),
            imagens=data.get("imagens", []),
        ))
        if resp.sucesso:
            start_stream(resp.leilao_id)
        emit("create_auction_response", {
            "sucesso":   resp.sucesso,
            "leilao_id": resp.leilao_id,
            "join_code": resp.join_code,
            "mensagem":  resp.mensagem,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro ao criar leilão: {e.details()}"})


@socketio.on("join_auction")
def on_join_auction(data):
    leilao_id = int(data.get("leilao_id", 0))
    join_room(_room(leilao_id))
    start_stream(leilao_id)
    emit("joined_auction", {"leilao_id": leilao_id,
                            "mensagem": f"Inscrito no leilão {leilao_id}."})


@socketio.on("bid")
def on_bid(data):
    leilao_id = int(data.get("leilao_id", 0))
    tid       = data.get("transportadora_id", "").strip()
    valor     = data.get("valor")
    if not tid:
        emit("error", {"mensagem": "ID da transportadora obrigatório."})
        return
    try:
        valor = float(valor)
    except (TypeError, ValueError):
        emit("error", {"mensagem": "Valor inválido."})
        return
    try:
        resp = get_auction_stub().PlaceBid(
            auction_pb2.BidRequest(valor=valor, transportadora_id=tid, leilao_id=leilao_id)
        )
        emit("bid_response", {
            "aceito":            resp.aceito,
            "menor_lance_atual": resp.menor_lance_atual,
            "mensagem":          resp.mensagem,
            "leilao_id":         leilao_id,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("status")
def on_status(data):
    leilao_id = int(data.get("leilao_id", 0))
    try:
        r = get_auction_stub().GetStatus(auction_pb2.StatusRequest(leilao_id=leilao_id))
        emit("status_response", {
            "leilao_id":            r.leilao_id,
            "titulo":               r.titulo,
            "descricao_carga":      r.descricao_carga,
            "especificacoes":       r.especificacoes,
            "valor_inicial":        r.valor_inicial,
            "menor_lance":          r.menor_lance,
            "transportadora_lider": r.transportadora_lider,
            "timestamp":            r.timestamp,
            "total_lances":         r.total_lances,
            "encerrado":            r.encerrado,
            "tempo_restante_s":     r.tempo_restante_s,
            "tempo_total_s":        r.tempo_total_s,
            "join_code":            r.join_code,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("history")
def on_history(data):
    leilao_id = int(data.get("leilao_id", 0))
    try:
        r = get_auction_stub().GetHistory(auction_pb2.HistoryRequest(leilao_id=leilao_id))
        emit("history_response", {
            "lances": [
                {"valor": l.valor, "transportadora_id": l.transportadora_id,
                 "timestamp": l.timestamp}
                for l in r.lances
            ]
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("start_countdown")
def on_start_countdown(data):
    """Admin inicia o countdown — broadcast para todos na room do leilao."""
    leilao_id = int(data.get("leilao_id", 0))
    socketio.emit("countdown_started", {"leilao_id": leilao_id}, to=_room(leilao_id))
    logger.info("Countdown iniciado para leilão %d", leilao_id)


@socketio.on("cancel_countdown")
def on_cancel_countdown(data):
    """Cancela o countdown em andamento — broadcast para todos na room."""
    leilao_id = int(data.get("leilao_id", 0))
    socketio.emit("countdown_cancelled", {"leilao_id": leilao_id}, to=_room(leilao_id))
    logger.info("Countdown cancelado para leilão %d", leilao_id)


@socketio.on("close_auction")
def on_close_auction(data):
    admin_id  = data.get("admin_id", "").strip()
    leilao_id = int(data.get("leilao_id", 0))
    if not admin_id:
        emit("error", {"mensagem": "ID do admin obrigatório."})
        return
    try:
        r = get_auction_stub().CloseAuction(
            auction_pb2.CloseRequest(admin_id=admin_id, leilao_id=leilao_id)
        )
        emit("close_response", {
            "sucesso":      r.sucesso,
            "mensagem":     r.mensagem,
            "vencedor_id":  r.vencedor_id,
            "valor_final":  r.valor_final,
            "total_lances": r.total_lances,
            "leilao_id":    leilao_id,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("list_auctions")
def on_list_auctions(data):
    apenas_ativos = bool(data.get("apenas_ativos", True))
    try:
        r = get_auction_stub().ListAuctions(
            auction_pb2.ListAuctionsRequest(apenas_ativos=apenas_ativos)
        )
        emit("list_auctions_response", {"leiloes": [_summary_dict(l) for l in r.leiloes]})
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("auction_detail")
def on_auction_detail(data):
    leilao_id = int(data.get("leilao_id", 0))
    try:
        r = get_auction_stub().GetAuctionDetail(
            auction_pb2.AuctionDetailRequest(leilao_id=leilao_id)
        )
        emit("auction_detail_response", {
            "leilao":  _summary_dict(r.leilao),
            "lances":  [
                {"valor": l.valor, "transportadora_id": l.transportadora_id,
                 "timestamp": l.timestamp}
                for l in r.lances
            ],
            "imagens": list(r.imagens),
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("carrier_history")
def on_carrier_history(data):
    tid = data.get("transportadora_id", "").strip()
    if not tid:
        emit("error", {"mensagem": "ID da transportadora obrigatório."})
        return
    try:
        r = get_auction_stub().GetCarrierHistory(
            auction_pb2.CarrierHistoryRequest(transportadora_id=tid)
        )
        emit("carrier_history_response", {"leiloes": [_summary_dict(l) for l in r.leiloes]})
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


@socketio.on("resolve_code")
def on_resolve_code(data):
    code = data.get("join_code", "").strip()
    try:
        r = get_auction_stub().ResolveJoinCode(
            auction_pb2.ResolveJoinCodeRequest(join_code=code)
        )
        emit("resolve_code_response", {
            "encontrado": r.encontrado,
            "leilao_id":  r.leilao_id,
            "titulo":     r.titulo,
            "mensagem":   r.mensagem,
        })
    except grpc.RpcError as e:
        emit("error", {"mensagem": f"Erro: {e.details()}"})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _summary_dict(s) -> dict:
    return {
        "id":                   s.id,
        "titulo":               s.titulo,
        "descricao":            s.descricao,
        "especificacoes":       s.especificacoes,
        "join_code":            s.join_code,
        "valor_inicial":        s.valor_inicial,
        "menor_lance":          s.menor_lance,
        "transportadora_lider": s.transportadora_lider,
        "encerrado":            s.encerrado,
        "total_lances":         s.total_lances,
        "tempo_restante_s":     s.tempo_restante_s,
        "tempo_total_s":        s.tempo_total_s,
        "created_at":           s.created_at,
        "ended_at":             s.ended_at,
        "vencedor_id":          s.vencedor_id,
        "valor_final":          s.valor_final,
        "thumbnail":            s.thumbnail,
    }


@app.route("/health")
def health():
    return {"status": "ok",
            "auth": f"{AUTH_HOST}:{AUTH_PORT}",
            "auction": f"{AUCTION_HOST}:{AUCTION_PORT}",
            "notification": f"{NOTIFICATION_HOST}:{NOTIFICATION_PORT}"}


if __name__ == "__main__":
    logger.info("Gateway iniciando na porta %d…", GATEWAY_PORT)
    socketio.run(app, host="0.0.0.0", port=GATEWAY_PORT,
                 debug=False, allow_unsafe_werkzeug=True)
