# TESTES - Plano e guia de testes automatizados

Documento para quem vai implementar os testes do backend. Explica **o que importa testar** (com foco nos conceitos de Sistemas Distribuídos e Redes), **quais ferramentas usar**, **como organizar** e **como rodar**, com exemplos concretos do nosso código.

> Regra de ouro: este projeto não precisa de cobertura alta em tudo. Precisa de poucos testes, certeiros, que provem os conceitos que a disciplina cobra. O alvo é a **sincronização de concorrência** e a **comunicação entre serviços (broker / pub-sub)**, não a UI.

---

## 1. O que importa testar (e o que não importa)

A nota e a defesa do projeto giram em torno destes pontos. Estão em ordem de prioridade.

### A. Sincronização — o `threading.Lock` (PRIORIDADE MÁXIMA)

É o coração do trabalho ("a ordem de chegada define o vencedor, sem empate"). Mora em `services/auction/state.py`, no método `registrar_lance()`. Precisa testar:

- **Lances iguais concorrentes** → exatamente **1 aceito**, os demais rejeitados.
- **Estresse concorrente** (N threads, valores variados) → estado final consistente: `menor_lance` só decresce, o número de lances aceitos bate com `historico_lances`, nenhum "lost update".
- **Validação atômica**: o teto lido e o registro acontecem dentro do mesmo lock.

### B. Regras do BID (validação no servidor)

Também em `registrar_lance()`:

- `valor < teto` **estritamente** (valor igual ao teto é rejeitado — é isso que elimina o empate).
- `valor <= 0` rejeitado; `transportadora_id` vazio rejeitado.
- Lance em leilão **encerrado** rejeitado.
- Primeiro lance precisa ser menor que `valor_inicial`.

### C. Estado e encerramento

- `obter_status()` reflete menor lance, líder, total de lances, encerrado.
- `encerrar_leilao()` define o vencedor correto (ou "nenhum lance" quando não houve lance).

### D. Pub/sub — o broker Redis (conceito da arquitetura de microsserviços)

- Lance aceito → o auction-service **publica** o evento no canal certo `leilao:<id>` (`services/auction/notifier.py`).
- O notification-service **assina e entrega** o `AuctionUpdate` correto (`services/notification/server.py`).
- **Isolamento**: evento do leilão A não chega a quem assina o leilão B.
- Evento de encerramento carrega `encerrado=true`.

### E. Autenticação (mais simples, mas vale)

Em `services/auth/server.py` e `services/auth/database.py`:

- Login de admin (senha certa e errada).
- Criar transportadora; duplicada é rejeitada; depois logar com ela.

### Fora de escopo (não gastar esforço)

- Testes do frontend React (não é onde os conceitos de SD vivem).
- Testar o gateway exaustivamente (é só tradução Socket.IO ↔ gRPC; é coberto de leve nos testes de integração/E2E).

---

## 2. As camadas de teste (pirâmide)

Quanto mais embaixo, mais rápido e mais valioso aqui.

| Camada | O que cobre | Precisa de infra? | Onde foca |
|---|---|---|---|
| **Unitário** | `AuctionState.registrar_lance` e `Notifier.publish` | Não (db fake, fakeredis) | A, B, C, parte de D |
| **Integração** | servicers gRPC reais; fluxo auction -> Redis -> notification | Redis/Postgres leves | D, E |
| **E2E (manual ou script)** | stack inteira via docker-compose | Sim | sanidade geral |

A maior parte do valor está no **unitário de concorrência** (item A): roda em milissegundos, sem Docker, e prova o conceito direto. A arquitetura ajuda — o `AuctionState` recebe o `db` no construtor, então dá pra injetar um fake.

---

## 3. Ferramentas

**Backend (Python) — o principal:**

- **pytest** — runner padrão. Base de tudo.
- **`threading` + `threading.Barrier`** (stdlib) — para os testes de concorrência. O `Barrier` faz todas as threads baterem no lock **no mesmo instante**, maximizando a corrida (sem isso o teste não prova nada). Rodar em loop (ex.: 100x) para detectar flakiness.
- **fakeredis** — Redis em memória, para testar o `publish` do notifier e a entrega do notification-service sem subir container.
- **pytest-cov** (cobertura) e **pytest-timeout** (pega travas em streams) — apoio opcional.

**Banco nos testes unitários:** não usar Postgres. Injetar um **FakeDB** (objeto stub) no `AuctionState`. Para testar o `auth/database.py` de verdade, dá para usar **SQLite in-memory** via SQLAlchemy (trocando a `DATABASE_URL` por `sqlite:///:memory:`).

**Integração mais fiel (opcional):** **testcontainers-python** sobe Redis/Postgres reais em Docker durante o teste. Mais fiel, mais lento. Use só se quiserem provar o fluxo com infra real.

**Frontend (opcional, baixa prioridade):** **Vitest** + **React Testing Library**. Não recomendo gastar esforço aqui.

Dependências de teste sugeridas (`requirements-dev.txt`):
```
pytest==8.*
fakeredis==2.*
pytest-cov==6.*
pytest-timeout==2.*
```

---

## 4. Organização dos testes

Como é uma arquitetura de microsserviços e os módulos usam **imports flat** (ex.: `from database import Database`, `import auction_pb2`), o jeito mais limpo é **cada serviço ter seu próprio `tests/`**, rodado com aquele serviço no path. Isso evita colisão de nomes (cada serviço tem o seu `database.py`) e casa com o layout de execução.

```
services/
├── auction/
│   ├── conftest.py          # coloca a pasta do servico no sys.path + fixtures (FakeDB)
│   └── tests/
│       ├── test_state.py    # A + B + C (Lock, validacao, concorrencia, encerramento)
│       └── test_notifier.py # D (publish no Redis, via fakeredis)
├── auth/
│   ├── conftest.py
│   └── tests/
│       └── test_auth.py     # E (login, criar transportadora) com SQLite in-memory
└── notification/
    ├── conftest.py
    └── tests/
        └── test_subscribe.py # D (assina canal e entrega evento, via fakeredis)
requirements-dev.txt
```

### Tornando os módulos importáveis (detalhe que economiza dor de cabeça)

Os módulos foram escritos para rodar como script flat dentro do container (`WORKDIR=/app`). Para o pytest enxergá-los, ponha um `conftest.py` na raiz de cada serviço adicionando o diretório ao path:

```python
# services/auction/conftest.py
import os, sys
sys.path.insert(0, os.path.dirname(__file__))             # torna 'state', 'database', 'notifier' importaveis
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))  # so para testes que usam os stubs
```

- Testes de **`state.py` e `notifier.py`** NÃO precisam dos stubs gRPC (eles importam só `database`/`redis`). Rodam sem Docker e sem `protoc`.
- Testes que importam **`server.py`** (servicer) precisam dos stubs `*_pb2`. Gere-os antes (ver `docs/SETUP.md`, seção "sem Docker") ou rode esses testes dentro do container.

---

## 5. Exemplos concretos

### 5.1 A estrela — lances empatados concorrentes (`test_state.py`)

```python
import threading
from state import AuctionState   # com services/auction no sys.path (conftest)

class FakeDB:
    """db falso: o AuctionState so chama registrar_lance e encerrar_leilao."""
    def registrar_lance(self, **kw): pass
    def encerrar_leilao(self, **kw): pass

def novo_estado(valor_inicial=10000):
    return AuctionState(
        leilao_id=1, titulo="t", descricao_carga="d", especificacoes="",
        valor_inicial=valor_inicial, join_code="ABC123", tempo_total_s=0, db=FakeDB(),
    )

def test_lances_iguais_so_um_vence():
    for _ in range(100):                      # roda varias vezes para pegar flakiness
        state = novo_estado()
        N = 20
        barrier = threading.Barrier(N)
        aceitos = []
        def lance(quem):
            barrier.wait()                    # todas as threads batem no lock juntas
            ok, _, _ = state.registrar_lance(9500, quem)
            aceitos.append(ok)
        threads = [threading.Thread(target=lance, args=(f"t{i}",)) for i in range(N)]
        for t in threads: t.start()
        for t in threads: t.join()
        assert sum(aceitos) == 1              # exatamente um venceu, sem empate
        assert len(state.historico_lances) == 1
```

### 5.2 Validação do BID (`test_state.py`)

```python
def test_lance_maior_ou_igual_rejeitado():
    state = novo_estado(valor_inicial=10000)
    assert state.registrar_lance(10000, "a")[0] is False   # igual ao inicial: rejeitado
    assert state.registrar_lance(9000, "a")[0] is True      # menor: aceito
    assert state.registrar_lance(9000, "b")[0] is False     # igual ao teto: rejeitado
    assert state.registrar_lance(0, "b")[0] is False        # <= 0: rejeitado
    assert state.registrar_lance(8000, "")[0] is False      # id vazio: rejeitado

def test_lance_em_leilao_encerrado():
    state = novo_estado()
    state.encerrar_leilao()
    assert state.registrar_lance(5000, "a")[0] is False
```

### 5.3 Pub/sub — publish do notifier (`test_notifier.py`)

```python
import json
import fakeredis
from notifier import Notifier

def test_publica_no_canal_do_leilao(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr("notifier.redis.from_url", lambda url: fake)

    pubsub = fake.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe("leilao:7")

    n = Notifier("redis://fake")
    n.publish(7, {"menor_lance": 9000, "transportadora_lider": "sp",
                  "timestamp": 1, "encerrado": False, "mensagem": "x",
                  "leilao_id": 7, "tempo_restante_s": 0})

    msg = pubsub.get_message(timeout=1)
    assert msg is not None
    assert json.loads(msg["data"])["menor_lance"] == 9000

def test_isolamento_entre_leiloes(monkeypatch):
    fake = fakeredis.FakeStrictRedis()
    monkeypatch.setattr("notifier.redis.from_url", lambda url: fake)
    pubsub = fake.pubsub(ignore_subscribe_messages=True)
    pubsub.subscribe("leilao:1")                       # assina o leilao 1
    Notifier("redis://fake").publish(2, {"leilao_id": 2, "menor_lance": 1,
        "transportadora_lider": "x", "timestamp": 1, "encerrado": False,
        "mensagem": "y", "tempo_restante_s": 0})       # publica no leilao 2
    assert pubsub.get_message(timeout=0.3) is None     # nao recebe (isolado)
```

### 5.4 Auth com SQLite (`test_auth.py`)

```python
from database import Database   # services/auth no sys.path

def test_criar_e_validar_transportadora():
    db = Database("sqlite:///:memory:")
    db.criar_tabelas()
    ok, _ = db.criar_transportadora("translog_sp", "123")
    assert ok is True
    assert db.criar_transportadora("translog_sp", "123")[0] is False  # duplicada
    assert db.validar_transportadora("translog_sp", "123") is True
    assert db.validar_transportadora("translog_sp", "errada") is False
```

---

## 6. Como rodar

```bash
# instalar dependencias de teste
pip install -r requirements-dev.txt

# rodar os testes de um servico (de dentro da pasta dele)
cd services/auction && python -m pytest -v

# ou todos, apontando a pasta (o conftest de cada servico ajusta o path)
python -m pytest services/auction services/auth services/notification -v

# com cobertura
python -m pytest services/auction --cov=. --cov-report=term-missing
```

Os testes de `state.py`, `notifier.py` e `auth/database.py` rodam sem Docker. Os que importam os servicers (`server.py`) precisam dos stubs gerados (ver `docs/SETUP.md`).

---

## 7. Checklist de casos (a pessoa pode ir marcando)

| # | Caso | Conceito | Camada |
|---|---|---|---|
| 1 | N lances iguais concorrentes -> exatamente 1 aceito | Exclusão mútua / ordenação total | unit |
| 2 | Estresse: N threads, valores variados -> estado consistente | Concorrência sem lost update | unit |
| 3 | Lance igual ao teto rejeitado (`<` estrito) | Regra que elimina empate | unit |
| 4 | Lance <= 0 e id vazio rejeitados | Validação | unit |
| 5 | Lance em leilão encerrado rejeitado | Estado | unit |
| 6 | Primeiro lance precisa ser < valor_inicial | Validação | unit |
| 7 | `obter_status` reflete líder/menor/total/encerrado | Estado | unit |
| 8 | `encerrar_leilao` define vencedor correto (e caso sem lance) | Estado | unit |
| 9 | `publish` envia no canal `leilao:<id>` certo | Pub/sub | unit |
| 10 | Isolamento: evento de um leilão não vaza para outro | Pub/sub / isolamento | unit |
| 11 | notification-service entrega o `AuctionUpdate` ao assinar | Broker -> streaming | integração |
| 12 | Login admin (ok/errado) e criar/validar transportadora | Auth | unit/integração |
| 13 | (E2E) fluxo completo bid -> Redis -> notification -> cliente | Cadeia toda | e2e |

---

## 8. Armadilhas e dicas

- **Sem `Barrier`, o teste de concorrência não prova nada.** Se as threads não baterem no lock ao mesmo tempo, elas serializam naturalmente e o teste "passa" sem testar a corrida. Use `threading.Barrier(N)` e rode em loop.
- **Isolar estado entre testes**: crie um `AuctionState` novo em cada teste (não reutilize), senão o `menor_lance` vaza de um teste pro outro.
- **fakeredis no notifier**: o `Notifier` faz `redis.from_url(url)` no `__init__`. Faça `monkeypatch.setattr("notifier.redis.from_url", lambda url: fake)` para injetar o fake.
- **Streams (notification-service)**: o `SubscribeUpdates` é um gerador que bloqueia em `pubsub.get_message(timeout=1.0)`. Em teste, use `pytest-timeout` e/ou rode a assinatura numa thread, publique, e colete o primeiro evento.
- **Não testar timing real do timer**: o encerramento por `threading.Timer` é difícil e frágil de testar por tempo. Teste a função `encerrar_leilao()` diretamente, não o agendamento.

---

## 9. Resumo de uma frase

Foco nos testes unitários de `AuctionState.registrar_lance` (sincronização e validação, com `threading.Barrier`) e no `Notifier`/notification-service (pub/sub com `fakeredis`), usando **pytest**. Isso prova os conceitos de redes/SD que importam, sem inflar a suíte.
