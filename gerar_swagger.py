"""
Gera swagger.html — documentacao interativa dos eventos Socket.IO do gateway.
Execute: python gerar_swagger.py
"""

import base64
import os
from datetime import datetime

# ── Logo em base64 ────────────────────────────────────────────────────────────
_logo_tag = ""
try:
    _logo_path = os.path.join(os.path.dirname(__file__), "frontend", "public", "logo.png")
    with open(_logo_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    _logo_tag = f'<img class="logo" src="data:image/png;base64,{b64}" alt="DJMC Leiloes">'
except Exception:
    _logo_tag = '<div class="logo-placeholder">DJMC Leiloes</div>'

# ── Definicao dos eventos ─────────────────────────────────────────────────────

EVENTOS = [
    # ── AUTH ──────────────────────────────────────────────────────────────────
    {
        "grupo": "Autenticacao",
        "cor": "#6b7a90",
        "eventos": [
            {
                "nome": "login",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Autentica um usuario (admin ou transportadora). Retorna role e userId.",
                "request": '{\n  "username": "string",\n  "password": "string"\n}',
                "response_event": "login_response",
                "response": '{\n  "sucesso": true,\n  "role": "admin" | "transportadora",\n  "mensagem": "string",\n  "userId": "string"\n}',
            },
            {
                "nome": "create_carrier",
                "direcao": "client → server",
                "role": "admin",
                "descricao": "Cria uma conta de transportadora com dados de acesso e contato.",
                "request": '{\n  "username": "string",\n  "password": "string",\n  "cnpj":     "string (opcional)",\n  "email":    "string (opcional)",\n  "telefone": "string (opcional)"\n}',
                "response_event": "create_carrier_response",
                "response": '{\n  "sucesso":  true | false,\n  "mensagem": "string"\n}',
            },
            {
                "nome": "get_carrier",
                "direcao": "client → server",
                "role": "admin",
                "descricao": "Busca dados de contato de uma transportadora pelo username.",
                "request": '{\n  "username": "string"\n}',
                "response_event": "get_carrier_response",
                "response": '{\n  "encontrado": true | false,\n  "username":   "string",\n  "cnpj":       "string",\n  "email":      "string",\n  "telefone":   "string"\n}',
            },
        ],
    },
    # ── LEILOES ───────────────────────────────────────────────────────────────
    {
        "grupo": "Gestao de Leiloes",
        "cor": "#f97316",
        "eventos": [
            {
                "nome": "create_auction",
                "direcao": "client → server",
                "role": "admin",
                "descricao": "Cria um novo leilao reverso. Imagens sao base64 comprimidas no frontend (max 800px, JPEG 0.75).",
                "request": '{\n  "titulo":        "string",\n  "descricao":     "string (HTML)",\n  "especificacoes":"string (HTML)",\n  "valor_inicial": 10000.00,\n  "tempo_segundos": 0,\n  "imagens":       ["base64...", ...]\n}',
                "response_event": "create_auction_response",
                "response": '{\n  "sucesso":   true | false,\n  "leilao_id": 1,\n  "join_code": "F3T8KZ",\n  "mensagem":  "string"\n}',
            },
            {
                "nome": "list_auctions",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Lista leiloes. Com apenas_ativos=true retorna so os em andamento.",
                "request": '{\n  "apenas_ativos": true | false\n}',
                "response_event": "list_auctions_response",
                "response": '{\n  "leiloes": [ AuctionSummary, ... ]\n}\n\n// AuctionSummary\n{\n  "id": 1,\n  "titulo": "string",\n  "descricao": "string (HTML)",\n  "especificacoes": "string (HTML)",\n  "join_code": "F3T8KZ",\n  "valor_inicial": 10000.00,\n  "menor_lance": 9500.00,\n  "transportadora_lider": "string",\n  "encerrado": false,\n  "total_lances": 3,\n  "tempo_restante_s": 120,\n  "tempo_total_s": 300,\n  "created_at": "ISO-8601",\n  "ended_at": "ISO-8601 | \"\"",\n  "vencedor_id": "string",\n  "valor_final": 0.0,\n  "thumbnail": "base64..."\n}',
            },
            {
                "nome": "auction_detail",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Retorna detalhes completos de um leilao, incluindo todas as imagens e historico de lances.",
                "request": '{\n  "leilao_id": 1\n}',
                "response_event": "auction_detail_response",
                "response": '{\n  "leilao":  AuctionSummary,\n  "lances":  [ LanceInfo, ... ],\n  "imagens": ["base64...", ...]\n}',
            },
            {
                "nome": "resolve_code",
                "direcao": "client → server",
                "role": "transportadora",
                "descricao": "Resolve um codigo de acesso (join code) retornando o ID do leilao correspondente.",
                "request": '{\n  "join_code": "F3T8KZ"\n}',
                "response_event": "resolve_code_response",
                "response": '{\n  "encontrado": true | false,\n  "leilao_id":  1,\n  "titulo":     "string",\n  "mensagem":   "string"\n}',
            },
            {
                "nome": "carrier_history",
                "direcao": "client → server",
                "role": "transportadora",
                "descricao": "Retorna os leiloes em que a transportadora participou (com ou sem vitorias).",
                "request": '{\n  "transportadora_id": "string"\n}',
                "response_event": "carrier_history_response",
                "response": '{\n  "leiloes": [ AuctionSummary, ... ]\n}',
            },
        ],
    },
    # ── SALA DO LEILAO ────────────────────────────────────────────────────────
    {
        "grupo": "Sala do Leilao",
        "cor": "#16a34a",
        "eventos": [
            {
                "nome": "join_auction",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Inscreve o cliente na room Socket.IO do leilao (leilao_{id}) e inicia o stream gRPC de notificacoes se ainda nao existir.",
                "request": '{\n  "leilao_id":        1,\n  "transportadora_id": "string"\n}',
                "response_event": "joined_auction",
                "response": '{\n  "leilao_id": 1,\n  "mensagem":  "Inscrito no leilao 1."\n}',
            },
            {
                "nome": "status",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Consulta o estado atual do leilao: menor lance, lider, tempo restante.",
                "request": '{\n  "leilao_id": 1\n}',
                "response_event": "status_response",
                "response": '{\n  "leilao_id":            1,\n  "titulo":               "string",\n  "descricao_carga":      "string (HTML)",\n  "especificacoes":       "string (HTML)",\n  "valor_inicial":        10000.00,\n  "menor_lance":          9500.00,\n  "transportadora_lider": "string",\n  "timestamp":            1700000000000,\n  "total_lances":         3,\n  "encerrado":            false,\n  "tempo_restante_s":     120,\n  "tempo_total_s":        300,\n  "join_code":            "F3T8KZ"\n}',
            },
            {
                "nome": "history",
                "direcao": "client → server",
                "role": "todos",
                "descricao": "Retorna o historico completo de lances do leilao em ordem cronologica.",
                "request": '{\n  "leilao_id": 1\n}',
                "response_event": "history_response",
                "response": '{\n  "lances": [\n    {\n      "valor":             9500.00,\n      "transportadora_id": "string",\n      "timestamp":         1700000000000\n    }\n  ]\n}',
            },
            {
                "nome": "bid",
                "direcao": "client → server",
                "role": "transportadora",
                "descricao": "Registra um lance. O servidor valida com threading.Lock — so aceita se valor for menor que o menor lance atual.",
                "request": '{\n  "leilao_id":        1,\n  "transportadora_id": "string",\n  "valor":            9200.00\n}',
                "response_event": "bid_response",
                "response": '{\n  "aceito":            true | false,\n  "menor_lance_atual": 9200.00,\n  "mensagem":          "string",\n  "leilao_id":         1\n}',
            },
        ],
    },
    # ── ENCERRAMENTO ─────────────────────────────────────────────────────────
    {
        "grupo": "Encerramento (Admin)",
        "cor": "#dc2626",
        "eventos": [
            {
                "nome": "start_countdown",
                "direcao": "client → server (broadcast)",
                "role": "admin",
                "descricao": "Admin inicia a contagem regressiva. O gateway faz broadcast para todos na room. Cada cliente inicia localmente um timer de 6s (3 ticks de 2s) e ao final o admin emite close_auction.",
                "request": '{\n  "leilao_id": 1\n}',
                "response_event": "countdown_started (broadcast para room)",
                "response": '{\n  "leilao_id": 1\n}',
            },
            {
                "nome": "cancel_countdown",
                "direcao": "client → server (broadcast)",
                "role": "admin / sistema",
                "descricao": "Cancela o countdown em andamento (disparado automaticamente quando um novo lance e recebido durante a contagem).",
                "request": '{\n  "leilao_id": 1\n}',
                "response_event": "countdown_cancelled (broadcast para room)",
                "response": '{\n  "leilao_id": 1\n}',
            },
            {
                "nome": "close_auction",
                "direcao": "client → server",
                "role": "admin",
                "descricao": "Encerra o leilao definitivamente. Registra o vencedor no banco e notifica todos via stream.",
                "request": '{\n  "leilao_id": 1,\n  "admin_id":  "admin"\n}',
                "response_event": "close_response",
                "response": '{\n  "sucesso":      true | false,\n  "mensagem":     "string",\n  "vencedor_id":  "string",\n  "valor_final":  9200.00,\n  "total_lances": 5,\n  "leilao_id":    1\n}',
            },
        ],
    },
    # ── BROADCASTS (server → client) ─────────────────────────────────────────
    {
        "grupo": "Notificacoes em Tempo Real (server push)",
        "cor": "#7c3aed",
        "eventos": [
            {
                "nome": "auction_update",
                "direcao": "server → room (broadcast)",
                "role": "—",
                "descricao": "Emitido automaticamente pelo notification-service via Redis Pub/Sub sempre que um lance e aceito ou o leilao e encerrado. Todos os clientes na room recebem.",
                "request": "— (evento servidor)",
                "response_event": "auction_update",
                "response": '{\n  "leilao_id":            1,\n  "menor_lance":          9200.00,\n  "transportadora_lider": "string",\n  "timestamp":            1700000000000,\n  "encerrado":            false,\n  "mensagem":             "string",\n  "tempo_restante_s":     118\n}',
            },
            {
                "nome": "error",
                "direcao": "server → client",
                "role": "—",
                "descricao": "Emitido quando ocorre qualquer erro de validacao ou falha na chamada gRPC.",
                "request": "— (evento servidor)",
                "response_event": "error",
                "response": '{\n  "mensagem": "string descrevendo o erro"\n}',
            },
            {
                "nome": "connected",
                "direcao": "server → client",
                "role": "—",
                "descricao": "Emitido automaticamente pelo gateway quando a conexao Socket.IO e estabelecida.",
                "request": "— (evento servidor)",
                "response_event": "connected",
                "response": '{\n  "mensagem": "Conectado ao gateway."\n}',
            },
        ],
    },
]

# ── Arquitetura ────────────────────────────────────────────────────────────────

ARCH_SVG = """
<svg viewBox="0 0 720 160" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:720px;display:block;margin:0 auto">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8"/>
    </marker>
  </defs>
  <!-- React -->
  <rect x="10" y="55" width="120" height="50" rx="6" fill="#fff7ed" stroke="#f97316" stroke-width="1.5"/>
  <text x="70" y="77" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#c2410c">React</text>
  <text x="70" y="92" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="#9a3412">Socket.IO-client</text>
  <text x="70" y="106" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#cbd5e1">porta 5173</text>
  <!-- seta React -> Gateway -->
  <line x1="130" y1="80" x2="188" y2="80" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="159" y="73" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="#94a3b8">WS / polling</text>
  <!-- Gateway -->
  <rect x="190" y="35" width="140" height="90" rx="6" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
  <text x="260" y="62" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#c2410c">Gateway</text>
  <text x="260" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" fill="#9a3412">Flask + Socket.IO</text>
  <text x="260" y="93" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#9a3412">async_mode=threading</text>
  <text x="260" y="108" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#cbd5e1">porta 5000</text>
  <!-- seta Gateway -> Auth -->
  <line x1="330" y1="60" x2="388" y2="60" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <text x="359" y="53" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" fill="#94a3b8">gRPC</text>
  <!-- Auth -->
  <rect x="390" y="35" width="120" height="50" rx="6" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
  <text x="450" y="57" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#15803d">auth-service</text>
  <text x="450" y="72" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#166534">Login, CreateCarrier</text>
  <text x="450" y="85" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#cbd5e1">porta 50052</text>
  <!-- seta Gateway -> Auction -->
  <line x1="330" y1="90" x2="388" y2="100" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <!-- Auction -->
  <rect x="390" y="82" width="120" height="50" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="450" y="104" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#1d4ed8">auction-service</text>
  <text x="450" y="118" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#1e40af">Lances, Leiloes</text>
  <text x="450" y="131" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#cbd5e1">porta 50051</text>
  <!-- seta Gateway -> Notification -->
  <line x1="330" y1="100" x2="388" y2="138" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <!-- Notification -->
  <rect x="390" y="125" width="120" height="28" rx="6" fill="#faf5ff" stroke="#7c3aed" stroke-width="1.5"/>
  <text x="450" y="141" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#6d28d9">notification-service</text>
  <!-- seta Auth -> DB -->
  <line x1="510" y1="60" x2="568" y2="60" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <!-- seta Auction -> DB -->
  <line x1="510" y1="100" x2="568" y2="80" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <!-- Auction -> Redis -->
  <line x1="510" y1="110" x2="568" y2="120" stroke="#94a3b8" stroke-width="1.2" marker-end="url(#arr)"/>
  <!-- DB -->
  <rect x="570" y="40" width="110" height="50" rx="6" fill="#fefce8" stroke="#ca8a04" stroke-width="1.5"/>
  <text x="625" y="62" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#92400e">PostgreSQL</text>
  <text x="625" y="77" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#92400e">Leiloes, Lances</text>
  <text x="625" y="90" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#cbd5e1">porta 5432</text>
  <!-- Redis -->
  <rect x="570" y="105" width="110" height="40" rx="6" fill="#fff1f2" stroke="#e11d48" stroke-width="1.5"/>
  <text x="625" y="122" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="600" fill="#be123c">Redis</text>
  <text x="625" y="137" text-anchor="middle" font-family="system-ui,sans-serif" font-size="9" fill="#be123c">Pub/Sub notificacoes</text>
</svg>
"""

# ── Gerador HTML ───────────────────────────────────────────────────────────────

def _cor_role(role):
    if role == "admin":
        return "#dc2626", "#fef2f2"
    if role == "transportadora":
        return "#2563eb", "#eff6ff"
    if role == "todos":
        return "#16a34a", "#f0fdf4"
    return "#6b7280", "#f9fafb"

def _cor_direcao(direcao):
    if "broadcast" in direcao or "push" in direcao:
        return "#7c3aed"
    if "server" in direcao and "client" not in direcao.split("→")[0]:
        return "#7c3aed"
    return "#0ea5e9"

def gerar_html():
    agora = datetime.now().strftime("%d/%m/%Y %H:%M")

    total_eventos = sum(len(g["eventos"]) for g in EVENTOS)

    grupos_html = ""
    for grupo in EVENTOS:
        cor = grupo["cor"]
        eventos_html = ""
        for ev in grupo["eventos"]:
            cor_role, bg_role = _cor_role(ev["role"])
            cor_dir = _cor_direcao(ev["direcao"])
            eventos_html += f"""
        <details class="event-item">
          <summary class="event-summary">
            <span class="event-badge" style="background:{cor};color:#fff">{ev["nome"]}</span>
            <span class="event-dir" style="color:{cor_dir}">{ev["direcao"]}</span>
            <span class="event-role" style="color:{cor_role};background:{bg_role}">{ev["role"]}</span>
            <span class="event-desc-short">{ev["descricao"][:80]}{"..." if len(ev["descricao"]) > 80 else ""}</span>
          </summary>
          <div class="event-body">
            <p class="desc-full">{ev["descricao"]}</p>
            <div class="payload-grid">
              <div class="payload-block">
                <div class="payload-label">Payload enviado</div>
                <pre class="payload-code">{ev["request"]}</pre>
              </div>
              <div class="payload-block">
                <div class="payload-label">Evento de resposta: <code class="resp-event">{ev["response_event"]}</code></div>
                <pre class="payload-code">{ev["response"]}</pre>
              </div>
            </div>
          </div>
        </details>"""

        grupos_html += f"""
      <div class="group">
        <div class="group-header" style="border-left:4px solid {cor}">
          <span class="group-title" style="color:{cor}">{grupo["grupo"]}</span>
          <span class="group-count">{len(grupo["eventos"])} evento{"s" if len(grupo["eventos"]) != 1 else ""}</span>
        </div>
        <div class="group-events">{eventos_html}
        </div>
      </div>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Docs — DJMC Leiloes de Frete</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #f8fafc;
      color: #1e293b;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }}
    .topbar {{
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 0 32px;
      height: 56px;
      display: flex;
      align-items: center;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 10;
    }}
    .topbar .logo {{ height: 36px; width: auto; }}
    .topbar .logo-placeholder {{ font-size: 18px; font-weight: 800; color: #f97316; }}
    .topbar-title {{ font-weight: 700; font-size: 16px; color: #1e293b; }}
    .topbar-version {{
      font-size: 11px; font-weight: 600; color: #f97316;
      background: #fff7ed; border: 1px solid #fed7aa;
      border-radius: 12px; padding: 2px 10px;
    }}
    .topbar-transport {{
      margin-left: auto;
      font-size: 11px; color: #64748b;
      background: #f1f5f9; border-radius: 6px; padding: 4px 10px;
    }}
    .container {{
      max-width: 1000px;
      margin: 0 auto;
      padding: 32px 20px 80px;
    }}
    .info-block {{
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 24px 28px;
      margin-bottom: 28px;
    }}
    .info-block h1 {{ font-size: 22px; font-weight: 700; margin-bottom: 4px; }}
    .info-block .subtitle {{ color: #64748b; margin-bottom: 16px; font-size: 13px; }}
    .info-block .badges {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }}
    .badge-info {{
      font-size: 11px; font-weight: 600; border-radius: 12px;
      padding: 3px 10px; border: 1px solid;
    }}
    .arch-block {{
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 28px;
    }}
    .arch-block h2 {{
      font-size: 13px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; color: #64748b; margin-bottom: 16px;
    }}
    .legend {{
      display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px;
      font-size: 11px; color: #64748b;
    }}
    .legend-item {{ display: flex; align-items: center; gap: 5px; }}
    .legend-dot {{ width: 10px; height: 10px; border-radius: 2px; }}
    .group {{
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }}
    .group-header {{
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: #fafafa;
      border-bottom: 1px solid #e2e8f0;
    }}
    .group-title {{ font-weight: 700; font-size: 15px; }}
    .group-count {{ font-size: 12px; color: #94a3b8; margin-left: auto; }}
    .event-item {{ border-bottom: 1px solid #f1f5f9; }}
    .event-item:last-child {{ border-bottom: none; }}
    .event-summary {{
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 20px;
      user-select: none;
    }}
    .event-summary:hover {{ background: #f8fafc; }}
    .event-summary::-webkit-details-marker {{ display: none; }}
    .event-badge {{
      font-family: "Consolas", "Courier New", monospace;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 4px;
      flex-shrink: 0;
      min-width: 160px;
      text-align: center;
    }}
    .event-dir {{
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }}
    .event-role {{
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 10px;
      flex-shrink: 0;
    }}
    .event-desc-short {{ font-size: 12px; color: #64748b; flex: 1; min-width: 0; }}
    .event-body {{
      padding: 16px 20px 20px 20px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }}
    .desc-full {{ color: #475569; margin-bottom: 16px; font-size: 13px; }}
    .payload-grid {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }}
    @media (max-width: 640px) {{ .payload-grid {{ grid-template-columns: 1fr; }} }}
    .payload-block {{}}
    .payload-label {{
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #94a3b8;
      margin-bottom: 6px;
    }}
    .resp-event {{
      font-size: 11px;
      color: #f97316;
      background: #fff7ed;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #fed7aa;
    }}
    .payload-code {{
      background: #1e293b;
      color: #e2e8f0;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.6;
      padding: 14px 16px;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre;
    }}
    .transport-note {{
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 14px 20px;
      margin-bottom: 28px;
      font-size: 13px;
      color: #9a3412;
    }}
    .transport-note strong {{ color: #c2410c; }}
    footer {{
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      margin-top: 40px;
    }}
  </style>
</head>
<body>
  <div class="topbar">
    {_logo_tag}
    <span class="topbar-title">DJMC Leiloes de Frete — API Docs</span>
    <span class="topbar-version">v1.0</span>
    <span class="topbar-transport">Socket.IO + HTTP long-polling | porta 5000</span>
  </div>

  <div class="container">
    <div class="info-block">
      <h1>API de Leilao Reverso de Fretes</h1>
      <p class="subtitle">Documentacao dos eventos Socket.IO expostos pelo Gateway (BFF) — gerada em {agora}</p>
      <div class="badges">
        <span class="badge-info" style="color:#f97316;background:#fff7ed;border-color:#fed7aa">
          {total_eventos} eventos
        </span>
        <span class="badge-info" style="color:#16a34a;background:#f0fdf4;border-color:#bbf7d0">
          3 microsservicos gRPC
        </span>
        <span class="badge-info" style="color:#7c3aed;background:#faf5ff;border-color:#ddd6fe">
          Redis Pub/Sub
        </span>
        <span class="badge-info" style="color:#0ea5e9;background:#f0f9ff;border-color:#bae6fd">
          PostgreSQL
        </span>
      </div>
      <p style="color:#475569;font-size:13px">
        A comunicacao do frontend com o backend e feita exclusivamente via <strong>Socket.IO</strong>
        com transporte HTTP long-polling (WebSocket desativado por incompatibilidade entre
        gRPC C extension e eventlet monkey-patch). O Gateway traduz cada evento em chamadas gRPC
        para os microsservicos internos.
      </p>
    </div>

    <div class="arch-block">
      <h2>Arquitetura</h2>
      {ARCH_SVG}
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>Gateway (BFF)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#16a34a"></div>auth-service (50052)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#3b82f6"></div>auction-service (50051)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#7c3aed"></div>notification-service (50053)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#ca8a04"></div>PostgreSQL (5432)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#e11d48"></div>Redis (6379)</div>
      </div>
    </div>

    <div class="transport-note">
      <strong>Transporte:</strong> todos os eventos usam <code>socket.io-client</code> com
      <code>transports: ['polling']</code>. Conecte em <code>http://localhost:5000</code>.
      Cada leilao tem uma <strong>room</strong> propria (<code>leilao_{{id}}</code>) — use
      <code>join_auction</code> para entrar e receber broadcasts em tempo real.
    </div>

    {grupos_html}

    <footer>DJMC Leiloes &mdash; Projeto Academico CIN0143 UFPE &mdash; gerado em {agora}</footer>
  </div>
</body>
</html>"""

if __name__ == "__main__":
    html = gerar_html()
    out = "swagger.html"
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Documentacao gerada: {out}")
