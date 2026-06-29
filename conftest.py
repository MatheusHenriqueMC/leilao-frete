# conftest.py -- hooks visuais para a suite de testes

import re
import sys
import math
import unicodedata
from datetime import datetime

import pytest

_ANSI_RE = re.compile("\x1b\\[[0-9;]*m")


def _vis_len(s: str) -> int:
    """Tamanho do texto sem contar as cores."""
    return len(_ANSI_RE.sub("", s))


def _ascii(s: str) -> str:
    """Remove acentos e simbolos nao-ASCII."""
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def _servico_de(nodeid: str) -> str:
    """Extrai o servico (auction/auth/notification) a partir do nodeid."""
    for svc in ("auction", "auth", "notification"):
        if f"/{svc}/" in nodeid or f"\\{svc}\\" in nodeid:
            return svc
    return "outro"


def _inplace(text: str):
    """Escreve na mesma linha (efeito ao vivo)."""
    alvo = text
    for _ in range(2):
        try:
            if _tr is not None:
                _tr.write("\r" + alvo, flush=True)
            else:
                sys.stdout.write("\r" + alvo)
                sys.stdout.flush()
            return
        except Exception:
            alvo = _ascii(text)

# tenta usar UTF-8 no terminal
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

_resultados_sessao = []  # resultados de cada teste
_tr = None               # TerminalReporter
_n_selecionados = None   # total de testes selecionados
_servico_atual = None    # servico do ultimo teste impresso


def pytest_collection_modifyitems(session, config, items):
    global _n_selecionados
    _n_selecionados = len(items)


def _conciso() -> bool:
    """True quando ha muitos testes (modo resumido)."""
    return (_n_selecionados is not None) and (_n_selecionados > 5)


def pytest_report_teststatus(report, config):
    # usa nossa saida no lugar dos pontos do pytest
    if _conciso() and report.when == "call":
        return (report.outcome, "", "")
    return None


def pytest_runtest_logstart(nodeid, location):
    """Mostra o nome do teste antes de ele rodar."""
    global _servico_atual
    if not _conciso():
        return
    BOLD = "\033[1m"; RESET = "\033[0m"; GRAY = "\033[90m"
    servico = _servico_de(nodeid)
    if servico != _servico_atual:
        _servico_atual = servico
        _write(f"\n  {BOLD}{servico.upper()}{RESET}")
    nome = _humanizar_nome_console(nodeid.split("::")[-1])[:48]
    leader = "." * max(2, 46 - len(nome))
    _inplace(f"  \033[93m...\033[0m {nome} {GRAY}{leader}{RESET}")


def pytest_configure(config):
    global _tr
    try:
        _tr = config.pluginmanager.get_plugin("terminalreporter")
    except Exception:
        _tr = None


def pytest_report_header(config):
    return [
        "=" * 60,
        "  Plataforma de Negociacao de Fretes -- Suite de Testes",
        "  Projeto academico gRPC + Redis + Python",
        "=" * 60,
    ]


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
    # salva a docstring para usar no HTML
    doc = getattr(item.function, "__doc__", None) or "—"
    report._test_doc = doc.strip()


def _write(line: str):
    """Escreve uma linha no terminal."""
    global _tr
    for texto in (line, _ascii(line)):
        if _tr is not None:
            try:
                _tr.write_line(texto)
                return
            except Exception:
                pass
        try:
            print(texto)
            return
        except Exception:
            pass


def _humanizar_nome_console(nome: str) -> str:
    """Converte test_nome_do_teste em 'Nome do teste'."""
    sufixo = ""
    if "[" in nome:
        idx = nome.index("[")
        sufixo = " " + nome[idx:]
        nome = nome[:idx]
    if nome.startswith("test_"):
        nome = nome[5:]
    nome = nome.replace("_", " ").strip()
    nome = nome[0].upper() + nome[1:] if nome else nome
    return nome + sufixo


def _viz_ascii(viz: str) -> str:
    """Versao texto do mini-grafico, para o terminal."""
    if not viz:
        return ""
    try:
        if viz.startswith("grid:"):
            _, n, g = viz.split(":")
            n, g = int(n), int(g)
            if n <= 40:
                return f"{g}/{n} aceitos  " + "#" * g + "." * (n - g)
            return f"{g} aceitos / {n - g} rejeitados"
        if viz.startswith("ratio:"):
            p = viz.split(":")
            a, b = int(p[1]), int(p[2])
            la = p[3] if len(p) > 3 else "a"
            lb = p[4] if len(p) > 4 else "b"
            largura = 20
            cheio = round(largura * a / (a + b)) if (a + b) else 0
            barra = "#" * cheio + "-" * (largura - cheio)
            return f"[{barra}] {a} {la} / {b} {lb}"
        if viz.startswith("seq:"):
            vals = viz[4:].split(",")
            return " > ".join(v.strip() for v in vals) + "  (ordem mantida)"
        if viz.startswith("flow:"):
            nodes = viz[5:].split(">")
            return " -> ".join(x.strip() for x in nodes)
        if viz.startswith("checks:"):
            itens = viz[7:].split(";")
            return " | ".join(it.split("=")[0].strip() + " OK" for it in itens if it.strip())
    except Exception:
        return ""
    return ""


def pytest_runtest_logreport(report):
    """Coleta o resultado de cada teste e escreve no terminal."""
    if report.when != "call":
        return

    nodeid = report.nodeid
    nome_func = nodeid.split("::")[-1] if "::" in nodeid else nodeid

    # determina o servico pelo caminho
    servico = "outro"
    for svc in ("auction", "auth", "notification"):
        if f"/{svc}/" in nodeid or f"\\{svc}\\" in nodeid or f"/{svc}/" in nodeid.replace("\\", "/"):
            servico = svc
            break

    # docstring do teste
    doc = getattr(report, "_test_doc", "")

    # metrica "info" (opcional)
    info_str = ""
    for key, val in getattr(report, "user_properties", []):
        if key == "info":
            info_str = str(val)
            break

    duracao_ms = round(report.duration * 1000, 1)

    # metrica "viz" (opcional)
    viz_str = ""
    for key, val in getattr(report, "user_properties", []):
        if key == "viz":
            viz_str = str(val)
            break

    _resultados_sessao.append({
        "nodeid": nodeid,
        "nome": nome_func,
        "servico": servico,
        "doc": doc,
        "outcome": report.outcome,
        "duracao_ms": duracao_ms,
        "info": info_str,
        "viz": viz_str,  # NOVO
    })

    # ── Feedback rico por teste ──────────────────────────────────────────────
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    GRAY   = "\033[90m"
    RESET  = "\033[0m"
    BOLD   = "\033[1m"

    nome_human = _humanizar_nome_console(nome_func)
    # Trunca nome para nao ultrapassar 48 chars
    nome_display = nome_human[:48] if len(nome_human) > 48 else nome_human

    resultado_txt = "PASSOU" if report.outcome == "passed" else ("FALHOU" if report.outcome == "failed" else "PULOU")
    viz_ascii = _viz_ascii(viz_str)

    # DETALHADO quando poucos testes (foco em 1); CONCISO na suite inteira.
    global _servico_atual
    detalhado = (_n_selecionados is None) or (_n_selecionados <= 5)

    try:
        if detalhado:
            if report.outcome == "passed":
                marcador = f"{BOLD}{GREEN}[OK]{RESET}"; status = f"{GREEN}PASSOU{RESET}"
            elif report.outcome == "failed":
                marcador = f"{BOLD}{RED}[X ]{RESET}"; status = f"{RED}FALHOU{RESET}"
            else:
                marcador = f"{GRAY}[--]{RESET}"; status = f"{GRAY}PULOU{RESET}"

            _write(f"{marcador} {nome_display:<48} {status}  {GRAY}{duracao_ms}ms{RESET}")
            if doc and doc != "—":
                primeira_linha_doc = next(
                    (l.strip() for l in doc.splitlines() if l.strip()), doc.strip()
                )
                _write(f"     {GRAY}prova    :{RESET} {primeira_linha_doc}")
            if info_str:
                _write(f"     {GRAY}metricas :{RESET} {info_str}")
            _write(f"     {GRAY}duracao  :{RESET} {duracao_ms} ms")
            cor_res = GREEN if report.outcome == "passed" else (RED if report.outcome == "failed" else GRAY)
            _write(f"     {GRAY}resultado:{RESET} {cor_res}{resultado_txt}{RESET}")
            if viz_ascii:
                _write(f"     {GRAY}viz      :{RESET} {viz_ascii}")
            _write("")
        else:
            # Modo conciso AO VIVO: sobrescreve a linha "rodando" (impressa em
            # logstart) com o resultado + check verde, um teste de cada vez.
            mk = "✅" if report.outcome == "passed" else ("❌" if report.outcome == "failed" else "⏭️")
            leader = "." * max(2, 46 - len(nome_display))
            _write(f"\r  {mk} {nome_display} {GRAY}{leader} {duracao_ms}ms{RESET}   ")

    except Exception:
        # Fallback ASCII de 1 linha
        try:
            marca = "[OK]" if report.outcome == "passed" else ("[X ]" if report.outcome == "failed" else "[--]")
            _write(f"  {marca} {nome_display}  {duracao_ms}ms")
        except Exception:
            pass


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

    # Usa SO os resultados coletados nesta execucao (fase 'call' de cada teste).
    # Assim o banner reflete exatamente o que o usuario rodou -- rodar 1 teste
    # unitario mostra so aquele teste, sem marcar [x] no que nem foi executado.
    resultados = _resultados_sessao
    passed  = sum(1 for r in resultados if r["outcome"] == "passed")
    failed  = sum(1 for r in resultados if r["outcome"] == "failed")
    skipped = sum(1 for r in resultados if r["outcome"] == "skipped")
    total   = len(resultados)

    # Conta por servico, somente os que tiveram teste rodado nesta execucao.
    counts = {}
    for r in resultados:
        counts[r["servico"]] = counts.get(r["servico"], 0) + 1

    # Mapeia cada conceito ao arquivo de teste que o prova. So entram no checklist
    # os conceitos REALMENTE rodados; marca [x] apenas se um teste daquele
    # conceito de fato falhou (ausencia != falha).
    conceito_por_arquivo = [
        ("Exclusao mutua (lock/race condition)", "test_state.py"),
        ("Carga (multiplos lances simultaneos)", "test_carga.py"),
        ("Pub/sub (notificacoes Redis)", "test_notifier.py"),
        ("Streaming gRPC", "test_subscribe.py"),
        ("Login / Autenticacao", "test_auth.py"),
    ]
    concepts = []
    for nome_conceito, arquivo in conceito_por_arquivo:
        relevantes = [r for r in resultados if arquivo in r["nodeid"]]
        if not relevantes:
            continue  # conceito nao rodado -> nao aparece no banner
        ok = all(r["outcome"] != "failed" for r in relevantes)
        concepts.append((nome_conceito, ok))

    # Parcial = nem todos os conceitos da suite foram exercitados nesta rodada.
    parcial = len(concepts) < len(conceito_por_arquivo)

    status_color = GREEN if failed == 0 else RED
    status_text  = "TODOS OS TESTES PASSARAM" if failed == 0 else "FALHAS DETECTADAS"
    titulo       = "Resultado dos Testes Selecionados" if parcial else "Resultado Final da Suite de Testes"
    rotulo_conceitos = "CONCEITOS TESTADOS NESTA RODADA:" if parcial else "PROVA DOS CONCEITOS:"

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

        W = 54  # largura visivel do interior (entre as duas bordas verticais)

        def row(conteudo):
            # Preenche pela largura VISIVEL (ignora ANSI) e fecha em CYAN, para
            # a borda direita ficar sempre reta independentemente das cores.
            pad = W - _vis_len(conteudo)
            if pad < 0:
                pad = 0
            return f"{v}{conteudo}{CYAN}{' ' * pad}{v}"

        sep = ml + h * W + mr
        lines = []
        lines.append(f"\n{BOLD}{CYAN}")
        lines.append(tl + h * W + tr)
        lines.append(row("      PLATAFORMA DE NEGOCIACAO DE FRETES"))
        lines.append(row("      " + titulo))
        lines.append(sep)
        lines.append(row(f"  {status_color}{status_text}"))
        lines.append(sep)
        lines.append(row(
            f"  {GREEN}Passou : {passed}{CYAN}   {RED}Falhou: {failed}{CYAN}"
            f"   {YELLOW}Pulou: {skipped}{CYAN}   Total: {total}"))
        lines.append(sep)
        lines.append(row("  Testes por servico:"))
        for svc, cnt in counts.items():
            lines.append(row(f"    {svc:<13}: {cnt} testes"))
        lines.append(sep)
        lines.append(row(f"  {rotulo_conceitos}"))
        for concept, ok in concepts:
            mark = f"{GREEN}{ok_mark}{CYAN}" if ok else f"{RED}{no_mark}{CYAN}"
            lines.append(row(f"    {mark} {concept}"))
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


# -------------------------------------------------------
# Hook: ao final da sessao, gera o relatorio HTML bonito
# -------------------------------------------------------
def pytest_sessionfinish(session, exitstatus):
    """Gera o relatorio HTML apenas na SUITE COMPLETA. Em rodada parcial
    (ex.: 1 teste unitario), o detalhamento fica so no terminal."""
    conceito_arquivos = ["test_state.py", "test_carga.py",
                         "test_notifier.py", "test_subscribe.py", "test_auth.py"]
    exercitados = sum(
        1 for arq in conceito_arquivos
        if any(arq in r["nodeid"] for r in _resultados_sessao)
    )
    if exercitados < len(conceito_arquivos):
        _write("  (rodada parcial -- relatorio HTML gerado apenas na suite completa)")
        return
    _gerar_relatorio_html(_resultados_sessao)


# ═══════════════════════════════════════════════════════
# GERADOR DO RELATORIO HTML CUSTOMIZADO
# ═══════════════════════════════════════════════════════

def _humanizar_nome(nome: str) -> str:
    """Converte test_nome_do_teste[param] em 'Nome do teste [param]'."""
    # Separa sufixo de parametrize (ex: [0], [valor])
    sufixo = ""
    if "[" in nome:
        idx = nome.index("[")
        sufixo = " " + nome[idx:]
        nome = nome[:idx]
    # Remove prefixo test_
    if nome.startswith("test_"):
        nome = nome[5:]
    # Troca underscores por espacos e capitaliza
    nome = nome.replace("_", " ").strip()
    nome = nome[0].upper() + nome[1:] if nome else nome
    return nome + sufixo


def _esc(texto) -> str:
    """Escapa caracteres HTML perigosos para uso seguro no relatorio."""
    s = str(texto)
    return (
        s.replace("&", "&amp;")
         .replace("<", "&lt;")
         .replace(">", "&gt;")
         .replace('"', "&quot;")
    )


def _svg_donut(passou: int, falhou: int, pulou: int, total: int) -> str:
    """SVG inline de donut de aprovação — visual flat/sóbrio."""
    COR_PASSOU  = "#49cc90"
    COR_FALHOU  = "#f93e3e"
    COR_PULOU   = "#b0b0b0"
    COR_FUNDO   = "#e8e8e8"  # anel vazio

    SIZE   = 140
    CX, CY = SIZE / 2, SIZE / 2
    R_EXT  = 60
    R_INT  = 42  # anel fino

    def arco(r, ang_ini, ang_fim, cor, stroke_w):
        """Retorna um path SVG de arco."""
        import math as _math
        rad_ini = _math.radians(ang_ini - 90)
        rad_fim = _math.radians(ang_fim - 90)
        x1 = CX + r * _math.cos(rad_ini)
        y1 = CY + r * _math.sin(rad_ini)
        x2 = CX + r * _math.cos(rad_fim)
        y2 = CY + r * _math.sin(rad_fim)
        large = 1 if (ang_fim - ang_ini) > 180 else 0
        return (
            f'<path d="M {x1:.3f} {y1:.3f} A {r} {r} 0 {large} 1 {x2:.3f} {y2:.3f}" '
            f'fill="none" stroke="{cor}" stroke-width="{stroke_w}" stroke-linecap="butt"/>'
        )

    # Usa stroke num círculo (mais simples, mais sóbrio que path de arco)
    stroke_w = R_EXT - R_INT
    r_medio  = (R_EXT + R_INT) / 2

    def circ_arco(r, ang_ini, ang_fim, cor):
        import math as _math
        circunf = 2 * _math.pi * r
        delta   = ang_fim - ang_ini
        if delta <= 0:
            return ""
        comprimento = circunf * delta / 360
        folga       = circunf - comprimento
        offset      = circunf * (ang_ini / 360)
        return (
            f'<circle cx="{CX}" cy="{CY}" r="{r:.3f}" fill="none" stroke="{cor}" '
            f'stroke-width="{stroke_w}" stroke-dasharray="{comprimento:.3f} {folga:.3f}" '
            f'stroke-dashoffset="{-offset:.3f}" transform="rotate(-90 {CX} {CY})"/>'
        )

    pct_passou = round(passou / total * 100) if total > 0 else 0
    ang_passou = 360 * passou / total if total > 0 else 0
    ang_falhou = 360 * falhou / total if total > 0 else 0
    ang_pulou  = 360 * pulou  / total if total > 0 else 0

    # Seções do anel (acumulando ângulos)
    partes = []
    cursor = 0.0
    if passou > 0:
        partes.append(circ_arco(r_medio, cursor, cursor + ang_passou, COR_PASSOU))
        cursor += ang_passou
    if falhou > 0:
        partes.append(circ_arco(r_medio, cursor, cursor + ang_falhou, COR_FALHOU))
        cursor += ang_falhou
    if pulou > 0:
        partes.append(circ_arco(r_medio, cursor, cursor + ang_pulou, COR_PULOU))
        cursor += ang_pulou
    if total == 0:
        partes.append(
            f'<circle cx="{CX}" cy="{CY}" r="{r_medio:.3f}" fill="none" stroke="{COR_FUNDO}" stroke-width="{stroke_w}"/>'
        )

    arcos_svg = "\n    ".join(partes)

    # Texto central
    txt_pct   = f"{pct_passou}%"
    txt_label = "aprovação"

    legenda = (
        f'<div class="donut-legenda">'
        f'<div class="leg-item"><span class="leg-cor" style="background:{COR_PASSOU}"></span>Passou: {passou}</div>'
        f'<div class="leg-item"><span class="leg-cor" style="background:{COR_FALHOU}"></span>Falhou: {falhou}</div>'
        f'<div class="leg-item"><span class="leg-cor" style="background:{COR_PULOU}"></span>Pulou: {pulou}</div>'
        f'</div>'
    )

    svg = (
        f'<svg width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}" '
        f'xmlns="http://www.w3.org/2000/svg" aria-label="Donut de aprovação">'
        f'\n  <circle cx="{CX}" cy="{CY}" r="{r_medio:.3f}" fill="none" stroke="{COR_FUNDO}" stroke-width="{stroke_w}"/>'
        f'\n    {arcos_svg}'
        f'\n  <text x="{CX}" y="{CY - 6}" text-anchor="middle" '
        f'font-family="system-ui,sans-serif" font-size="22" font-weight="600" fill="#3b4151">{txt_pct}</text>'
        f'\n  <text x="{CX}" y="{CY + 13}" text-anchor="middle" '
        f'font-family="system-ui,sans-serif" font-size="10" fill="#6c757d">{txt_label}</text>'
        f'\n</svg>'
    )
    return svg, legenda


def _svg_barras(contagens_svc: dict) -> str:
    """SVG inline de barras horizontais por serviço — uma cor única, flat."""
    COR_BARRA = "#6b7a90"
    ALTURA_BARRA = 18
    GAP          = 10
    LABEL_W      = 90   # largura reservada para o nome do serviço
    NUM_W        = 26   # largura reservada para o número
    BARRA_MAX_W  = 260
    PADDING_V    = 8
    FONT_SIZE    = 12

    servicos = list(contagens_svc.items())
    if not servicos:
        return '<svg width="400" height="40" xmlns="http://www.w3.org/2000/svg"><text x="10" y="24" font-family="system-ui,sans-serif" font-size="12" fill="#6c757d">Nenhum serviço executado.</text></svg>'

    max_count = max(c for _, c in servicos) or 1
    n         = len(servicos)
    total_h   = PADDING_V * 2 + n * ALTURA_BARRA + (n - 1) * GAP
    total_w   = LABEL_W + BARRA_MAX_W + NUM_W + 12

    linhas = []
    for i, (svc, cnt) in enumerate(servicos):
        y_top   = PADDING_V + i * (ALTURA_BARRA + GAP)
        y_meio  = y_top + ALTURA_BARRA / 2
        barra_w = max(2, int(BARRA_MAX_W * cnt / max_count))

        # Label
        linhas.append(
            f'<text x="{LABEL_W - 6}" y="{y_meio + 4:.1f}" '
            f'text-anchor="end" font-family="system-ui,sans-serif" '
            f'font-size="{FONT_SIZE}" fill="#3b4151">{_esc(svc)}</text>'
        )
        # Barra
        linhas.append(
            f'<rect x="{LABEL_W}" y="{y_top}" width="{barra_w}" height="{ALTURA_BARRA}" '
            f'fill="{COR_BARRA}" rx="2"/>'
        )
        # Número
        linhas.append(
            f'<text x="{LABEL_W + barra_w + 6}" y="{y_meio + 4:.1f}" '
            f'font-family="system-ui,sans-serif" font-size="{FONT_SIZE}" fill="#6c757d">{cnt}</text>'
        )

    corpo = "\n  ".join(linhas)
    svg = (
        f'<svg width="{total_w}" height="{total_h}" viewBox="0 0 {total_w} {total_h}" '
        f'xmlns="http://www.w3.org/2000/svg" aria-label="Testes por serviço">'
        f'\n  {corpo}\n</svg>'
    )
    return svg


def _svg_viz(resultado: dict, max_dur: float) -> str:
    """Retorna HTML com mini-gráficos SVG inline para o corpo de cada teste."""
    import math as _math

    duracao_ms = resultado.get("duracao_ms", 0)
    viz = resultado.get("viz", "")

    # ── 2a. Barra de "Duração relativa" ──────────────────────────────────────
    BARRA_W = 220
    TRACK_H = 10
    pct = duracao_ms / max_dur if max_dur > 0 else 0
    fill_w = max(2, int(BARRA_W * pct))

    barra_dur = (
        f'<div class="viz-bloco">'
        f'<div class="viz-label">Duração relativa</div>'
        f'<svg width="{BARRA_W + 60}" height="{TRACK_H + 4}" viewBox="0 0 {BARRA_W + 60} {TRACK_H + 4}" '
        f'xmlns="http://www.w3.org/2000/svg">'
        f'<rect x="0" y="2" width="{BARRA_W}" height="{TRACK_H}" fill="#eee" rx="3"/>'
        f'<rect x="0" y="2" width="{fill_w}" height="{TRACK_H}" fill="#49cc90" rx="3"/>'
        f'<text x="{BARRA_W + 6}" y="{TRACK_H - 1}" font-family="system-ui,sans-serif" '
        f'font-size="10" fill="#6b7a90">{duracao_ms} ms</text>'
        f'</svg>'
        f'</div>'
    )

    if not viz:
        return barra_dur

    # ── 2b. Gráfico temático por tipo de viz ──────────────────────────────────
    grafico_tematico = ""

    # grid:N:G
    if viz.startswith("grid:"):
        partes = viz.split(":")
        try:
            N = int(partes[1])
            G = int(partes[2])
        except (IndexError, ValueError):
            N, G = 0, 0

        if N > 40:
            # Cai para ratio
            A, B = G, N - G
            total_ratio = A + B or 1
            RATIO_W = 220
            RATIO_H = 14
            seg_a = max(2, int(RATIO_W * A / total_ratio))
            seg_b = max(2, RATIO_W - seg_a)
            grafico_tematico = (
                f'<div class="viz-bloco">'
                f'<div class="viz-label">{G} de {N}</div>'
                f'<svg width="{RATIO_W}" height="{RATIO_H + 4}" viewBox="0 0 {RATIO_W} {RATIO_H + 4}" '
                f'xmlns="http://www.w3.org/2000/svg">'
                f'<rect x="0" y="2" width="{seg_a}" height="{RATIO_H}" fill="#49cc90" rx="2"/>'
                f'<rect x="{seg_a}" y="2" width="{seg_b}" height="{RATIO_H}" fill="#d0d0d0" rx="2"/>'
                f'</svg>'
                f'</div>'
            )
        else:
            # Grid de quadradinhos
            SQ = 14
            GAP = 2
            COLS = min(N, 10)
            rows = _math.ceil(N / COLS) if COLS > 0 else 1
            W = COLS * (SQ + GAP) - GAP
            H = rows * (SQ + GAP) - GAP
            squares = []
            for i in range(N):
                col = i % COLS
                row = i // COLS
                x = col * (SQ + GAP)
                y = row * (SQ + GAP)
                cor = "#49cc90" if i < G else "#d0d0d0"
                squares.append(f'<rect x="{x}" y="{y}" width="{SQ}" height="{SQ}" fill="{cor}" rx="2"/>')
            grafico_tematico = (
                f'<div class="viz-bloco">'
                f'<div class="viz-label">{G} de {N}</div>'
                f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">'
                + "".join(squares)
                + f'</svg></div>'
            )

    # ratio:A:B:labelA:labelB
    elif viz.startswith("ratio:"):
        partes = viz.split(":")
        try:
            A = int(partes[1])
            B = int(partes[2])
            labelA = partes[3] if len(partes) > 3 else "A"
            labelB = partes[4] if len(partes) > 4 else "B"
        except (IndexError, ValueError):
            A, B, labelA, labelB = 0, 0, "A", "B"
        total_ratio = A + B or 1
        RATIO_W = 220
        RATIO_H = 14
        seg_a = max(2, int(RATIO_W * A / total_ratio))
        seg_b = max(2, RATIO_W - seg_a)
        grafico_tematico = (
            f'<div class="viz-bloco">'
            f'<div class="viz-label">{A} {labelA} · {B} {labelB}</div>'
            f'<svg width="{RATIO_W}" height="{RATIO_H + 4}" viewBox="0 0 {RATIO_W} {RATIO_H + 4}" '
            f'xmlns="http://www.w3.org/2000/svg">'
            f'<rect x="0" y="2" width="{seg_a}" height="{RATIO_H}" fill="#49cc90" rx="2"/>'
            f'<rect x="{seg_a}" y="2" width="{seg_b}" height="{RATIO_H}" fill="#d0d0d0" rx="2"/>'
            f'</svg>'
            f'</div>'
        )

    # seq:v1,v2,v3,...
    elif viz.startswith("seq:"):
        raw = viz[4:]
        try:
            valores = [float(v) for v in raw.split(",") if v.strip()]
        except ValueError:
            valores = []
        if len(valores) >= 2:
            W_SEQ = 200
            H_SEQ = 40
            mn = min(valores)
            mx = max(valores)
            span = mx - mn if mx != mn else 1
            n_pts = len(valores)
            pts = []
            for i, v in enumerate(valores):
                px = int(W_SEQ * i / (n_pts - 1))
                py = int(H_SEQ * (v - mn) / span)  # invertido: menor = mais baixo
                pts.append((px, py))
            polyline = " ".join(f"{x},{y}" for x, y in pts)
            circles = "".join(
                f'<circle cx="{x}" cy="{y}" r="3" fill="#6b7a90"/>'
                for x, y in pts
            )
            grafico_tematico = (
                f'<div class="viz-bloco">'
                f'<div class="viz-label">ordem mantida</div>'
                f'<svg width="{W_SEQ}" height="{H_SEQ + 8}" viewBox="0 0 {W_SEQ} {H_SEQ + 8}" '
                f'xmlns="http://www.w3.org/2000/svg">'
                f'<polyline points="{polyline}" fill="none" stroke="#6b7a90" stroke-width="1.5"/>'
                + circles
                + f'</svg></div>'
            )

    # flow:a>b>c
    elif viz.startswith("flow:"):
        nos = viz[5:].split(">")
        NODE_W = 80
        NODE_H = 26
        GAP_X = 36
        total_w = len(nos) * NODE_W + (len(nos) - 1) * GAP_X
        total_h = NODE_H + 16
        elementos = []
        for i, no in enumerate(nos):
            x = i * (NODE_W + GAP_X)
            cx = x + NODE_W / 2
            cy = total_h / 2
            elementos.append(
                f'<rect x="{x}" y="{cy - NODE_H/2:.1f}" width="{NODE_W}" height="{NODE_H}" '
                f'rx="4" fill="#f5f7fa" stroke="#c9d0da" stroke-width="1"/>'
            )
            elementos.append(
                f'<text x="{cx}" y="{cy + 4:.1f}" text-anchor="middle" '
                f'font-family="system-ui,sans-serif" font-size="10" fill="#3b4151">{no}</text>'
            )
            if i < len(nos) - 1:
                ax = x + NODE_W + 4
                ay = cy
                ax2 = x + NODE_W + GAP_X - 4
                elementos.append(
                    f'<line x1="{ax}" y1="{ay}" x2="{ax2}" y2="{ay}" '
                    f'stroke="#c9d0da" stroke-width="1.2" marker-end="url(#arr)"/>'
                )
        arrow_def = (
            '<defs><marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" '
            'orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#c9d0da"/></marker></defs>'
        )
        grafico_tematico = (
            f'<div class="viz-bloco">'
            f'<div class="viz-label">fluxo</div>'
            f'<svg width="{total_w}" height="{total_h}" viewBox="0 0 {total_w} {total_h}" '
            f'xmlns="http://www.w3.org/2000/svg">'
            + arrow_def
            + "".join(elementos)
            + f'</svg></div>'
        )

    # checks:k1=ok;k2=ok;k3=fail
    elif viz.startswith("checks:"):
        raw = viz[7:]
        pares = [p.strip() for p in raw.split(";") if p.strip()]
        itens = []
        for par in pares:
            if "=" in par:
                chave, _, val = par.partition("=")
            else:
                chave, val = par, "ok"
            ok = val.strip().lower() == "ok"
            cor = "#49cc90" if ok else "#f93e3e"
            marca = "✓" if ok else "✗"
            itens.append(
                f'<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
                f'<span style="color:{cor};font-weight:700;font-size:13px;">{marca}</span>'
                f'<span style="font-size:12px;color:#3b4151;">{chave.strip()}</span>'
                f'</div>'
            )
        grafico_tematico = (
            f'<div class="viz-bloco">'
            f'<div class="viz-label">verificações</div>'
            + "".join(itens)
            + f'</div>'
        )

    return barra_dur + grafico_tematico


def _gerar_relatorio_html(resultados: list) -> None:
    """Monta e grava relatorio-testes.html self-contained (estilo Swagger)."""

    from collections import defaultdict
    import base64
    import os

    agora = datetime.now().strftime("%d/%m/%Y %H:%M")

    # -- Logo DJMC (embutida em base64 p/ o relatorio continuar self-contained) --
    _logo_tag = ""
    try:
        _logo_path = os.path.join(os.path.dirname(__file__),
                                  "frontend", "public", "logo.png")
        with open(_logo_path, "rb") as _f:
            _b64 = base64.b64encode(_f.read()).decode("ascii")
        _logo_tag = (f'<img class="logo" src="data:image/png;base64,{_b64}" '
                     f'alt="DJMC Leiloes">')
    except Exception:
        _logo_tag = ""

    # -- Estatisticas globais --
    passou = sum(1 for r in resultados if r["outcome"] == "passed")
    falhou = sum(1 for r in resultados if r["outcome"] == "failed")
    pulou  = sum(1 for r in resultados if r["outcome"] == "skipped")
    total  = len(resultados)

    resumo = (
        f"{total} teste{'s' if total != 1 else ''} "
        f"&middot; {passou} passaram "
        f"&middot; {falhou} falharam "
        f"&middot; gerado em {agora}"
    )

    # -- Nomes amigaveis por servico --
    NOMES_SVC = {
        "auction":      "auction",
        "auth":         "auth",
        "notification": "notification",
        "outro":        "outro",
    }
    ordem_svcs = ["auction", "auth", "notification", "outro"]

    # -- Agrupa por servico --
    grupos = defaultdict(list)
    for r in resultados:
        grupos[r["servico"]].append(r)

    # -- Contagem por servico (so os que rodaram) --
    counts_svc = {}
    for r in resultados:
        counts_svc[r["servico"]] = counts_svc.get(r["servico"], 0) + 1

    # -- Graficos SVG --
    svg_donut, legenda_donut = _svg_donut(passou, falhou, pulou, total)
    svg_barras = _svg_barras(counts_svc)

    secao_resultado_geral = f"""
    <section class="resultado-geral">
      <h3 class="rg-titulo">Resultado Geral</h3>
      <div class="rg-graficos">
        <div class="rg-card">
          <div class="rg-card-titulo">Aprovação</div>
          <div class="rg-donut-wrap">
            {svg_donut}
            {legenda_donut}
          </div>
        </div>
        <div class="rg-card">
          <div class="rg-card-titulo">Testes por Serviço</div>
          <div class="rg-barras-wrap">
            {svg_barras}
          </div>
        </div>
      </div>
    </section>"""

    # -- Duracao maxima para escala das barras de duracao relativa --
    max_dur = max((r["duracao_ms"] for r in resultados), default=1.0) or 1.0

    # -- Monta cada grupo de servico --
    grupos_html = ""
    for svc in ordem_svcs:
        testes_svc = grupos.get(svc)
        if not testes_svc:
            continue

        titulo_svc = NOMES_SVC.get(svc, svc)

        testes_html = ""
        for r in testes_svc:
            outcome = r["outcome"]
            nome_human = _humanizar_nome(r["nome"])
            doc = r["doc"] if r["doc"] and r["doc"] != "—" else "—"
            info = r.get("info") or ""
            nodeid = r["nodeid"]
            duracao = r["duracao_ms"]

            if outcome == "passed":
                cls_status = "passed"
                badge_txt = "PASSOU"
                resultado_txt = "PASSOU"
            elif outcome == "failed":
                cls_status = "failed"
                badge_txt = "FALHOU"
                resultado_txt = "FALHOU"
            else:
                cls_status = "skipped"
                badge_txt = "IGNORADO"
                resultado_txt = "IGNORADO"

            # Testes que falharam abrem expandidos por padrao
            open_attr = " open" if outcome == "failed" else ""

            # Linha de metricas (omite se vazio)
            metricas_html = ""
            if info:
                metricas_html = (
                    f'<div class="field"><span class="label">Métricas:</span> '
                    f'<span class="value">{_esc(info)}</span></div>'
                )

            testes_html += f"""
          <details class="test-item {cls_status}"{open_attr}>
            <summary class="test-summary">
              <span class="badge {cls_status}">{badge_txt}</span>
              <span class="test-name">{_esc(nome_human)}</span>
              <span class="duration">{duracao} ms</span>
            </summary>
            <div class="test-body">
              <div class="field"><span class="label">O que prova:</span> <span class="value">{_esc(doc)}</span></div>
              {metricas_html}
              <div class="field"><span class="label">Duração:</span> <span class="value">{duracao} ms</span></div>
              <div class="field"><span class="label">Resultado:</span> <span class="value">{resultado_txt}</span></div>
              {_svg_viz(r, max_dur)}
            </div>
          </details>"""

        grupos_html += f"""
      <details class="service-group" open>
        <summary class="service-header">{_esc(titulo_svc)} <span class="count">({len(testes_svc)})</span></summary>
        <div class="tests">{testes_html}
        </div>
      </details>"""

    # -- HTML final --
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Testes — Plataforma de Negociação de Fretes</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: #ffffff;
      color: #3b4151;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }}
    .container {{
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }}
    header {{
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e3e3e3;
    }}
    header .logo {{
      display: block;
      height: 76px;
      width: auto;
      margin-bottom: 14px;
    }}
    header h1 {{
      margin: 0;
      font-size: 26px;
      font-weight: 600;
      color: #3b4151;
    }}
    header h2 {{
      margin: 4px 0 0;
      font-size: 16px;
      font-weight: 400;
      color: #6c757d;
    }}
    header .summary-line {{
      margin-top: 10px;
      font-size: 13px;
      color: #6c757d;
    }}
    .services {{ display: flex; flex-direction: column; gap: 16px; }}
    .service-group {{
      border: 1px solid #e3e3e3;
      border-radius: 4px;
      overflow: hidden;
    }}
    .service-header {{
      cursor: pointer;
      list-style: none;
      padding: 12px 16px;
      font-size: 18px;
      font-weight: 600;
      color: #3b4151;
      background: #fafafa;
      border-bottom: 1px solid #e3e3e3;
      user-select: none;
    }}
    .service-header::-webkit-details-marker {{ display: none; }}
    .service-group:not([open]) .service-header {{ border-bottom: none; }}
    .service-header .count {{
      font-size: 14px;
      font-weight: 400;
      color: #6c757d;
    }}
    .tests {{ display: flex; flex-direction: column; }}
    .test-item {{
      border-bottom: 1px solid #f0f0f0;
      border-left: 4px solid #6c757d;
    }}
    .test-item:last-child {{ border-bottom: none; }}
    .test-item.passed {{ border-left-color: #49cc90; }}
    .test-item.failed {{ border-left-color: #f93e3e; border-left-width: 4px; }}
    .test-item.failed {{ background: #fff7f7; }}
    .test-item.skipped {{ border-left-color: #6c757d; }}
    .test-summary {{
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      user-select: none;
    }}
    .test-summary:hover {{ background: #f8f8f8; }}
    .test-summary::-webkit-details-marker {{ display: none; }}
    .badge {{
      flex-shrink: 0;
      display: inline-block;
      min-width: 78px;
      text-align: center;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    .badge.passed {{ color: #49cc90; background: #e8f9f3; }}
    .badge.failed {{ color: #f93e3e; background: #fde8e8; }}
    .badge.skipped {{ color: #6c757d; background: #eceef0; }}
    .test-name {{ flex: 1; font-weight: 500; color: #3b4151; }}
    .duration {{
      flex-shrink: 0;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      color: #6c757d;
    }}
    .test-body {{
      padding: 16px 20px;
      background: #f9f9f9;
      border-top: 1px solid #f0f0f0;
    }}
    .field {{ margin-bottom: 8px; }}
    .field .label {{ font-weight: 600; color: #3b4151; }}
    .field .value {{ color: #3b4151; }}
    .viz-bloco {{
      margin-top: 10px;
      margin-bottom: 4px;
    }}
    .viz-label {{
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7a90;
      margin-bottom: 4px;
    }}
    /* ── Resultado Geral ── */
    .resultado-geral {{
      margin-bottom: 28px;
      border: 1px solid #e3e3e3;
      border-radius: 4px;
      padding: 20px 24px;
      background: #fff;
    }}
    .rg-titulo {{
      margin: 0 0 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #6c757d;
    }}
    .rg-graficos {{
      display: flex;
      flex-wrap: wrap;
      gap: 32px;
      align-items: flex-start;
    }}
    .rg-card {{
      flex: 1 1 220px;
    }}
    .rg-card-titulo {{
      font-size: 12px;
      font-weight: 600;
      color: #3b4151;
      margin-bottom: 12px;
    }}
    .rg-donut-wrap {{
      display: flex;
      align-items: center;
      gap: 20px;
    }}
    .donut-legenda {{
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}
    .leg-item {{
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: #3b4151;
    }}
    .leg-cor {{
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      flex-shrink: 0;
    }}
    .rg-barras-wrap {{
      overflow-x: auto;
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      {_logo_tag}
      <h1>Plataforma de Negociação de Fretes</h1>
      <h2>Relatório de Testes</h2>
      <div class="summary-line">{resumo}</div>
    </header>
    {secao_resultado_geral}
    <div class="services">{grupos_html}
    </div>
  </div>
</body>
</html>"""

    try:
        with open("relatorio-testes.html", "w", encoding="utf-8") as f:
            f.write(html)
        print(f"\n  Relatório HTML gerado: relatorio-testes.html")
    except Exception as exc:
        print(f"\n  [AVISO] Nao foi possivel gravar relatorio-testes.html: {exc}")
