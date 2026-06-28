"""
Persistencia do auth-service: contas de transportadora (tabela transportadoras).
"""

from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class Transportadora(Base):
    """Conta de transportadora cadastrada pelo admin."""
    __tablename__ = "transportadoras"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    username   = Column(String, unique=True, nullable=False)
    password   = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Database:
    def __init__(self, database_url: str):
        self.engine = create_engine(database_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def criar_tabelas(self):
        Base.metadata.create_all(self.engine)

    def criar_transportadora(self, username: str, password: str) -> tuple[bool, str]:
        """Cria conta de transportadora. Retorna (sucesso, mensagem)."""
        with self.SessionLocal() as session:
            existe = session.query(Transportadora).filter_by(username=username).first()
            if existe:
                return False, f"Usuário '{username}' já existe."
            session.add(Transportadora(username=username, password=password))
            session.commit()
            return True, f"Transportadora '{username}' criada com sucesso."

    def validar_transportadora(self, username: str, password: str) -> bool:
        """Verifica se username+password batem com uma transportadora cadastrada."""
        with self.SessionLocal() as session:
            t = session.query(Transportadora).filter_by(username=username).first()
            return t is not None and t.password == password
