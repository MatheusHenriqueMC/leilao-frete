
import pytest

from helpers import novo_estado, run_concurrent


# ── Concorrencia ─────────────────────────────────────────────────────────────

def test_lances_iguais_so_um_vence(record_property):
    """Lances iguais simultâneos: o lock garante que só um vence."""
    N = 20
    for _ in range(100):  # repete para flagrar flakiness de race condition
        state = novo_estado()
        resultados = run_concurrent(lambda _: state.registrar_lance(9_500, "t"), N)
        aceitos = [ok for ok, _, _ in resultados]
        assert sum(aceitos) == 1, f"Esperado 1 aceito, obtido {sum(aceitos)}"
        assert len(state.historico_lances) == 1
    record_property("info", f"{N} threads simultâneas -> 1 aceito, {N - 1} rejeitados")
    record_property("viz", f"grid:{N}:{sum(aceitos)}")


def test_estresse_valores_variados(record_property):
    """Concorrência: lances variados simultâneos deixam o estado consistente."""
    N = 30
    state = novo_estado(valor_inicial=50_000.0)

    def lance(idx):
        valor = 49_000.0 - idx * 100
        ok, _, _ = state.registrar_lance(valor, f"transp_{idx}")
        return (ok, valor)

    resultados = run_concurrent(lance, N)
    aceitos = [r for r in resultados if r[0]]

    # Invariante: tudo que foi aceito esta no historico.
    assert len(aceitos) == len(state.historico_lances)
    # Invariante: o menor_lance e o menor valor aceito.
    if state.menor_lance:
        assert state.menor_lance.valor == min(r[1] for r in aceitos)
    record_property("info", f"{N} lances concorrentes -> {len(aceitos)} aceitos, estado consistente")
    record_property("viz", f"grid:{N}:{len(aceitos)}")


# ── Validacao do lance ───────────────────────────────────────────────────────

def test_primeiro_lance_igual_ao_inicial_rejeitado():
    """Validação: lance igual ao valor inicial é rejeitado."""
    state = novo_estado(valor_inicial=10_000)
    ok, msg, _ = state.registrar_lance(10_000, "a")
    assert ok is False
    assert "menor" in msg.lower() or "lance" in msg.lower()


def test_primeiro_lance_menor_que_inicial_aceito():
    """Validação: primeiro lance menor que o inicial é aceito."""
    state = novo_estado(valor_inicial=10_000)
    ok, _, _ = state.registrar_lance(9_000, "a")
    assert ok is True


def test_lance_igual_ao_teto_atual_rejeitado():
    """Validação: empatar com o menor lance atual é rejeitado."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(9_000, "a")
    ok, _, _ = state.registrar_lance(9_000, "b")
    assert ok is False


def test_lance_maior_que_teto_rejeitado():
    """Validação: lance maior que o menor atual é rejeitado."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(9_000, "a")
    ok, _, _ = state.registrar_lance(9_500, "b")
    assert ok is False


@pytest.mark.parametrize("valor", [0, -100, -1])
def test_valor_invalido_rejeitado(valor):
    """Validação: valores zero ou negativos são sempre rejeitados."""
    state = novo_estado()
    ok, _, _ = state.registrar_lance(valor, "a")
    assert ok is False


@pytest.mark.parametrize("tid", ["", "   "])
def test_transportadora_id_invalido_rejeitado(tid):
    """Validação: id de transportadora vazio ou em branco é rejeitado."""
    state = novo_estado()
    ok, _, _ = state.registrar_lance(9_000, tid)
    assert ok is False


def test_lance_em_leilao_encerrado_rejeitado():
    """Encerramento: nenhum lance entra após o leilão encerrado."""
    state = novo_estado()
    state.encerrar_leilao()
    ok, msg, _ = state.registrar_lance(5_000, "a")
    assert ok is False
    assert "encerrado" in msg.lower()


# ── Estado e encerramento ────────────────────────────────────────────────────

def test_obter_status_sem_lances():
    """Estado: sem lances, o status reporta o valor inicial e nenhum líder."""
    state = novo_estado(valor_inicial=10_000)
    status = state.obter_status()
    assert status["menor_lance"] == 10_000
    assert status["transportadora_lider"] == ""
    assert status["total_lances"] == 0
    assert status["encerrado"] is False


def test_obter_status_apos_lance():
    """Estado: após um lance, o status reflete valor, líder e total."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(8_000, "sp_log")
    status = state.obter_status()
    assert status["menor_lance"] == 8_000
    assert status["transportadora_lider"] == "sp_log"
    assert status["total_lances"] == 1
    assert status["encerrado"] is False


def test_obter_status_apos_encerramento():
    """Encerramento: após encerrar, o status marca encerrado=True."""
    state = novo_estado()
    state.registrar_lance(7_000, "a")
    state.encerrar_leilao()
    assert state.obter_status()["encerrado"] is True


def test_encerrar_leilao_com_vencedor():
    """Encerramento: quem deu o menor lance vence com valor e total corretos."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(8_000, "transp_a")
    state.registrar_lance(7_000, "transp_b")
    resultado = state.encerrar_leilao()
    assert resultado["teve_vencedor"] is True
    assert resultado["vencedor_id"] == "transp_b"
    assert resultado["valor_final"] == 7_000
    assert resultado["total_lances"] == 2


def test_encerrar_leilao_sem_nenhum_lance():
    """Encerramento: sem lances não há vencedor e o valor volta ao inicial."""
    state = novo_estado(valor_inicial=10_000)
    resultado = state.encerrar_leilao()
    assert resultado["teve_vencedor"] is False
    assert resultado["vencedor_id"] == ""
    assert resultado["valor_final"] == 10_000
    assert resultado["total_lances"] == 0
