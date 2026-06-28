"""
Teste essencial do auth-service: exercita o AuthServicer.Login real com
SQLite in-memory injetado. Cobre transportadora cadastrada, admin correto
e credencial invalida.
"""

import pytest

from database import Database
import auth_server  # carregado pelo conftest.py via importlib com path absoluto


# Simula o objeto request gRPC (Login usa apenas username/password).
class FakeRequest:
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password


# ── Login RPC ─────────────────────────────────────────────────────────────────

def test_login():
    """Login: transportadora e admin validos logam; credencial invalida falha."""
    # Banco isolado por teste, sem tocar em disco.
    db = Database("sqlite:///:memory:")
    db.criar_tabelas()
    servicer = auth_server.AuthServicer(db)

    # 1. Transportadora cadastrada: deve logar com role correta.
    db.criar_transportadora("logsp", "senha123")
    resp = servicer.Login(FakeRequest("logsp", "senha123"), None)
    assert resp.sucesso is True
    assert resp.role == "transportadora"

    # 2. Admin com senha correta (defaults admin/admin123 lidos do env).
    resp = servicer.Login(FakeRequest("admin", "admin123"), None)
    assert resp.sucesso is True
    assert resp.role == "admin"

    # 3. Usuario inexistente: deve falhar.
    resp = servicer.Login(FakeRequest("fantasma", "qualquer"), None)
    assert resp.sucesso is False
    assert resp.role == ""
