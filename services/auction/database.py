"""
Persistencia do auction-service: leiloes e lances (tabelas leiloes e lances).
"""

import json
import secrets
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine, Column, Integer, Float, String, Text,
    Boolean, DateTime, BigInteger, ForeignKey,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

Base = declarative_base()


class Leilao(Base):
    __tablename__ = "leiloes"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    titulo         = Column(String, nullable=False, default="Leilão de Frete")
    descricao_carga = Column(String, nullable=False)
    especificacoes = Column(String, nullable=True)
    valor_inicial  = Column(Float, nullable=False)
    join_code      = Column(String(6), unique=True, nullable=False)
    tempo_segundos = Column(Integer, default=0)
    encerrado      = Column(Boolean, default=False)
    vencedor_id    = Column(String, nullable=True)
    valor_final    = Column(Float, nullable=True)
    imagens        = Column(Text, nullable=True)   # JSON list of base64 data URLs
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at       = Column(DateTime, nullable=True)

    lances = relationship("Lance", back_populates="leilao", order_by="Lance.timestamp_ms")


class Lance(Base):
    __tablename__ = "lances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    leilao_id = Column(Integer, ForeignKey("leiloes.id"), nullable=False)
    valor = Column(Float, nullable=False)
    transportadora_id = Column(String, nullable=False)
    timestamp_ms = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    leilao = relationship("Leilao", back_populates="lances")


class Database:
    def __init__(self, database_url: str):
        self.engine = create_engine(database_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def criar_tabelas(self):
        Base.metadata.create_all(self.engine)

    # ── Join Code ──────────────────────────────────────────────────────────────

    def _gerar_join_code_unico(self, session) -> str:
        """Gera um codigo de 6 chars hex maiusculos garantidamente unico."""
        while True:
            code = secrets.token_hex(3).upper()
            existe = session.query(Leilao).filter_by(join_code=code).first()
            if not existe:
                return code

    # ── Criacao ────────────────────────────────────────────────────────────────

    def criar_leilao(
        self,
        titulo: str,
        descricao_carga: str,
        valor_inicial: float,
        especificacoes: str = "",
        tempo_segundos: int = 0,
        imagens: list[str] | None = None,
    ) -> tuple[int, str]:
        """Cria um leilao e retorna (leilao_id, join_code)."""
        with self.SessionLocal() as session:
            code = self._gerar_join_code_unico(session)
            leilao = Leilao(
                titulo=titulo,
                descricao_carga=descricao_carga,
                especificacoes=especificacoes or "",
                valor_inicial=valor_inicial,
                join_code=code,
                tempo_segundos=tempo_segundos,
                imagens=json.dumps(imagens or []),
            )
            session.add(leilao)
            session.commit()
            return leilao.id, code

    # ── Lances ─────────────────────────────────────────────────────────────────

    def registrar_lance(
        self, leilao_id: int, valor: float, transportadora_id: str, timestamp_ms: int
    ) -> int:
        with self.SessionLocal() as session:
            lance = Lance(
                leilao_id=leilao_id,
                valor=valor,
                transportadora_id=transportadora_id,
                timestamp_ms=timestamp_ms,
            )
            session.add(lance)
            session.commit()
            return lance.id

    # ── Encerramento ───────────────────────────────────────────────────────────

    def encerrar_leilao(
        self, leilao_id: int, vencedor_id: str | None, valor_final: float | None
    ):
        with self.SessionLocal() as session:
            leilao = session.get(Leilao, leilao_id)
            if leilao:
                leilao.encerrado = True
                leilao.vencedor_id = vencedor_id
                leilao.valor_final = valor_final
                leilao.ended_at = datetime.now(timezone.utc)
                session.commit()

    # ── Consultas ──────────────────────────────────────────────────────────────

    def listar_leiloes(self, apenas_ativos: bool = False) -> list[dict]:
        with self.SessionLocal() as session:
            q = session.query(Leilao).order_by(Leilao.created_at.desc())
            if apenas_ativos:
                q = q.filter(Leilao.encerrado == False)
            return [self._leilao_to_dict(l) for l in q.all()]

    def obter_leilao(self, leilao_id: int) -> dict | None:
        with self.SessionLocal() as session:
            l = session.get(Leilao, leilao_id)
            return self._leilao_to_dict(l) if l else None

    def obter_leilao_por_code(self, join_code: str) -> dict | None:
        with self.SessionLocal() as session:
            l = session.query(Leilao).filter_by(join_code=join_code.upper()).first()
            return self._leilao_to_dict(l) if l else None

    def obter_lances(self, leilao_id: int) -> list[dict]:
        with self.SessionLocal() as session:
            l = session.get(Leilao, leilao_id)
            if not l:
                return []
            return [
                {
                    "valor": lance.valor,
                    "transportadora_id": lance.transportadora_id,
                    "timestamp_ms": lance.timestamp_ms,
                }
                for lance in l.lances
            ]

    def historico_transportadora(self, transportadora_id: str) -> list[dict]:
        """Leiloes em que a transportadora participou (via lances)."""
        with self.SessionLocal() as session:
            lances = (
                session.query(Lance)
                .filter_by(transportadora_id=transportadora_id)
                .all()
            )
            ids_vistos: set[int] = set()
            resultado = []
            for lance in lances:
                if lance.leilao_id not in ids_vistos:
                    ids_vistos.add(lance.leilao_id)
                    l = session.get(Leilao, lance.leilao_id)
                    if l:
                        resultado.append(self._leilao_to_dict(l))
            return resultado

    # ── Helpers ────────────────────────────────────────────────────────────────

    @staticmethod
    def _leilao_to_dict(l: Leilao) -> dict:
        return {
            "id": l.id,
            "titulo": l.titulo,
            "descricao_carga": l.descricao_carga,
            "especificacoes": l.especificacoes or "",
            "valor_inicial": l.valor_inicial,
            "join_code": l.join_code,
            "tempo_segundos": l.tempo_segundos or 0,
            "encerrado": l.encerrado,
            "vencedor_id": l.vencedor_id or "",
            "valor_final": l.valor_final or 0.0,
            "total_lances": len(l.lances),
            "imagens": json.loads(l.imagens) if l.imagens else [],
            "created_at": l.created_at.isoformat() if l.created_at else "",
            "ended_at": l.ended_at.isoformat() if l.ended_at else "",
        }
