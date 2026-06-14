"""
servidor gRPC

esqueleto funcional:
- sobe na porta 50051 com ThreadPoolExecutor
- registra o serviço FreightAuction
- responde a conexões de teste com implementações básicas
- usa AuctionState para gerenciar o estado em memória com Lock
"""

import sys
import os
import logging
from concurrent import futures

import grpc

# Adiciona o diretório raiz e generated/ ao path para imports funcionarem
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
    O AuctionState interno usa Lock para sincronizar o acesso.
    """

    def __init__(self):
        self.state = AuctionState(
            descricao_carga=DESCRICAO_CARGA,
            valor_inicial=VALOR_INICIAL,
        )
        # Lista de filas para notificar clientes inscritos via stream
        self._subscribers = []
        self._subscribers_lock = __import__("threading").Lock()
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
            self._notificar_subscribers(menor_lance, request.transportadora_id)
        else:
            logger.info("Lance rejeitado: %s", mensagem)

        return freight_pb2.BidResponse(
            aceito=aceito,
            menor_lance_atual=menor_lance,
            mensagem=mensagem,
        )

    def GetStatus(self, request, context):
        """retorna o estado atual do leilão"""
        status = self.state.obter_status()
        logger.info("Status solicitado. Menor lance: R$ %.2f", status["menor_lance"])

        return freight_pb2.StatusResponse(
            menor_lance=status["menor_lance"],
            transportadora_lider=status["transportadora_lider"],
            timestamp=status["timestamp_ms"],
            total_lances=status["total_lances"],
        )

    def SubscribeUpdates(self, request, context):
        """
        stream de notificações mantém conexão aberta e envia
        AuctionUpdate toda vez que um novo menor lance é registrado.
        """
        import queue

        transportadora_id = request.transportadora_id
        logger.info("Transportadora '%s' inscrita para atualizações.", transportadora_id)

        self.state.adicionar_participante(transportadora_id)

        # Fila individual deste cliente — recebe updates do _notificar_subscribers
        fila = queue.Queue()

        with self._subscribers_lock:
            self._subscribers.append(fila)

        try:
            while context.is_active():
                try:
                    update = fila.get(timeout=1.0)
                    yield update
                except queue.Empty:
                    continue
        finally:
            with self._subscribers_lock:
                self._subscribers.remove(fila)
            self.state.remover_participante(transportadora_id)
            logger.info("Transportadora '%s' desconectou.", transportadora_id)

    def _notificar_subscribers(self, menor_lance, transportadora_lider):
        """Envia AuctionUpdate para todos os clientes inscritos."""
        import time

        update = freight_pb2.AuctionUpdate(
            menor_lance=menor_lance,
            transportadora_lider=transportadora_lider,
            timestamp=int(time.time() * 1000),
        )

        with self._subscribers_lock:
            for fila in self._subscribers:
                fila.put(update)

        logger.info(
            "Notificação enviada para %d participante(s).", len(self._subscribers)
        )


def serve():
    """Inicializa e executa o servidor gRPC."""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    servicer = FreightAuctionServicer()
    freight_pb2_grpc.add_FreightAuctionServicer_to_server(servicer, server)

    server.add_insecure_port(f"[::]:{PORT}")
    server.start()

    logger.info("Servidor rodando na porta %d. Ctrl+C para parar.", PORT)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Encerrando servidor...")
        server.stop(grace=5)


if __name__ == "__main__":
    serve()