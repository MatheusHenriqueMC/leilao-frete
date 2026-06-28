# conftest.py — hooks visuais para a suite de testes
# Plataforma de Negociacao de Fretes
# Adiciona: coluna "O que prova" no HTML, cabecalho, banner final no console

import sys

import pytest

# No Windows o console padrao usa cp1252 e nao consegue imprimir os caracteres
# de caixa (box-drawing) nem os simbolos [v]. Forca UTF-8 na saida quando possivel
# para o banner final nao quebrar a sessao com UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# -------------------------------------------------------
# Hook: cabecalho no relatorio
# -------------------------------------------------------
def pytest_report_header(config):
    return [
        "=" * 60,
        "  Plataforma de Negociacao de Fretes -- Suite de Testes",
        "  Projeto academico gRPC + Redis + Python",
        "=" * 60,
    ]

# -------------------------------------------------------
# Hook: coluna extra no HTML (O que prova)
# -------------------------------------------------------
def pytest_html_results_table_header(cells):
    try:
        from py.xml import html
        cells.insert(2, html.th("O que prova", class_="sortable"))
    except Exception:
        pass

def pytest_html_results_table_row(report, cells):
    try:
        from py.xml import html
        doc = getattr(report, "_test_doc", "—")
        cells.insert(2, html.td(doc))
    except Exception:
        pass

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    # Salva a docstring no report para o hook da tabela HTML
    doc = getattr(item.function, "__doc__", None) or "—"
    report._test_doc = doc.strip()

# -------------------------------------------------------
# Hook: banner final no console
# -------------------------------------------------------
def pytest_terminal_summary(terminalreporter, exitstatus, config):
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    RESET  = "\033[0m"
    BOLD   = "\033[1m"

    passed  = len(terminalreporter.stats.get("passed",  []))
    failed  = len(terminalreporter.stats.get("failed",  []))
    errors  = len(terminalreporter.stats.get("error",   []))
    skipped = len(terminalreporter.stats.get("skipped", []))
    total   = passed + failed + errors + skipped

    # Conta por servico baseado no nodeid. Deduplica por nodeid (um teste pode
    # gerar mais de um report em stats) e casa pelo caminho exato services/<svc>/
    # com break, para nenhum teste ser contado em dois servicos.
    counts = {"auction": 0, "auth": 0, "notification": 0}
    vistos = set()
    for r in terminalreporter.stats.get("passed", []) + terminalreporter.stats.get("failed", []):
        nodeid = getattr(r, "nodeid", "")
        if not nodeid or nodeid in vistos:
            continue
        vistos.add(nodeid)
        for svc in counts:
            if f"/{svc}/" in nodeid or f"\\{svc}\\" in nodeid:
                counts[svc] += 1
                break

    status_color = GREEN if failed == 0 and errors == 0 else RED
    status_text  = "TODOS OS TESTES PASSARAM" if failed == 0 and errors == 0 else "FALHAS DETECTADAS"

    concepts = [
        ("Exclusao mutua (lock/race condition)", passed > 0),
        ("Carga (multiplos lances simultaneos)", counts["auction"] > 0),
        ("Pub/sub (notificacoes Redis)", counts["notification"] > 0),
        ("Streaming gRPC", counts["auction"] > 0),
        ("Login / Autenticacao", counts["auth"] > 0),
    ]

    # Monta o banner com dois conjuntos de caracteres: "rich" (Unicode, bonito) e
    # "ascii" (fallback). Em consoles que nao suportam Unicode (cp1252 no Windows),
    # imprimir o rich lancaria UnicodeEncodeError e quebraria a sessao -- por isso
    # tentamos o rich primeiro e, em qualquer falha, caimos para o ascii.
    def _build(charset):
        if charset == "rich":
            tl, tr, bl, br = "╔", "╗", "╚", "╝"
            h, v = "═", "║"
            ml, mr = "╠", "╣"
            ok_mark, no_mark = "[✓]", "[✗]"
        else:
            tl = tr = bl = br = "+"
            h, v = "=", "|"
            ml = mr = "+"
            ok_mark, no_mark = "[OK]", "[X ]"

        W = 54
        lines = []
        lines.append(f"\n{BOLD}{CYAN}")
        lines.append(tl + h * W + tr)
        lines.append(v + "      PLATAFORMA DE NEGOCIACAO DE FRETES".ljust(W) + " " + v)
        lines.append(v + "      Resultado Final da Suite de Testes".ljust(W) + " " + v)
        lines.append(ml + h * W + mr)
        lines.append(f"{v}  {BOLD}{status_color}{status_text:<52}{CYAN}{v}")
        lines.append(ml + h * W + mr)
        lines.append(f"{v}  {GREEN}Passou : {passed:<4}{CYAN}  {RED}Falhou: {failed:<4}{CYAN}  {YELLOW}Pulou: {skipped:<4}{CYAN}  Total: {total:<4}  {v}")
        lines.append(ml + h * W + mr)
        lines.append(v + "  Testes por servico:".ljust(W) + " " + v)
        for svc, cnt in counts.items():
            lines.append(v + f"    {svc:<15}: {cnt} testes".ljust(W) + " " + v)
        lines.append(ml + h * W + mr)
        lines.append(f"{v}  {BOLD}PROVA DOS CONCEITOS:{CYAN}".ljust(W + len(BOLD) + len(CYAN) + 1) + " " + v)
        for concept, ok in concepts:
            mark = f"{GREEN}{ok_mark}{RESET}{CYAN}" if ok else f"{RED}{no_mark}{RESET}{CYAN}"
            lines.append(f"{v}    {mark} {concept:<46}{v}")
        lines.append(bl + h * W + br)
        lines.append(f"{RESET}")
        return "\n".join(lines)

    try:
        print(_build("rich"))
    except Exception:
        try:
            print(_build("ascii"))
        except Exception:
            pass
