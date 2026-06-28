"""
Testes unitarios de AuctionState: concorrencia (o lock como fonte de verdade),
validacao do lance e estado/encerramento. O nucleo aqui e provar que lances
simultaneos nunca empatam: o Lock serializa quem entra na secao critica.
"""

import pytest

from helpers import novo_estado, run_concurrent


# ── Concorrencia ─────────────────────────────────────────────────────────────

def test_lances_iguais_so_um_vence():
    """Lances iguais simultaneos: o lock garante que so um vence."""
    # N threads disparam o mesmo valor juntas: o lock garante que so um vence.
    N = 20
    for _ in range(100):  # repete para flagrar flakiness de race condition
        state = novo_estado()
        resultados = run_concurrent(lambda _: state.registrar_lance(9_500, "t"), N)
        aceitos = [ok for ok, _, _ in resultados]
        assert sum(aceitos) == 1, f"Esperado 1 aceito, obtido {sum(aceitos)}"
        assert len(state.historico_lances) == 1


def test_estresse_valores_variados():
    """Concorrencia: lances variados simultaneos deixam o estado consistente."""
    # Valores distintos e concorrentes: o estado final fica consistente.
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


# ── Validacao do lance ───────────────────────────────────────────────────────

def test_primeiro_lance_igual_ao_inicial_rejeitado():
    """Validacao: lance igual ao valor inicial e rejeitado."""
    # Lance precisa ser menor que o valor inicial, nunca igual.
    state = novo_estado(valor_inicial=10_000)
    ok, msg, _ = state.registrar_lance(10_000, "a")
    assert ok is False
    assert "menor" in msg.lower() or "lance" in msg.lower()


def test_primeiro_lance_menor_que_inicial_aceito():
    """Validacao: primeiro lance menor que o inicial e aceito."""
    state = novo_estado(valor_inicial=10_000)
    ok, _, _ = state.registrar_lance(9_000, "a")
    assert ok is True


def test_lance_igual_ao_teto_atual_rejeitado():
    """Validacao: empatar com o menor lance atual e rejeitado."""
    # Empatar com o menor lance atual nao basta: tem que ser estritamente menor.
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(9_000, "a")
    ok, _, _ = state.registrar_lance(9_000, "b")
    assert ok is False


def test_lance_maior_que_teto_rejeitado():
    """Validacao: lance maior que o menor atual e rejeitado."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(9_000, "a")
    ok, _, _ = state.registrar_lance(9_500, "b")
    assert ok is False


@pytest.mark.parametrize("valor", [0, -100, -1])
def test_valor_invalido_rejeitado(valor):
    """Validacao: valores zero ou negativos sao sempre rejeitados."""
    # Valores zero ou negativos sao sempre rejeitados.
    state = novo_estado()
    ok, _, _ = state.registrar_lance(valor, "a")
    assert ok is False


@pytest.mark.parametrize("tid", ["", "   "])
def test_transportadora_id_invalido_rejeitado(tid):
    """Validacao: id de transportadora vazio ou em branco e rejeitado."""
    # Id vazio ou so com espacos e considerado invalido.
    state = novo_estado()
    ok, _, _ = state.registrar_lance(9_000, tid)
    assert ok is False


def test_lance_em_leilao_encerrado_rejeitado():
    """Encerramento: nenhum lance entra apos o leilao encerrado."""
    # Depois de encerrado nao entra mais lance.
    state = novo_estado()
    state.encerrar_leilao()
    ok, msg, _ = state.registrar_lance(5_000, "a")
    assert ok is False
    assert "encerrado" in msg.lower()


# ── Estado e encerramento ────────────────────────────────────────────────────

def test_obter_status_sem_lances():
    """Estado: sem lances, o status reporta o valor inicial e nenhum lider."""
    # Sem lances, o status reporta o valor inicial e nenhum lider.
    state = novo_estado(valor_inicial=10_000)
    status = state.obter_status()
    assert status["menor_lance"] == 10_000
    assert status["transportadora_lider"] == ""
    assert status["total_lances"] == 0
    assert status["encerrado"] is False


def test_obter_status_apos_lance():
    """Estado: apos um lance, o status reflete valor, lider e total."""
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(8_000, "sp_log")
    status = state.obter_status()
    assert status["menor_lance"] == 8_000
    assert status["transportadora_lider"] == "sp_log"
    assert status["total_lances"] == 1
    assert status["encerrado"] is False


def test_obter_status_apos_encerramento():
    """Encerramento: apos encerrar, o status marca encerrado=True."""
    state = novo_estado()
    state.registrar_lance(7_000, "a")
    state.encerrar_leilao()
    assert state.obter_status()["encerrado"] is True


def test_encerrar_leilao_com_vencedor():
    """Encerramento: quem deu o menor lance vence com valor e total corretos."""
    # Quem deu o menor lance vence; o resultado carrega valor e total.
    state = novo_estado(valor_inicial=10_000)
    state.registrar_lance(8_000, "transp_a")
    state.registrar_lance(7_000, "transp_b")
    resultado = state.encerrar_leilao()
    assert resultado["teve_vencedor"] is True
    assert resultado["vencedor_id"] == "transp_b"
    assert resultado["valor_final"] == 7_000
    assert resultado["total_lances"] == 2


def test_encerrar_leilao_sem_nenhum_lance():
    """Encerramento: sem lances nao ha vencedor e o valor volta ao inicial."""
    # Sem lances nao ha vencedor; valor final volta ao inicial.
    state = novo_estado(valor_inicial=10_000)
    resultado = state.encerrar_leilao()
    assert resultado["teve_vencedor"] is False
    assert resultado["vencedor_id"] == ""
    assert resultado["valor_final"] == 10_000
    assert resultado["total_lances"] == 0
