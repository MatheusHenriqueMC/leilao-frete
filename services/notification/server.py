"""
notification-service: entrega em tempo real (server streaming) os eventos de
leilao que o auction-service publica no Redis.

Cada chamada SubscribeUpdates assina o canal "leilao:<id>" no Redis (pub/sub) e
repassa cada evento recebido pelo stream gRPC. O servico nao tem estado de
leilao nem banco: so faz a ponte Redis -> streaming.
"""

import sys
import os
import json
import logging
from concurrent import futures

from dotenv import load_dotenv
import grpc
import redis

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))

import notification_pb2
import notification_pb2_grpc

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] NOTIFICATION %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.environ.get("NOTIFICATION_PORT", "50053"))
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")


class NotificationServicer(notification_pb2_grpc.NotificationServiceServicer):

    def __init__(self, redis_url: str):
        self._redis_url = redis_url

    def SubscribeUpdates(self, request, context):
        leilao_id = request.leilao_id
        tid = request.transportadora_id
        canal = f"leilao:{leilao_id}"

        r = redis.from_url(self._redis_url)
        pubsub = r.pubsub(ignore_subscribe_messages=True)
        pubsub.subscribe(canal)
        logger.info("'%s' assinou o canal %s.", tid, canal)

        try:
            while context.is_active():
                msg = pubsub.get_message(timeout=1.0)
                if not msg:
                    continue
                evento = json.loads(msg["data"])
                yield notification_pb2.AuctionUpdate(
                    menor_lance=evento["menor_lance"],
                    transportadora_lider=evento["transportadora_lider"],
                    timestamp=evento["timestamp"],
                    encerrado=evento["encerrado"],
                    mensagem=evento["mensagem"],
                    leilao_id=evento["leilao_id"],
                    tempo_restante_s=evento["tempo_restante_s"],
                )
                if evento["encerrado"]:
                    break
        finally:
            pubsub.close()
            logger.info("'%s' desassinou o canal %s.", tid, canal)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=20))
    notification_pb2_grpc.add_NotificationServiceServicer_to_server(
        NotificationServicer(REDIS_URL), server)
    server.add_insecure_port(f"[::]:{PORT}")
    server.start()
    logger.info("Notification-service gRPC rodando na porta %d.", PORT)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Encerrando notification-service...")
        server.stop(grace=5)


if __name__ == "__main__":
    serve()
