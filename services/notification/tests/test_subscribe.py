
import json
import queue
import threading
import time

import fakeredis
import pytest

import notification_pb2
import notification_pb2_grpc


# Simula grpc.ServicerContext: ativo ate receive_stop() ser chamado.
class FakeContext:
    def __init__(self):
        self._active = True

    def is_active(self) -> bool:
        return self._active

    def receive_stop(self):
        self._active = False


# ── Fixtures: FakeServer compartilhado + servicer patchado ───────────────────

@pytest.fixture()
def fake_server():
    return fakeredis.FakeServer()


@pytest.fixture()
def pub_redis(fake_server):
    return fakeredis.FakeStrictRedis(server=fake_server)


@pytest.fixture()
def servicer(fake_server, monkeypatch):
    import server as srv
    monkeypatch.setattr(
        "server.redis.from_url",
        lambda url: fakeredis.FakeStrictRedis(server=fake_server),
    )
    return srv.NotificationServicer("redis://fake")


EVENTO_BASE = {
    "menor_lance": 8500.0,
    "transportadora_lider": "fretelog_sp",
    "timestamp": 1_700_000_000,
    "encerrado": False,
    "mensagem": "Lance registrado",
    "tempo_restante_s": 300,
}


def _publish(pub_redis, leilao_id: int, extra: dict | None = None):
    evento = {**EVENTO_BASE, "leilao_id": leilao_id, **(extra or {})}
    pub_redis.publish(f"leilao:{leilao_id}", json.dumps(evento))
    return evento


def subscribe_thread(servicer, leilao_id: int, transportadora_id: str,
                     max_items: int = 1) -> tuple[queue.Queue, FakeContext]:
    ctx = FakeContext()
    result_q: queue.Queue = queue.Queue()
    request = notification_pb2.SubscriptionRequest(
        leilao_id=leilao_id,
        transportadora_id=transportadora_id,
    )

    def _run():
        remaining = max_items
        try:
            for update in servicer.SubscribeUpdates(request, ctx):
                result_q.put(update)
                remaining -= 1
                if remaining <= 0:
                    ctx.receive_stop()
                    return
        except Exception as exc:  # noqa: BLE001
            result_q.put(exc)
        finally:
            ctx.receive_stop()

    threading.Thread(target=_run, daemon=True).start()
    return result_q, ctx


# ── Entrega do evento ────────────────────────────────────────────────────────

@pytest.mark.timeout(5)
def test_subscribe_recebe_auction_update(servicer, pub_redis, record_property):
    """Streaming gRPC: assinante de leilão:42 recebe o AuctionUpdate correto."""
    result_q, _ = subscribe_thread(servicer, 42, "transportadora_x")

    time.sleep(0.15)
    _publish(pub_redis, 42)

    update = result_q.get(timeout=4)
    assert not isinstance(update, Exception), f"Excecao no subscriber: {update}"
    assert isinstance(update, notification_pb2.AuctionUpdate)
    assert update.leilao_id == 42
    assert abs(update.menor_lance - 8500.0) < 0.01
    assert update.transportadora_lider == "fretelog_sp"
    assert update.encerrado is False
    assert update.tempo_restante_s == 300
    record_property("info", "AuctionUpdate do leilão:42 entregue via streaming")
    record_property("viz", "flow:Redis>Streaming>Assinante")


@pytest.mark.timeout(5)
def test_subscribe_entrega_flag_encerrado(servicer, pub_redis):
    """Streaming gRPC: a flag encerrado=True chega intacta ao assinante."""
    result_q, _ = subscribe_thread(servicer, 99, "trans_final")

    time.sleep(0.15)
    _publish(pub_redis, 99, {"encerrado": True, "mensagem": "Leilao encerrado"})

    update = result_q.get(timeout=4)
    assert not isinstance(update, Exception)
    assert update.encerrado is True
    assert update.leilao_id == 99


# ── Isolamento entre leiloes ─────────────────────────────────────────────────

@pytest.mark.timeout(5)
def test_isolamento_leilao_a_nao_chega_em_b(fake_server, pub_redis, monkeypatch, record_property):
    """Isolamento gRPC: evento do leilão:1 não vaza para quem assina leilão:2."""
    import server as srv
    monkeypatch.setattr(
        "server.redis.from_url",
        lambda url: fakeredis.FakeStrictRedis(server=fake_server),
    )
    servicer_b = srv.NotificationServicer("redis://fake")

    result_q, ctx = subscribe_thread(servicer_b, 2, "trans_b")

    time.sleep(0.15)
    _publish(pub_redis, 1)  # publica no leilao 1

    time.sleep(0.5)  # da tempo de vazar, caso houvesse bug
    ctx.receive_stop()

    assert result_q.empty(), "Evento do leilao 1 vazou para o assinante do leilao 2"
    record_property("info", "evento de outro leilao NAO vazou (isolado)")
    record_property("viz", "checks:assina leilão 2=ok;evento leilão 1 isolado=ok")


# ── Multiplos eventos ────────────────────────────────────────────────────────

@pytest.mark.timeout(5)
def test_subscribe_recebe_multiplos_eventos(servicer, pub_redis, record_property):
    """Streaming gRPC: eventos em sequência chegam todos e na ordem correta."""
    result_q, _ = subscribe_thread(servicer, 7, "trans_multi", max_items=3)

    time.sleep(0.15)
    for valor in [9000, 8000, 7000]:
        _publish(pub_redis, 7, {"menor_lance": float(valor)})
        time.sleep(0.05)

    updates = []
    for _ in range(3):
        try:
            u = result_q.get(timeout=3)
            assert not isinstance(u, Exception)
            updates.append(u)
        except queue.Empty:
            break

    assert len(updates) == 3
    lances = [u.menor_lance for u in updates]
    assert abs(lances[0] - 9000) < 1
    assert abs(lances[1] - 8000) < 1
    assert abs(lances[2] - 7000) < 1
    record_property("info", f"{len(updates)} eventos entregues na ordem")
    record_property("viz", "seq:9000,8000,7000")
