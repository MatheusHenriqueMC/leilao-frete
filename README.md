# Plataforma de Negociação de Fretes

Sistema distribuído cliente-servidor para leilão reverso de fretes. Transportadoras competem enviando lances decrescentes para carregar uma carga anunciada pelo servidor. O menor lance vence; em caso de empate, a ordem de chegada define o vencedor.

> **Status atual:** Entrega 3 — Servidor multicliente e comandos via console

## Tecnologias Escolhidas

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Linguagem | Python 3.10+ | Familiaridade da equipe, suporte oficial ao gRPC e stdlib completa para concorrência |
| Comunicação | gRPC + Protocol Buffers | Contrato tipado via `.proto`, serialização binária eficiente e suporte a server streaming para notificações |
| Concorrência | `threading` + `Lock` | Integrado ao `ThreadPoolExecutor` do gRPC; permite demonstrar exclusão mútua explícita na seção crítica |
| Dados em memória | Lista ordenada + timestamps (ms) | Fila de lances ordenada por menor valor, com desempate por ordem de chegada |

### Por que essas escolhas?

- **Python vs Java/Go/Node.js:** Java traz boilerplate excessivo para o escopo. Go exigiria aprender uma linguagem nova em paralelo. Node.js (single-threaded) esconderia os problemas de sincronização que o projeto exige demonstrar.
- **gRPC vs REST vs Socket puro:** O enunciado exige framework (não socket puro). REST não suporta push nativo do servidor — exigiria polling. gRPC com server streaming resolve notificações de forma nativa.
- **threading vs asyncio:** `asyncio` elimina race conditions por design, removendo a oportunidade de demonstrar sincronização explícita com `Lock`. A API `grpc.aio` também possui inconsistências entre versões.

## Estrutura do Projeto

```
freight-auction/
├── protos/
│   └── freight.proto              # Definições Protocol Buffers
├── server/
│   ├── __init__.py
│   ├── auction.py                 # Estado central em memória com Lock
│   └── server.py                  # Servidor gRPC multicliente (porta 50051)
├── client/
│   ├── __init__.py
│   └── client.py                  # Cliente console (BID, STATUS, SAIR)
├── generated/
│   ├── __init__.py
│   ├── freight_pb2.py             # Stubs gerados — mensagens
│   └── freight_pb2_grpc.py        # Stubs gerados — serviço
├── docs/
│   └── protocolo.md               # Documentação detalhada do protocolo
├── requirements.txt
└── README.md
```

## Arquivo .proto

O contrato do serviço está definido em `protos/freight.proto` usando proto3. Ele declara um serviço `FreightAuction` com três RPCs:

| RPC | Tipo | Descrição |
|---|---|---|
| `PlaceBid` | Unário | Cliente envia `BidRequest` com valor e ID. Servidor valida e responde com `BidResponse` |
| `GetStatus` | Unário | Cliente solicita estado atual. Servidor responde com `StatusResponse` |
| `SubscribeUpdates` | Server streaming | Cliente se inscreve e recebe `AuctionUpdate` a cada novo menor lance |

As mensagens definidas no `.proto` são:

```
BidRequest          { valor: float, transportadora_id: string }
BidResponse         { aceito: bool, menor_lance_atual: float, mensagem: string }
StatusRequest       { }
StatusResponse      { menor_lance: float, transportadora_lider: string, timestamp: int64, total_lances: int32 }
SubscriptionRequest { transportadora_id: string }
AuctionUpdate       { menor_lance: float, transportadora_lider: string, timestamp: int64 }
```

Os stubs Python são gerados com o comando:

```bash
python -m grpc_tools.protoc -I protos/ --python_out=generated/ --grpc_python_out=generated/ protos/freight.proto
```

## Fila Ordenada em Memória

O servidor mantém uma lista ordenada de lances válidos no `AuctionState` (arquivo `server/auction.py`). Cada entrada na fila é um dataclass `Lance` com três campos:

| Campo | Tipo | Descrição |
|---|---|---|
| `valor` | `float` | Valor do lance |
| `transportadora_id` | `str` | ID de quem fez o lance |
| `timestamp_ms` | `int` | Momento do registro em milissegundos desde epoch |

O estado central é protegido por `threading.Lock()` e contém:

- **`carga`** — dados da carga anunciada (descrição + valor inicial), imutável após criação
- **`menor_lance`** — referência ao lance vencedor atual (ou `None` se nenhum lance)
- **`historico_lances`** — lista com todos os lances válidos aceitos, em ordem de registro
- **`participantes`** — set de IDs das transportadoras conectadas (para notificações via stream)

## Lógica de Desempate

O critério de ordenação é: **menor valor vence**. Em caso de dois lances com o mesmo valor, a **ordem de chegada (timestamp em milissegundos) é o critério absoluto**.

Na prática, empates não ocorrem por causa do `threading.Lock()`. O fluxo de dois lances simultâneos é:

1. Transportadora A e Transportadora B enviam `BID 500` ao mesmo tempo
2. Ambas as chamadas chegam em threads separadas do `ThreadPoolExecutor`
3. A primeira thread a adquirir o `Lock` entra na seção crítica
4. Dentro do lock, ela captura o timestamp, valida que `500 < teto_atual`, registra o lance e atualiza o `menor_lance`
5. O lock é liberado
6. A segunda thread adquire o lock, captura seu timestamp, mas agora o teto é `500`
7. Como `500` não é estritamente menor que `500`, o lance é **rejeitado**
8. Resultado: o primeiro a adquirir o lock venceu — a serialização é determinística

O timestamp é capturado **dentro** do lock (não antes), garantindo que ele reflete exatamente a ordem real de processamento.

## Como Rodar

### Pré-requisitos

- Python 3.10 ou superior
- pip

### Instalação

```bash
git clone https://github.com/SEU_USUARIO/freight-auction.git
cd freight-auction
pip install -r requirements.txt
```

### Executar o servidor

```bash
python -m server.server
```

O servidor inicia na porta `50051` e exibe logs de todas as operações no console.

### Executar o cliente

Em outro terminal:

```bash
python -m client.client
```

O cliente pedirá o ID da transportadora e aceitará os seguintes comandos:

```
BID <valor>    — Enviar um lance (ex: BID 5000)
STATUS         — Consultar estado atual do leilão
SAIR           — Desconectar do servidor
```

### Simulando lances concorrentes de múltiplas transportadoras

Para testar concorrência, abra 3 terminais:

**Terminal 1 — Servidor:**
```bash
python -m server.server
```

**Terminal 2 — Transportadora A:**
```bash
python -m client.client
# ID: TranspA
# >>> BID 8000
# >>> STATUS
```

**Terminal 3 — Transportadora B:**
```bash
python -m client.client
# ID: TranspB
# >>> BID 5000     (aceito — menor que 8000)
# >>> BID 9000     (rejeitado — maior que 5000)
# >>> STATUS       (mostra TranspB como líder)
```

Ao executar `BID 5000` no Terminal 3, o Terminal 2 (TranspA) recebe automaticamente a notificação:

```
[NOTIFICAÇÃO] Novo menor lance: R$ 5000.00 por 'TranspB' (timestamp: )
```

### Verificando ordenação por ordem de chegada (desempate)

Para testar o cenário de empate, ambas as transportadoras tentam dar o mesmo lance:

**Terminal 2 — TranspA:**
```
>>> BID 3000
  ✓ Lance registrado com sucesso! | Menor lance: R$ 3000.00
```

**Terminal 3 — TranspB (imediatamente depois):**
```
>>> BID 3000
  ✗ Lance deve ser menor que 3000.0. | Menor lance: R$ 3000.00
```

O lance de TranspB é rejeitado porque TranspA adquiriu o lock primeiro. O servidor garante que **não existe empate** — o lock serializa os acessos e o primeiro a entrar na seção crítica vence.

### Logs do servidor

O servidor exibe logs estruturados para todas as operações:

```
[2025-06-19 01:29:17] INFO - Leilão iniciado: 'Carga de exemplo — 20 toneladas, São Paulo → Recife' | Valor inicial: R$ 10000.00
[2025-06-19 01:29:17] INFO - Servidor rodando na porta 50051. Ctrl+C para parar.
[2025-06-19 01:29:19] INFO - Lance recebido: R$ 8000.00 da transportadora 'TranspA'
[2025-06-19 01:29:19] INFO - Lance aceito! Novo menor lance: R$ 8000.00
[2025-06-19 01:29:19] INFO - Notificação enviada para 1 participante(s).
[2025-06-19 01:29:19] INFO - Status solicitado. Menor lance: R$ 8000.00
[2025-06-19 01:29:22] INFO - Lance recebido: R$ 5000.00 da transportadora 'TranspB'
[2025-06-19 01:29:22] INFO - Lance aceito! Novo menor lance: R$ 5000.00
[2025-06-19 01:29:22] INFO - Notificação enviada para 2 participante(s).
[2025-06-19 01:29:25] INFO - Lance recebido: R$ 7000.00 da transportadora 'TranspC'
[2025-06-19 01:29:25] INFO - Lance rejeitado: Lance deve ser menor que 5000.0.
```

## Equipe

- Ágata
- Daniel Ramos
- Felipe Leite
- Matheus Henrique
- Matheus Stepple

## Licença

MIT
