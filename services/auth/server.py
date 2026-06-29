"""
auth-service: servidor gRPC de autenticacao e contas de transportadora.
"""

import sys
import os
import logging
from concurrent import futures

from dotenv import load_dotenv
import grpc

load_dotenv()

# Stubs gerados ficam em ./generated (gerados no build); adiciona ao path.
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))

import auth_pb2
import auth_pb2_grpc
from database import Database

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] AUTH %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.environ.get("AUTH_PORT", "50052"))
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/freight_auction",
)
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")


class AuthServicer(auth_pb2_grpc.AuthServiceServicer):

    def __init__(self, db: Database):
        self._db = db

    def Login(self, request, _context):
        username = request.username.strip()
        password = request.password.strip()

        if not username:
            return auth_pb2.LoginResponse(sucesso=False, role="",
                                          mensagem="Nome não pode ser vazio.")

        # Admin (credenciais fixas via env)
        if username == ADMIN_USERNAME:
            if password == ADMIN_PASSWORD:
                return auth_pb2.LoginResponse(sucesso=True, role="admin",
                                              mensagem="Login de administrador realizado.")
            return auth_pb2.LoginResponse(sucesso=False, role="",
                                          mensagem="Senha de administrador incorreta.")

        # Transportadora cadastrada
        if self._db.validar_transportadora(username, password):
            return auth_pb2.LoginResponse(sucesso=True, role="transportadora",
                                          mensagem=f"Bem-vindo, {username}!")

        return auth_pb2.LoginResponse(sucesso=False, role="",
                                      mensagem="Usuário ou senha incorretos.")

    def CreateCarrier(self, request, _context):
        sucesso, mensagem = self._db.criar_transportadora(
            username=request.username.strip(),
            password=request.password,
            cnpj=request.cnpj.strip(),
            email=request.email.strip(),
            telefone=request.telefone.strip(),
        )
        return auth_pb2.CreateCarrierResponse(sucesso=sucesso, mensagem=mensagem)

    def GetCarrier(self, request, _context):
        dados = self._db.buscar_transportadora(request.username.strip())
        if not dados:
            return auth_pb2.GetCarrierResponse(encontrado=False)
        return auth_pb2.GetCarrierResponse(
            encontrado=True,
            username=dados["username"],
            cnpj=dados["cnpj"],
            email=dados["email"],
            telefone=dados["telefone"],
        )


def serve():
    logger.info("Conectando ao banco...")
    db = Database(DATABASE_URL)
    db.criar_tabelas()
    logger.info("Banco conectado.")

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    auth_pb2_grpc.add_AuthServiceServicer_to_server(AuthServicer(db), server)
    server.add_insecure_port(f"[::]:{PORT}")
    server.start()
    logger.info("Auth-service gRPC rodando na porta %d.", PORT)

    try:
        server.wait_for_termination()
    except KeyboardInterrupt:
        logger.info("Encerrando auth-service...")
        server.stop(grace=5)


if __name__ == "__main__":
    serve()
