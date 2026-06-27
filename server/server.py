"""
Servidor gRPC — Leilão Reverso de Fretes (multi-leilão)
"""

import sys
import os
import logging
import threading
import time
import queue
from collections import defaultdict
from concurrent import futures
from datetime import datetime, timezone

from dotenv import load_dotenv
import grpc

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "generated"))

from generated import freight_pb2
from generated import freight_pb2_grpc
from server.auction import AuctionState
from server.database import Database

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PORT = 50051
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/freight_auction",
)
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")


def _summary_from_state(state: AuctionState) -> freight_pb2.AuctionSummary:
    s = state.obter_status()
    return freight_pb2.AuctionSummary(
        id=state.leilao_id,
        titulo=state.titulo,
        descricao=state.descricao_carga,
        especificacoes=state.especificacoes,
        join_code=state.join_code,
        valor_inicial=state.valor_inicial,
        menor_lance=s["menor_lance"],
        transportadora_lider=s["transportadora_lider"],
        encerrado=state.encerrado,
        total_lances=s["total_lances"],
        tempo_restante_s=s["tempo_restante_s"],
        tempo_total_s=state.tempo_total_s,
        thumbnail=state.thumbnail,
        created_at=state.created_at,
    )


def _summary_from_db(d: dict) -> freight_pb2.AuctionSummary:
    imagens = d.get("imagens", [])
    return freight_pb2.AuctionSummary(
        id=d["id"],
        titulo=d["titulo"],
        descricao=d["descricao_carga"],
        especificacoes=d["especificacoes"],
        join_code=d["join_code"],
        valor_inicial=d["valor_inicial"],
        menor_lance=d["valor_final"] if d["encerrado"] else d["valor_inicial"],
        transportadora_lider=d["vencedor_id"],
        encerrado=d["encerrado"],
        total_lances=d["total_lances"],
        vencedor_id=d["vencedor_id"],
        valor_final=d["valor_final"],
        created_at=d["created_at"],
        ended_at=d["ended_at"],
        thumbnail=imagens[0] if imagens else "",
    )


class FreightAuctionServicer(freight_pb2_grpc.FreightAuctionServicer):

    def __init__(self, db: Database):
        self._db = db
        self._leiloes: dict[int, AuctionState] = {}
        self._leiloes_lock = threading.Lock()

        # Subscribers: leilao_id → list[Queue]
        self._subscribers: dict[int, list[queue.Queue]] = defaultdict(list)
        self._subscribers_lock = threading.Lock()

        # Timers: leilao_id → threading.Timer
        self._timers: dict[int, threading.Timer] = {}

        self._recarregar_leiloes_ativos()

    # ── Startup: recarrega leilões ativos do banco ─────────────────────────────

    def _recarregar_leiloes_ativos(self):
        ativos = self._db.listar_leiloes(apenas_ativos=True)
        for d in ativos:
            imgs = d.get("imagens", [])
            state = AuctionState(
                leilao_id=d["id"],
                titulo=d["titulo"],
                descricao_carga=d["descricao_carga"],
                especificacoes=d["especificacoes"],
                valor_inicial=d["valor_inicial"],
                join_code=d["join_code"],
                tempo_total_s=d["tempo_segundos"],
                db=self._db,
                thumbnail=imgs[0] if imgs else "",
                created_at=d.get("created_at", ""),
            )
            with self._leiloes_lock:
                self._leiloes[d["id"]] = state
            logger.info("Leilão %d (%s) recarregado do banco.", d["id"], d["titulo"])

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _get_state(self, leilao_id: int) -> AuctionState | None:
        with self._leiloes_lock:
            return self._leiloes.get(leilao_id)

    def _notificar(self, leilao_id: int, menor_lance: float, lider: str,
                   encerrado: bool, mensagem: str, tempo_restante_s: int = 0):
        update = freight_pb2.AuctionUpdate(
            menor_lance=menor_lance,
            transportadora_lider=lider,
            timestamp=int(time.time() * 1000),
            encerrado=encerrado,
            mensagem=mensagem,
            leilao_id=leilao_id,
            tempo_restante_s=tempo_restante_s,
        )
        with self._subscribers_lock:
            filas = list(self._subscribers.get(leilao_id, []))
        for f in filas:
            f.put(update)
        logger.info("Notificados %d subscriber(s) do leilão %d.", len(filas), leilao_id)

    def _encerrar_por_timer(self, leilao_id: int):
        state = self._get_state(leilao_id)
        if not state or state.encerrado:
            return
        logger.info("Timer expirou para leilão %d. Encerrando...", leilao_id)
        resultado = state.encerrar_leilao()
        msg = (
            f"LEILÃO ENCERRADO por tempo! Vencedor: '{resultado['vencedor_id']}' "
            f"com R$ {resultado['valor_final']:.2f}"
            if resultado["teve_vencedor"]
            else "LEILÃO ENCERRADO por tempo! Nenhum lance."
        )
        self._notificar(leilao_id, resultado["valor_final"], resultado["vencedor_id"],
                        True, msg, 0)

    # ── Autenticação ───────────────────────────────────────────────────────────

    def Login(self, request, _context):
        username = request.username.strip()
        password = request.password.strip()

        if not username:
            return freight_pb2.LoginResponse(sucesso=False, role="",
                                              mensagem="Nome não pode ser vazio.")

        # Verifica admin
        if username == ADMIN_USERNAME:
            if password == ADMIN_PASSWORD:
                return freight_pb2.LoginResponse(sucesso=True, role="admin",
                                                  mensagem="Login de administrador realizado.")
            return freight_pb2.LoginResponse(sucesso=False, role="",
                                              mensagem="Senha de administrador incorreta.")

        # Verifica transportadora cadastrada
        if self._db.validar_transportadora(username, password):
            return freight_pb2.LoginResponse(sucesso=True, role="transportadora",
                                              mensagem=f"Bem-vindo, {username}!")

        return freight_pb2.LoginResponse(sucesso=False, role="",
                                          mensagem="Usuário ou senha incorretos.")

    def CreateCarrier(self, request, _context):
        sucesso, mensagem = self._db.criar_transportadora(
            username=request.username.strip(),
            password=request.password,
        )
        return freight_pb2.CreateCarrierResponse(sucesso=sucesso, mensagem=mensagem)

    # ── Criação de Leilão ─────────────────────────────────────────────────────

    def CreateAuction(self, request, _context):  # noqa: ARG002
        titulo = request.titulo.strip()
        if not titulo:
            return freight_pb2.CreateAuctionResponse(sucesso=False, mensagem="Título obrigatório.")
        if request.valor_inicial <= 0:
            return freight_pb2.CreateAuctionResponse(sucesso=False, mensagem="Valor inicial inválido.")

        try:
            leilao_id, join_code = self._db.criar_leilao(
                titulo=titulo,
                descricao_carga=request.descricao or titulo,
                especificacoes=request.especificacoes,
                valor_inicial=request.valor_inicial,
                tempo_segundos=max(0, request.tempo_segundos),
                imagens=list(request.imagens),
            )
        except Exception as e:
            logger.error("Erro ao criar leilão no banco: %s", e)
            return freight_pb2.CreateAuctionResponse(sucesso=False, mensagem="Erro interno.")

        imagens = list(request.imagens)
        now_iso = datetime.now(timezone.utc).isoformat()
        state = AuctionState(
            leilao_id=leilao_id,
            titulo=titulo,
            descricao_carga=request.descricao or titulo,
            especificacoes=request.especificacoes,
            valor_inicial=request.valor_inicial,
            join_code=join_code,
            tempo_total_s=max(0, request.tempo_segundos),
            db=self._db,
            thumbnail=imagens[0] if imagens else "",
            created_at=now_iso,
        )
        with self._leiloes_lock:
            self._leiloes[leilao_id] = state

        if request.tempo_segundos > 0:
            t = threading.Timer(request.tempo_segundos, self._encerrar_por_timer, args=[leilao_id])
            t.daemon = True
            t.start()
            self._timers[leilao_id] = t
            logger.info("Timer de %ds iniciado para leilão %d.", request.tempo_segundos, leilao_id)

        logger.info("Leilão %d '%s' criado (código %s).", leilao_id, titulo, join_code)
        return freight_pb2.CreateAuctionResponse(
            sucesso=True,
            leilao_id=leilao_id,
            join_code=join_code,
            mensagem=f"Leilão '{titulo}' criado com código {join_code}.",
        )

    # ── Encerramento Manual ────────────────────────────────────────────────────

    def CloseAuction(self, request, context):
        state = self._get_state(request.leilao_id)
        if not state:
            return freight_pb2.CloseResponse(sucesso=False, mensagem="Leilão não encontrado.")
        if state.encerrado:
            return freight_pb2.CloseResponse(sucesso=False, mensagem="Leilão já encerrado.")

        # Cancela timer pendente se houver
        t = self._timers.pop(request.leilao_id, None)
        if t:
            t.cancel()

        resultado = state.encerrar_leilao()
        msg = (
            f"Leilão encerrado por '{request.admin_id}'. "
            f"Vencedor: '{resultado['vencedor_id']}' com R$ {resultado['valor_final']:.2f}"
            if resultado["teve_vencedor"]
            else f"Leilão encerrado por '{request.admin_id}'. Nenhum lance."
        )
        self._notificar(request.leilao_id, resultado["valor_final"],
                        resultado["vencedor_id"], True, msg, 0)

        return freight_pb2.CloseResponse(
            sucesso=True,
            mensagem=msg,
            vencedor_id=resultado["vencedor_id"],
            valor_final=resultado["valor_final"],
            total_lances=resultado["total_lances"],
        )

    # ── Lance ──────────────────────────────────────────────────────────────────

    def PlaceBid(self, request, context):
        state = self._get_state(request.leilao_id)
        if not state:
            return freight_pb2.BidResponse(aceito=False, mensagem="Leilão não encontrado.",
                                            menor_lance_atual=0)

        aceito, mensagem, menor_lance = state.registrar_lance(request.valor, request.transportadora_id)

        if aceito:
            self._notificar(
                request.leilao_id, menor_lance, request.transportadora_id, False,
                f"Novo lance: R$ {menor_lance:.2f} por '{request.transportadora_id}'",
                state.tempo_restante_s(),
            )

        return freight_pb2.BidResponse(aceito=aceito, menor_lance_atual=menor_lance, mensagem=mensagem)

    # ── Status ─────────────────────────────────────────────────────────────────

    def GetStatus(self, request, context):
        state = self._get_state(request.leilao_id)
        if not state:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details("Leilão não encontrado.")
            return freight_pb2.StatusResponse()

        s = state.obter_status()
        return freight_pb2.StatusResponse(
            leilao_id=state.leilao_id,
            titulo=state.titulo,
            descricao_carga=state.descricao_carga,
            especificacoes=state.especificacoes,
            valor_inicial=state.valor_inicial,
            menor_lance=s["menor_lance"],
            transportadora_lider=s["transportadora_lider"],
            timestamp=s["timestamp_ms"],
            total_lances=s["total_lances"],
            encerrado=s["encerrado"],
            tempo_restante_s=s["tempo_restante_s"],
            tempo_total_s=state.tempo_total_s,
            join_code=state.join_code,
        )

    # ── Histórico de Lances ────────────────────────────────────────────────────

    def GetHistory(self, request, context):
        state = self._get_state(request.leilao_id)
        if not state:
            return freight_pb2.HistoryResponse()

        historico = state.obter_historico()
        return freight_pb2.HistoryResponse(lances=[
            freight_pb2.LanceInfo(
                valor=l["valor"],
                transportadora_id=l["transportadora_id"],
                timestamp=l["timestamp_ms"],
            )
            for l in historico
        ])

    # ── Listagem de Leilões ────────────────────────────────────────────────────

    def ListAuctions(self, request, context):
        if request.apenas_ativos:
            with self._leiloes_lock:
                leiloes_mem = list(self._leiloes.values())
            return freight_pb2.ListAuctionsResponse(
                leiloes=[_summary_from_state(s) for s in leiloes_mem]
            )
        else:
            todos = self._db.listar_leiloes(apenas_ativos=False)
            return freight_pb2.ListAuctionsResponse(
                leiloes=[_summary_from_db(d) for d in todos]
            )

    # ── Detalhe de Leilão ──────────────────────────────────────────────────────

    def GetAuctionDetail(self, request, context):
        # Imagens sempre vêm do banco
        db_info = self._db.obter_leilao(request.leilao_id)
        imagens = db_info.get("imagens", []) if db_info else []

        state = self._get_state(request.leilao_id)
        if state:
            summary = _summary_from_state(state)
            lances = [
                freight_pb2.LanceInfo(
                    valor=l["valor"],
                    transportadora_id=l["transportadora_id"],
                    timestamp=l["timestamp_ms"],
                )
                for l in state.obter_historico()
            ]
        else:
            if not db_info:
                context.set_code(grpc.StatusCode.NOT_FOUND)
                return freight_pb2.AuctionDetailResponse()
            summary = _summary_from_db(db_info)
            lances = [
                freight_pb2.LanceInfo(
                    valor=l["valor"],
                    transportadora_id=l["transportadora_id"],
                    timestamp=l["timestamp_ms"],
                )
                for l in self._db.obter_lances(request.leilao_id)
            ]

        return freight_pb2.AuctionDetailResponse(leilao=summary, lances=lances, imagens=imagens)

    # ── Histórico da Transportadora ────────────────────────────────────────────

    def GetCarrierHistory(self, request, context):
        leiloes = self._db.historico_transportadora(request.transportadora_id)
        return freight_pb2.CarrierHistoryResponse(
            leiloes=[_summary_from_db(d) for d in leiloes]
        )

    # ── Resolver Join Code ─────────────────────────────────────────────────────

    def ResolveJoinCode(self, request, context):
        code = request.join_code.strip().upper()

        # Busca em memória primeiro
        with self._leiloes_lock:
            for state in self._leiloes.values():
                if state.join_code == code:
                    if state.encerrado:
                        return freight_pb2.ResolveJoinCodeResponse(
                            encontrado=False, mensagem="Leilão encerrado."
                        )
                    return freight_pb2.ResolveJoinCodeResponse(
                        encontrado=True, leilao_id=state.leilao_id, titulo=state.titulo,
                        mensagem="Leilão encontrado."
                    )

        # Fallback no banco
        d = self._db.obter_leilao_por_code(code)
        if not d:
            return freight_pb2.ResolveJoinCodeResponse(
                encontrado=False, mensagem="Código inválido."
            )
        if d["encerrado"]:
            return freight_pb2.ResolveJoinCodeResponse(
                encontrado=False, mensagem="Leilão encerrado."
            )
        return freight_pb2.ResolveJoinCodeResponse(
            encontrado=True, leilao_id=d["id"], titulo=d["titulo"],
            mensagem="Leilão encontrado."
        )

    # ── Stream de Notificações ─────────────────────────────────────────────────

    def SubscribeUpdates(self, request, context):
        leilao_id = request.leilao_id
        tid = request.transportadora_id

        state = self._get_state(leilao_id)
        if not state:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details("Leilão não encontrado.")
            return

        state.adicionar_participante(tid)
        fila: queue.Queue = queue.Queue()

        with self._subscribers_lock:
            self._subscribers[leilao_id].append(fila)

        logger.info("'%s' inscrito no leilão %d.", tid, leilao_id)
        try:
            while context.is_active():
                try:
                    update = fila.get(timeout=1.0)
                    yield update
                    if update.encerrado:
                        break
                except queue.Empty:
                    continue
        finally:
            with self._subscribers_lock:
                lista = self._subscribers.get(leilao_id, [])
                if fila in lista:
                    lista.remove(fila)
            state.remover_participante(tid)
            logger.info("'%s' desconectou do leilão %d.", tid, leilao_id)


def serve():
    logger.info("Conectando ao banco...")
    db = Database(DATABASE_URL)
    db.criar_tabelas()
    logger.info("Banco conectado.")

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=20))
    servicer = FreightAuctionServicer(db)
    freight_pb2_grpc.add_FreightAuctionServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{PORT}")
    server.start()
    logger.info("Servidor gRPC rodando na porta %d.", PORT)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Encerrando servidor...")
        server.stop(grace=5)


if __name__ == "__main__":
    serve()
