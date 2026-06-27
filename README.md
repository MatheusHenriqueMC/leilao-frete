# Plataforma de Negociação de Fretes

Sistema distribuído cliente-servidor para leilão reverso de fretes. Transportadoras competem enviando lances decrescentes para carregar uma carga anunciada pelo servidor. O menor lance vence; em caso de empate, a ordem de chegada define o vencedor.

> **Status atual:** Entrega 4 — Interface gráfica completa, broadcast automático de lances e sincronização atômica

## Tecnologias Escolhidas

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Linguagem | Python 3.12 | Familiaridade da equipe, suporte oficial ao gRPC e stdlib completa para concorrência |
| Comunicação | gRPC + Protocol Buffers | Contrato tipado via `.proto`, serialização binária eficiente e suporte a server streaming para notificações |
| Concorrência | `threading` + `Lock` | Integrado ao `ThreadPoolExecutor` do gRPC; permite demonstrar exclusão mútua explícita na seção crítica |
| Persistência | PostgreSQL + SQLAlchemy | Persistência dos leilões e lances entre reinicializações do servidor |
| Gateway | Flask + Flask-SocketIO | BFF (Backend for Frontend) que traduz WebSocket/polling ↔ gRPC |
| Frontend | React + TypeScript + Vite + Tailwind CSS | Interface responsiva e em tempo real para transportadoras e administradores |
| Infraestrutura | Docker Compose | Orquestração dos serviços: banco, servidor gRPC e gateway |

### Por que essas escolhas?

- **Python vs Java/Go/Node.js:** Java traz boilerplate excessivo para o escopo. Go exigiria aprender uma linguagem nova em paralelo. Node.js (single-threaded) esconderia os problemas de sincronização que o projeto exige demonstrar.
- **gRPC vs REST vs Socket puro:** O enunciado exige framework (não socket puro). REST não suporta push nativo do servidor — exigiria polling. gRPC com server streaming resolve notificações de forma nativa.
- **threading vs asyncio:** `asyncio` elimina race conditions por design, removendo a oportunidade de demonstrar sincronização explícita com `Lock`. A API `grpc.aio` também possui inconsistências entre versões.
- **Flask-SocketIO como gateway:** O React não fala gRPC diretamente — o gateway traduz eventos de polling/WebSocket em chamadas gRPC, isolando o frontend da camada de transporte.

## Estrutura do Projeto

```
freight-auction/
├── protos/
│   └── freight.proto              # Definições Protocol Buffers
├── server/
│   ├── auction.py                 # Estado central em memória com Lock
│   ├── database.py                # Modelos SQLAlchemy e CRUD (PostgreSQL)
│   └── server.py                  # Servidor gRPC multicliente (porta 50051)
├── gateway/
│   └── gateway.py                 # WebSocket/polling gateway (Flask-SocketIO)
├── frontend/
│   └── src/
│       ├── hooks/useSocket.ts     # Hook central de comunicação com o gateway
│       ├── pages/
│       │   ├── LoginPage.tsx      # Login unificado (admin/transportadora)
│       │   ├── AdminDashboard.tsx # Painel admin: criar leilões, gerenciar contas
│       │   ├── AdminPage.tsx      # Gerenciamento de leilão específico
│       │   ├── TransportadoraDashboard.tsx # Lista de leilões ativos
│       │   └── AuctionPage.tsx    # Sala do leilão em tempo real
│       └── components/            # StatusPanel, BidHistory, modais, etc.
├── generated/                     # Stubs gerados pelo protoc (não editar)
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── README.md
```

## Arquivo .proto

O contrato do serviço está definido em `protos/freight.proto` usando proto3. Ele declara um serviço `FreightAuction` com os seguintes RPCs:

| RPC | Tipo | Descrição |
|---|---|---|
| `Login` | Unário | Autentica admin (credenciais) ou transportadora cadastrada |
| `CreateAuction` | Unário | Admin cria novo leilão com imagens, especificações e timer opcional |
| `CreateCarrier` | Unário | Admin cadastra conta de transportadora com usuário e senha |
| `ListAuctions` | Unário | Lista leilões ativos ou histórico completo |
| `GetAuctionDetail` | Unário | Detalhe de um leilão específico com histórico de lances |
| `GetCarrierHistory` | Unário | Leilões em que determinada transportadora participou |
| `ResolveJoinCode` | Unário | Resolve código de 6 caracteres para ID do leilão |
| `PlaceBid` | Unário | Transportadora envia lance; servidor valida e responde com resultado |
| `GetStatus` | Unário | Estado atual de um leilão (menor lance, líder, timer, etc.) |
| `GetHistory` | Unário | Histórico completo de lances de um leilão |
| `CloseAuction` | Unário | Admin encerra o leilão manualmente |
| `SubscribeUpdates` | Server streaming | Transportadora se inscreve e recebe `AuctionUpdate` a cada novo lance |

Os stubs Python são gerados com:

```bash
python -m grpc_tools.protoc -I protos/ --python_out=generated/ --grpc_python_out=generated/ protos/freight.proto
```

## Interface Gráfica

A interface React oferece painéis distintos para cada papel:

### Painel da Transportadora (`AuctionPage`)

Exibe em tempo real:
- **Dados da carga anunciada** — título, descrição, especificações e imagens em carrossel
- **Valor atual do menor lance** — atualizado automaticamente a cada novo lance recebido
- **Timer de encerramento** — contagem regressiva local sincronizada com o servidor
- **Histórico de lances** — tabela com Nº, valor, data/hora e arrematante (lances próprios destacados)
- **Formulário de lance** — botões de valores pré-calculados + campo livre, com etapa de confirmação antes do envio para evitar cliques acidentais
- **Alerta visual de perda de liderança** — ao receber um `auction_update` com novo líder diferente do usuário, o banner de vencedor atualiza imediatamente indicando quem assumiu a liderança

### Painel do Administrador (`AdminDashboard` + `AdminPage`)

- **Dashboard** com cards dos leilões ativos (thumbnail, data/hora, código de acesso)
- **Criar leilão** — modal com: título, descrição, especificações, lance inicial, timer opcional e upload de imagens (comprimidas automaticamente no browser)
- **Criar conta de transportadora** — modal com usuário e senha
- **Histórico de leilões** — modal com lista completa; ao selecionar, exibe dados do leilão e do vencedor
- **Gerenciar leilão ativo** — acesso direto à sala para monitorar lances e encerrar com countdown "Dou-lhe uma, duas, três"

## Broadcast Automático de Lances

O gateway mantém **uma thread gRPC por leilão ativo**. Quando um lance é aceito:

1. O servidor gRPC notifica todos os subscribers via `SubscribeUpdates` (server streaming)
2. A thread do gateway recebe o `AuctionUpdate` e chama `socketio.emit("auction_update", data, to=room)`
3. Todos os clientes na room do leilão recebem a atualização **sem polling manual**
4. O frontend atualiza o painel de status, o histórico de lances e dispara a animação de novo lance

O canal de broadcast é implementado no gateway com rooms isoladas por leilão (`leilao_{id}`), garantindo que transportadoras de leilões diferentes não recebam mensagens cruzadas.

## Sincronização Atômica de Lances

O estado central é protegido por `threading.Lock()` no `AuctionState` (`server/auction.py`). O fluxo de dois lances simultâneos com o mesmo valor é:

1. Transportadora A e Transportadora B enviam `BID 500` ao mesmo tempo
2. Ambas as chamadas chegam em threads separadas do `ThreadPoolExecutor`
3. A primeira thread a adquirir o `Lock` entra na seção crítica
4. Dentro do lock, ela captura o timestamp, valida que `500 < teto_atual`, registra o lance e atualiza `menor_lance`
5. O lock é liberado
6. A segunda thread adquire o lock, mas agora o teto é `500` — como `500` não é estritamente menor, o lance é **rejeitado**
7. Resultado: o primeiro a adquirir o lock venceu — a serialização é determinística e não existe empate

O timestamp é capturado **dentro** do lock (não antes), garantindo que ele reflete exatamente a ordem real de processamento.

## Como Rodar

### Pré-requisitos

- Docker e Docker Compose
- Node.js 18+ (apenas para o frontend)

### Backend (Docker)

```bash
docker-compose up --build
```

Sobe automaticamente:
- **PostgreSQL** na porta `5432`
- **Servidor gRPC** na porta `50051`
- **Gateway Flask-SocketIO** na porta `5000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse em `http://localhost:5173`.

### Credenciais padrão

| Papel | Usuário | Senha |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Transportadora | cadastrado pelo admin | definido pelo admin |

## Simulando Disputa Agressiva de Lances Simultâneos

Para simular múltiplas transportadoras competindo em tempo real:

### 1. Suba o backend

```bash
docker-compose up --build
```

### 2. Abra múltiplos painéis de transportadora

Abra **abas separadas** no browser em `http://localhost:5173`. Cada aba tem sua própria sessão independente (`sessionStorage`), permitindo logar com usuários diferentes simultaneamente:

| Aba | Usuário | Papel |
|---|---|---|
| Aba 1 | `translog_sp` | Transportadora |
| Aba 2 | `translog_rj` | Transportadora |
| Aba 3 | `translog_mg` | Transportadora |
| Aba 4 | `admin` | Administrador |

### 3. Crie um leilão com timer curto

Na aba do admin:
1. Clique em **Criar Leilão**
2. Preencha título, especificações e lance inicial (ex: R$ 10.000)
3. Defina tempo curto (ex: 300 segundos = 5 minutos) para pressionar as transportadoras
4. Adicione uma foto de capa
5. Copie o **código de acesso** gerado e compartilhe com as transportadoras

### 4. Transportadoras entram no leilão

Cada aba de transportadora:
1. Insere o código ou clica no card do leilão na lista de ativos
2. Entra na sala do leilão

### 5. Disparando lances concorrentes

Para simular disputa agressiva, clique em botões de lance em abas diferentes **quase simultaneamente**. O servidor serializa os lances via `threading.Lock()`:

- O primeiro lance a adquirir o lock é aceito
- Lances de valor igual ou maior são rejeitados imediatamente
- Todas as abas recebem o `auction_update` automaticamente, sem refresh

**Comportamento esperado:**

```
Aba 1 (translog_sp): clica em "R$ 9.500" → ✓ Lance aceito
Aba 2 (translog_rj): clica em "R$ 9.500" ao mesmo tempo → ✗ Lance deve ser menor que 9500
Aba 3 (translog_mg): clica em "R$ 9.000" → ✓ Lance aceito — assume liderança
Abas 1 e 2: recebem notificação automática com novo menor lance de translog_mg
```

### 6. Encerramento com countdown

Na aba do admin, dentro do leilão:
1. Clique em **Encerrar Leilão**
2. O sistema exibe o countdown "Dou-lhe uma! → Dou-lhe duas! → Dou-lhe três!"
3. Ao zerar, todas as transportadoras recebem o banner de encerramento com o vencedor

### Logs do servidor

```
[2026-06-27 10:00:00] INFO - Leilão 1 'RECIFE → SP, TRANSPORTE DE BANANAS' criado (código F3T8KZ).
[2026-06-27 10:00:05] INFO - Lance recebido: R$ 9500.00 da transportadora 'translog_sp'
[2026-06-27 10:00:05] INFO - Lance aceito! Novo menor lance: R$ 9500.00
[2026-06-27 10:00:05] INFO - Notificados 3 subscriber(s) do leilão 1.
[2026-06-27 10:00:06] INFO - Lance recebido: R$ 9500.00 da transportadora 'translog_rj'
[2026-06-27 10:00:06] INFO - Lance rejeitado: Lance deve ser menor que 9500.00.
[2026-06-27 10:00:08] INFO - Lance recebido: R$ 9000.00 da transportadora 'translog_mg'
[2026-06-27 10:00:08] INFO - Lance aceito! Novo menor lance: R$ 9000.00
[2026-06-27 10:00:08] INFO - Notificados 3 subscriber(s) do leilão 1.
```

## Equipe

- Ágata
- Daniel Ramos
- Felipe Leite
- Matheus Henrique
- Matheus Stepple

## Licença

MIT
