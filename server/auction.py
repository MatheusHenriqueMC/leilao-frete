"""
Estado em memória de um leilão individual (protegido por Lock).
O Lock é a fonte de verdade para concorrência; persistência ocorre fora dele.
"""

import threading
import time
import logging
from dataclasses import dataclass

from server.database import Database

logger = logging.getLogger(__name__)


@dataclass
class Lance:
    valor: float
    transportadora_id: str
    timestamp_ms: int


class AuctionState:
    """Estado centralizado de UM leilão reverso."""

    def __init__(
        self,
        leilao_id: int,
        titulo: str,
        descricao_carga: str,
        especificacoes: str,
        valor_inicial: float,
        join_code: str,
        tempo_total_s: int,
        db: Database,
        thumbnail: str = "",
        created_at: str = "",
    ):
        self.leilao_id = leilao_id
        self.titulo = titulo
        self.descricao_carga = descricao_carga
        self.especificacoes = especificacoes
        self.valor_inicial = valor_inicial
        self.join_code = join_code
        self.tempo_total_s = tempo_total_s  # 0 = sem timer
        self.thumbnail = thumbnail
        self.created_at = created_at
        self._db = db

        # Timer
        self._inicio_ms: int = int(time.time() * 1000)

        # Estado (protegido pelo lock)
        self.menor_lance: Lance | None = None
        self.historico_lances: list[Lance] = []
        self.participantes: set[str] = set()
        self.encerrado: bool = False

        self._lock = threading.Lock()

    # ── Tempo Restante ─────────────────────────────────────────────────────────

    def tempo_restante_s(self) -> int:
        if not self.tempo_total_s:
            return 0
        decorrido = (int(time.time() * 1000) - self._inicio_ms) / 1000
        return max(0, int(self.tempo_total_s - decorrido))

    # ── Lance ──────────────────────────────────────────────────────────────────

    def registrar_lance(self, valor: float, transportadora_id: str) -> tuple[bool, str, float]:
        lance_para_persistir = None

        with self._lock:
            if self.encerrado:
                atual = self.menor_lance.valor if self.menor_lance else self.valor_inicial
                return False, "Leilão encerrado.", atual

            if valor <= 0:
                atual = self.menor_lance.valor if self.menor_lance else self.valor_inicial
                return False, "Valor deve ser positivo.", atual

            if not transportadora_id or not transportadora_id.strip():
                atual = self.menor_lance.valor if self.menor_lance else self.valor_inicial
                return False, "ID da transportadora não pode ser vazio.", atual

            teto = self.menor_lance.valor if self.menor_lance else self.valor_inicial
            if valor >= teto:
                return False, f"Lance deve ser menor que {teto:.2f}.", teto

            timestamp_ms = int(time.time() * 1000)
            novo = Lance(valor=valor, transportadora_id=transportadora_id, timestamp_ms=timestamp_ms)
            self.menor_lance = novo
            self.historico_lances.append(novo)
            lance_para_persistir = novo

        if lance_para_persistir:
            try:
                self._db.registrar_lance(
                    leilao_id=self.leilao_id,
                    valor=lance_para_persistir.valor,
                    transportadora_id=lance_para_persistir.transportadora_id,
                    timestamp_ms=lance_para_persistir.timestamp_ms,
                )
            except Exception as e:
                logger.error("Erro ao persistir lance: %s", e)

        return True, "Lance registrado com sucesso!", lance_para_persistir.valor

    # ── Status / Histórico ─────────────────────────────────────────────────────

    def obter_status(self) -> dict:
        with self._lock:
            base = {
                "leilao_id": self.leilao_id,
                "titulo": self.titulo,
                "descricao_carga": self.descricao_carga,
                "especificacoes": self.especificacoes,
                "valor_inicial": self.valor_inicial,
                "join_code": self.join_code,
                "total_lances": len(self.historico_lances),
                "encerrado": self.encerrado,
                "tempo_restante_s": self.tempo_restante_s(),
                "tempo_total_s": self.tempo_total_s,
            }
            if self.menor_lance:
                base.update({
                    "menor_lance": self.menor_lance.valor,
                    "transportadora_lider": self.menor_lance.transportadora_id,
                    "timestamp_ms": self.menor_lance.timestamp_ms,
                })
            else:
                base.update({
                    "menor_lance": self.valor_inicial,
                    "transportadora_lider": "",
                    "timestamp_ms": 0,
                })
            return base

    def obter_historico(self) -> list[dict]:
        with self._lock:
            return [
                {
                    "valor": l.valor,
                    "transportadora_id": l.transportadora_id,
                    "timestamp_ms": l.timestamp_ms,
                }
                for l in self.historico_lances
            ]

    # ── Encerramento ───────────────────────────────────────────────────────────

    def encerrar_leilao(self) -> dict:
        with self._lock:
            self.encerrado = True
            if self.menor_lance:
                resultado = {
                    "teve_vencedor": True,
                    "vencedor_id": self.menor_lance.transportadora_id,
                    "valor_final": self.menor_lance.valor,
                    "timestamp_ms": self.menor_lance.timestamp_ms,
                    "total_lances": len(self.historico_lances),
                }
            else:
                resultado = {
                    "teve_vencedor": False,
                    "vencedor_id": "",
                    "valor_final": self.valor_inicial,
                    "timestamp_ms": 0,
                    "total_lances": 0,
                }

        try:
            self._db.encerrar_leilao(
                leilao_id=self.leilao_id,
                vencedor_id=resultado["vencedor_id"] if resultado["teve_vencedor"] else None,
                valor_final=resultado["valor_final"] if resultado["teve_vencedor"] else None,
            )
        except Exception as e:
            logger.error("Erro ao persistir encerramento: %s", e)

        return resultado

    # ── Participantes ──────────────────────────────────────────────────────────

    def adicionar_participante(self, tid: str):
        with self._lock:
            self.participantes.add(tid)

    def remover_participante(self, tid: str):
        with self._lock:
            self.participantes.discard(tid)
