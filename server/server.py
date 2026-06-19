"""
Funcionalidades:
- Multicliente com ThreadPoolExecutor (10 workers)
- RPCs: PlaceBid, GetStatus, SubscribeUpdates
- Notificação em tempo real via server streaming
- Encerramento por timer configurável ou comando manual (ENCERRAR)
- Broadcast do vencedor para todos os participantes
"""

import sys
import os
import logging
import threading
import time
import queue
from concurrent import futures

import grpc

# Adiciona o diretório raiz e generated/ ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "generated"))

from generated import freight_pb2
from generated import freight_pb2_grpc
from server.auction import AuctionState

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Porta fixa do servidor
PORT = 50051

# Configuração da carga inicial do leilão
DESCRICAO_CARGA = "Carga de exemplo — 20 toneladas, São Paulo → Recife"
VALOR_INICIAL = 10000.00


class FreightAuctionServicer(freight_pb2_grpc.FreightAuctionServicer):
    """
    implementação do serviço FreightAuction.

    cada método RPC é chamado em uma thread separada pelo ThreadPoolExecutor.
    o AuctionState interno usa Lock para sincronizar o acesso.
    """

    def __init__(self):
        self.state = AuctionState(
            descricao_carga=DESCRICAO_CARGA,
            valor_inicial=VALOR_INICIAL,
        )
        # Lista de filas para notificar clientes inscritos via stream
        self._subscribers: list[queue.Queue] = []
        self._subscribers_lock = threading.Lock()
        logger.info(
            "Leilão iniciado: '%s' | Valor inicial: R$ %.2f",
            DESCRICAO_CARGA,
            VALOR_INICIAL,
        )

    def PlaceBid(self, request, context):
        """Processa um lance (BID <valor>)."""
        logger.info(
            "Lance recebido: R$ %.2f da transportadora '%s'",
            request.valor,
            request.transportadora_id,
        )

        aceito, mensagem, menor_lance = self.state.registrar_lance(
            valor=request.valor,
            transportadora_id=request.transportadora_id,
        )

        if aceito:
            logger.info("Lance aceito! Novo menor lance: R$ %.2f", menor_lance)
            self._notificar_subscribers(
                menor_lance=menor_lance,
                transportadora_lider=request.transportadora_id,
                encerrado=False,
                mensagem=f"Novo lance: R$ {menor_lance:.2f} por '{request.transportadora_id}'",
            )
        else:
            logger.info("Lance rejeitado: %s", mensagem)

        return freight_pb2.BidResponse(
            aceito=aceito,
            menor_lance_atual=menor_lance,
            mensagem=mensagem,
        )

    def GetStatus(self, request, context):
        """Retorna o estado atual do leilão (STATUS)."""
        status = self.state.obter_status()
        logger.info("Status solicitado. Menor lance: R$ %.2f", status["menor_lance"])

        return freight_pb2.StatusResponse(
            menor_lance=status["menor_lance"],
            transportadora_lider=status["transportadora_lider"],
            timestamp=status["timestamp_ms"],
            total_lances=status["total_lances"],
            encerrado=status["encerrado"],
        )

    def SubscribeUpdates(self, request, context):
        """
        stream de notificações — mantém conexão aberta e envia
        AuctionUpdate toda vez que um novo menor lance é registrado
        ou quando o leilão é encerrado.
        """
        transportadora_id = request.transportadora_id
        logger.info("Transportadora '%s' inscrita para atualizações.", transportadora_id)

        self.state.adicionar_participante(transportadora_id)

        # Fila individual deste cliente
        fila: queue.Queue = queue.Queue()

        with self._subscribers_lock:
            self._subscribers.append(fila)

        try:
            while context.is_active():
                try:
                    update = fila.get(timeout=1.0)
                    yield update
                    # Se o leilão foi encerrado, fecha o stream após enviar
                    if update.encerrado:
                        break
                except queue.Empty:
                    continue
        finally:
            with self._subscribers_lock:
                if fila in self._subscribers:
                    self._subscribers.remove(fila)
            self.state.remover_participante(transportadora_id)
            logger.info("Transportadora '%s' desconectou.", transportadora_id)

    def _notificar_subscribers(self, menor_lance, transportadora_lider, encerrado, mensagem):
        """Envia AuctionUpdate para todos os clientes inscritos."""
        update = freight_pb2.AuctionUpdate(
            menor_lance=menor_lance,
            transportadora_lider=transportadora_lider,
            timestamp=int(time.time() * 1000),
            encerrado=encerrado,
            mensagem=mensagem,
        )

        with self._subscribers_lock:
            for fila in self._subscribers:
                fila.put(update)

        logger.info(
            "Notificação enviada para %d participante(s).", len(self._subscribers)
        )

    def encerrar_leilao(self):
        """Encerra o leilão e notifica todos os participantes."""
        resultado = self.state.encerrar_leilao()

        if resultado["teve_vencedor"]:
            mensagem = (
                f"LEILÃO ENCERRADO! Vencedor: '{resultado['vencedor_id']}' "
                f"com R$ {resultado['valor_final']:.2f} "
                f"({resultado['total_lances']} lance(s) registrado(s))"
            )
            logger.info(
                "Leilão encerrado! Vencedor: '%s' com R$ %.2f (%d lances)",
                resultado["vencedor_id"],
                resultado["valor_final"],
                resultado["total_lances"],
            )
        else:
            mensagem = "LEILÃO ENCERRADO! Nenhum lance foi registrado."
            logger.info("Leilão encerrado sem lances.")

        # Notifica todos os participantes sobre o encerramento
        self._notificar_subscribers(
            menor_lance=resultado["valor_final"],
            transportadora_lider=resultado["vencedor_id"],
            encerrado=True,
            mensagem=mensagem,
        )

        return resultado


def input_thread(servicer, server):
    """
    thread que escuta comandos do operador do servidor no terminal.
    permite encerrar o leilão manualmente com ENCERRAR.
    """
    print("\n  Comandos do servidor:")
    print("  ENCERRAR  — Encerrar o leilão e anunciar vencedor")
    print("  QUIT      — Desligar o servidor\n")

    while True:
        try:
            comando = input().strip().upper()
        except (EOFError, KeyboardInterrupt):
            break

        if comando == "ENCERRAR":
            servicer.encerrar_leilao()

        elif comando == "QUIT":
            servicer.encerrar_leilao()
            logger.info("Desligando servidor...")
            server.stop(grace=5)
            break

        elif comando:
            print(f"  Comando desconhecido: '{comando}'. Use ENCERRAR ou QUIT.")


def timer_thread(servicer, duracao_segundos):
    """
    Thread que encerra o leilão automaticamente após a duração configurada.
    Mostra um countdown no log.
    """
    logger.info("Timer do leilão: %d segundos.", duracao_segundos)

    tempo_restante = duracao_segundos
    # Avisos em intervalos: a cada minuto, nos últimos 30s, 10s, 5, 3, 2, 1
    while tempo_restante > 0:
        if tempo_restante <= 5 or tempo_restante == 10 or tempo_restante == 30 or tempo_restante % 60 == 0:
            logger.info("Tempo restante: %d segundo(s)", tempo_restante)
        time.sleep(1)
        tempo_restante -= 1

        # Se já foi encerrado manualmente, sai
        if servicer.state.encerrado:
            return

    # Encerra automaticamente
    if not servicer.state.encerrado:
        logger.info("Tempo esgotado!")
        servicer.encerrar_leilao()


def serve():
    """Inicializa e executa o servidor gRPC."""
    # Pergunta a duração do leilão
    print("FREIGHT AUCTION — Servidor do Leilão")

    duracao_input = input(
        "Duração do leilão em segundos (ENTER para sem limite): "
    ).strip()

    duracao = None
    if duracao_input:
        try:
            duracao = int(duracao_input)
            if duracao <= 0:
                print("Duração deve ser positiva. Iniciando sem limite de tempo.")
                duracao = None
        except ValueError:
            print("Valor inválido. Iniciando sem limite de tempo.")
            duracao = None

    # Inicia o servidor gRPC
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    servicer = FreightAuctionServicer()
    freight_pb2_grpc.add_FreightAuctionServicer_to_server(servicer, server)

    server.add_insecure_port(f"[::]:{PORT}")
    server.start()

    logger.info("Servidor rodando na porta %d. Ctrl+C para parar.", PORT)

    if duracao:
        logger.info("Leilão será encerrado automaticamente em %d segundos.", duracao)

    # Inicia thread do timer (se configurado)
    if duracao:
        t_timer = threading.Thread(
            target=timer_thread,
            args=(servicer, duracao),
            daemon=True,
        )
        t_timer.start()

    # Inicia thread de comandos do servidor
    t_input = threading.Thread(
        target=input_thread,
        args=(servicer, server),
        daemon=True,
    )
    t_input.start()

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Encerrando servidor...")
        if not servicer.state.encerrado:
            servicer.encerrar_leilao()
        server.stop(grace=5)


if __name__ == "__main__":
    serve()