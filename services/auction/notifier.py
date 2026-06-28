"""
Publicacao de eventos de leilao no Redis (pub/sub).

Quando um lance e aceito (ou o leilao encerra), o auction-service publica um
evento no canal "leilao:<id>" do Redis. O notification-service assina esses
canais e entrega os eventos aos clientes via server streaming.

Desacoplamento: o auction-service nao conhece quem recebe; so publica. Isso
permite que a entrega das notificacoes viva em outro processo (microsservico).
"""

import json
import logging

import redis

logger = logging.getLogger(__name__)


class Notifier:
    def __init__(self, redis_url: str):
        self._redis = redis.from_url(redis_url)

    def canal(self, leilao_id: int) -> str:
        return f"leilao:{leilao_id}"

    def publish(self, leilao_id: int, evento: dict) -> int:
        """Publica um evento (dict) no canal do leilao. Retorna quantos receptores."""
        receptores = self._redis.publish(self.canal(leilao_id), json.dumps(evento))
        logger.info("Evento do leilão %d publicado no Redis (%d receptor(es)).",
                    leilao_id, receptores)
        return receptores
