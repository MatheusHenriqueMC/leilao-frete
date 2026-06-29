
import pytest

from database import Database
import auth_server  # carregado pelo conftest.py via importlib com path absoluto


class FakeRequest:
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password


# ── Login RPC ─────────────────────────────────────────────────────────────────

def test_login(record_property):
    """Login: transportadora e admin válidos logam; credencial inválida falha."""
    db = Database("sqlite:///:memory:")
    db.criar_tabelas()
    servicer = auth_server.AuthServicer(db)

    # 1. transportadora cadastrada
    db.criar_transportadora("logsp", "senha123")
    resp = servicer.Login(FakeRequest("logsp", "senha123"), None)
    assert resp.sucesso is True
    assert resp.role == "transportadora"

    # 2. admin com senha correta
    resp = servicer.Login(FakeRequest("admin", "admin123"), None)
    assert resp.sucesso is True
    assert resp.role == "admin"

    # 3. usuario inexistente
    resp = servicer.Login(FakeRequest("fantasma", "qualquer"), None)
    assert resp.sucesso is False
    assert resp.role == ""
    record_property("info", "transportadora e admin logaram; inexistente rejeitado")
    record_property("viz", "checks:transportadora=ok;admin=ok;inexistente rejeitado=ok")
