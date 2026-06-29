import os
import sys
import threading

_auction_root = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
if _auction_root not in sys.path:
    sys.path.insert(0, _auction_root)

from state import AuctionState  # noqa: E402


# ── Stub de banco (no-op) ────────────────────────────────────────────────────

class FakeDB:
    def registrar_lance(self, **kw):
        pass

    def encerrar_leilao(self, **kw):
        pass


# ── Factory: estado limpo por teste ─────────────────────────────────────────

def novo_estado(valor_inicial: float = 10_000.0, leilao_id: int = 1) -> AuctionState:
    return AuctionState(
        leilao_id=leilao_id,
        titulo="Teste",
        descricao_carga="Carga de teste",
        especificacoes="",
        valor_inicial=valor_inicial,
        join_code="ABC123",
        tempo_total_s=0,
        db=FakeDB(),
    )


# ── Helper de concorrencia ───────────────────────────────────────────────────

def run_concurrent(fn, n_threads: int) -> list:
    """
    Dispara n_threads threads e devolve a lista de resultados retornados por fn(thread_index).
    """
    barrier = threading.Barrier(n_threads)
    resultados = []
    lock = threading.Lock()

    def wrapper(idx):
        barrier.wait()
        resultado = fn(idx)
        with lock:
            resultados.append(resultado)

    threads = [threading.Thread(target=wrapper, args=(i,)) for i in range(n_threads)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return resultados
