"""
Broadcast de atualizacoes de leilao para os inscritos (server streaming).

Encapsula o registro de inscritos e o envio de eventos. Hoje usa filas em
memoria (uma por inscrito). Na missao 4 (Redis pub/sub), a implementacao
interna sera trocada por Redis sem mudar a interface usada pelo servicer.
"""

import queue
import threading
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)


class Notifier:
    def __init__(self):
        self._subscribers: dict[int, list[queue.Queue]] = defaultdict(list)
        self._lock = threading.Lock()

    def subscribe(self, leilao_id: int) -> queue.Queue:
        """Registra um inscrito no leilao e devolve a fila por onde ele recebe eventos."""
        fila: queue.Queue = queue.Queue()
        with self._lock:
            self._subscribers[leilao_id].append(fila)
        return fila

    def unsubscribe(self, leilao_id: int, fila: queue.Queue):
        with self._lock:
            lista = self._subscribers.get(leilao_id, [])
            if fila in lista:
                lista.remove(fila)

    def publish(self, leilao_id: int, evento: dict) -> int:
        """Envia um evento (dict) para todos os inscritos do leilao. Retorna quantos."""
        with self._lock:
            filas = list(self._subscribers.get(leilao_id, []))
        for f in filas:
            f.put(evento)
        logger.info("Notificados %d subscriber(s) do leilão %d.", len(filas), leilao_id)
        return len(filas)
