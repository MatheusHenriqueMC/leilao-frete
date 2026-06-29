"""
Testes unitarios do Notifier (pub/sub com fakeredis): publica no canal correto
e mantem o isolamento entre leiloes.

Nota de implementacao: nesta versao do fakeredis, publisher e subscriber so
enxergam as mesmas mensagens se compartilharem um FakeServer. Por isso o helper
_setup monta o Notifier e o assinante sobre o mesmo servidor em memoria, e
_collect_one escuta listen() numa thread para receber o evento.
"""

import json
import queue
import threading
import time

import fakeredis
import pytest

from notifier import Notifier


EVENTO_BASE = {
    "menor_lance": 9_000,
    "transportadora_lider": "sp_log",
    "timestamp": 1_000_000,
    "encerrado": False,
    "mensagem": "Lance registrado",
    "tempo_restante_s": 120,
}


# Helper: cria FakeServer + Notifier + N assinantes, todos no mesmo bus.
def _setup(monkeypatch, n_subs: int = 1):
    server = fakeredis.FakeServer()
    monkeypatch.setattr(
        "notifier.redis.from_url",
        lambda url: fakeredis.FakeStrictRedis(server=server),
    )
    n = Notifier("redis://fake")
    subs = [fakeredis.FakeStrictRedis(server=server) for _ in range(n_subs)]
    return (n, *subs)


# Helper: escuta o pubsub numa thread e devolve a primeira mensagem real.
def _collect_one(pubsub, timeout: float = 2.0):
    q: queue.Queue = queue.Queue()

    def _run():
        for msg in pubsub.listen():
            if msg["type"] == "message":
                q.put(msg)
                return

    threading.Thread(target=_run, daemon=True).start()
    try:
        return q.get(timeout=timeout)
    except queue.Empty:
        return None


# ── Pub/sub no canal correto ─────────────────────────────────────────────────

def test_publica_no_canal_do_leilao(monkeypatch, record_property):
    """Pub/sub: evento publicado em leilão:7 chega ao assinante do canal certo."""
    # Evento publicado em leilao:7 chega ao assinante de leilao:7.
    n, sub = _setup(monkeypatch)
    ps = sub.pubsub(ignore_subscribe_messages=True)
    ps.subscribe("leilao:7")

    n.publish(7, {**EVENTO_BASE, "leilao_id": 7})

    msg = _collect_one(ps)
    assert msg is not None, "Nenhuma mensagem recebida no canal leilao:7"
    dados = json.loads(msg["data"])
    assert dados["menor_lance"] == 9_000
    assert dados["leilao_id"] == 7
    record_property("info", "evento publicado em leilão:7 entregue ao assinante")
    record_property("viz", "flow:Auction>Redis>Assinante")


def test_publish_retorna_numero_de_receptores(monkeypatch, record_property):
    """Pub/sub: publish retorna o número de assinantes que receberam o evento."""
    # publish retorna quantos assinantes receberam o evento.
    n, sub = _setup(monkeypatch)
    ps = sub.pubsub(ignore_subscribe_messages=True)
    ps.subscribe("leilao:3")
    time.sleep(0.05)  # garante o subscribe processado antes de publicar

    receptores = n.publish(3, {**EVENTO_BASE, "leilao_id": 3})
    assert receptores == 1
    record_property("info", f"publish retornou {receptores} receptor(es)")
    record_property("viz", f"flow:Publish>Canal>{receptores} sub")


def test_publish_encerrado_carrega_flag(monkeypatch):
    """Pub/sub: a flag encerrado=True viaja intacta no evento publicado."""
    # A flag encerrado=True viaja intacta no evento.
    n, sub = _setup(monkeypatch)
    ps = sub.pubsub(ignore_subscribe_messages=True)
    ps.subscribe("leilao:5")

    n.publish(5, {**EVENTO_BASE, "leilao_id": 5, "encerrado": True})

    msg = _collect_one(ps)
    assert msg is not None
    assert json.loads(msg["data"])["encerrado"] is True


# ── Isolamento entre leiloes ─────────────────────────────────────────────────

def test_isolamento_entre_leiloes(monkeypatch, record_property):
    """Isolamento: quem assina leilão:1 não recebe evento do leilão:2."""
    # Quem assina leilao:1 nao recebe evento publicado em leilao:2.
    n, sub = _setup(monkeypatch)
    ps = sub.pubsub(ignore_subscribe_messages=True)
    ps.subscribe("leilao:1")

    n.publish(2, {**EVENTO_BASE, "leilao_id": 2})

    msg = _collect_one(ps, timeout=0.5)
    assert msg is None, "Evento do leilao 2 vazou para o assinante do leilao 1"
    record_property("info", "evento de outro leilao NAO vazou (isolado)")
    record_property("viz", "checks:assinante leilão 1=ok;evento leilão 2 isolado=ok")


def test_assinante_recebe_proprio_canal_mas_nao_outro(monkeypatch):
    """Isolamento: dois assinantes em canais distintos só veem o próprio."""
    # Dois assinantes, canais distintos: cada um so ve o seu.
    n, sub1, sub2 = _setup(monkeypatch, n_subs=2)

    ps1 = sub1.pubsub(ignore_subscribe_messages=True)
    ps2 = sub2.pubsub(ignore_subscribe_messages=True)
    ps1.subscribe("leilao:10")
    ps2.subscribe("leilao:20")

    n.publish(10, {**EVENTO_BASE, "leilao_id": 10})

    msg1 = _collect_one(ps1)
    assert msg1 is not None
    assert json.loads(msg1["data"])["leilao_id"] == 10

    msg2 = _collect_one(ps2, timeout=0.5)
    assert msg2 is None
