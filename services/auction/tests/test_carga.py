"""
Teste de carga do Lock sob alto volume de lances concorrentes.
Estressa o nucleo de sincronizacao (AuctionState._lock) com 50 workers
disparando 2500 lances no total, usando Barrier para maximizar a corrida.
"""

import time

from helpers import novo_estado, run_concurrent


# ── Teste de carga ────────────────────────────────────────────────────────────

def test_carga_lock_alto_volume(record_property):
    """Carga: 50 workers e 2500 lances simultâneos sem lost update no lock."""

    NUM_WORKERS = 50
    LANCES_POR_WORKER = 50
    VALOR_BASE = 99_000.0

    state = novo_estado(valor_inicial=100_000.0, leilao_id=99)

    def worker(worker_id: int):
        resultados = []
        for i in range(LANCES_POR_WORKER):
            valor = VALOR_BASE - (worker_id * LANCES_POR_WORKER + i) * 1.0
            if valor <= 0:
                break
            ok, _, _ = state.registrar_lance(valor, f"transp_{worker_id}")
            resultados.append((ok, valor))
        return resultados

    inicio = time.time()
    listas = run_concurrent(worker, NUM_WORKERS)
    duracao = time.time() - inicio

    # Achata lista de listas em lista plana de (ok, valor)
    resultados = [item for sublista in listas for item in sublista]
    aceitos = [r for r in resultados if r[0]]
    rejeitados = [r for r in resultados if not r[0]]

    throughput = len(resultados) / duracao if duracao > 0 else 0
    record_property("info", f"{len(resultados)} lances -> {len(aceitos)} aceitos | throughput {throughput:.0f}/s")
    record_property("viz", f"ratio:{len(aceitos)}:{len(rejeitados)}:aceitos:rejeitados")

    if duracao > 0:
        print(f"\n  throughput: {throughput:.0f} tentativas/s"
              f"  aceitos={len(aceitos)}  rejeitados={len(rejeitados)}"
              f"  tempo={duracao:.3f}s")

    # ── Invariantes de consistencia ───────────────────────────────────────────

    # 1. Sem lost update: lances aceitos batem exatamente com o historico.
    assert len(aceitos) == len(state.historico_lances), (
        f"Lost update detectado: aceitos={len(aceitos)} historico={len(state.historico_lances)}"
    )

    # 2. menor_lance.valor e o menor valor entre os aceitos.
    if state.menor_lance:
        assert state.menor_lance.valor == min(r[1] for r in aceitos), (
            "menor_lance diverge do minimo real dos aceitos"
        )

    # 3. Historico monotonicamente decrescente (ordem total garantida pelo lock).
    historico_valores = [l.valor for l in state.historico_lances]
    for i in range(1, len(historico_valores)):
        assert historico_valores[i] < historico_valores[i - 1], (
            f"Ordem violada na posicao {i}: "
            f"{historico_valores[i]} nao e menor que {historico_valores[i-1]}"
        )

    # 4. Primeiro aceito e o maior do historico; ultimo e o menor.
    if len(historico_valores) >= 2:
        assert historico_valores[-1] < historico_valores[0], (
            "Primeiro aceito nao e o maior: ordenacao invalida"
        )
