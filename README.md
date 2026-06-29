# Plataforma de Negociação de Fretes

Sistema distribuído cliente-servidor para **leilão reverso de fretes**. O servidor anuncia uma carga com um valor inicial e as transportadoras competem enviando **lances decrescentes** para transportá-la. O **menor lance vence** e, em caso de empate, **a ordem de chegada decide**, sem empates possíveis.

> Projeto da disciplina CIN0143 (Introdução aos Sistemas Distribuídos e Redes), CIn/UFPE.
> O requisito central é demonstrar **controle de concorrência explícito** no servidor.

## Como funciona em 30 segundos

- O backend é dividido em **microsserviços gRPC**: o **auth-service** (login e contas), o **auction-service** (leilões, lances, status, histórico) e o **notification-service** (entrega das notificações em tempo real).
- O **auction-service** mantém o estado de cada leilão em memória, protegido por um `threading.Lock()`. Cada lance chega numa thread separada; o lock serializa os lances: o primeiro a entrar registra, e um lance de valor igual ou maior é rejeitado.
- Quando um lance é aceito, o auction-service **publica** o evento no **Redis** (pub/sub). O notification-service **assina** o canal e faz **push** aos clientes via server streaming, sem polling.
- O navegador não fala gRPC, então um **gateway** traduz Socket.IO para gRPC e roteia para o serviço certo.

## Stack utilizada

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | React + TypeScript + Vite + MUI | Interface reativa e tipada; MUI dá componentes prontos e consistentes |
| Comunicação navegador | Socket.IO (HTTP long-polling) | Push do servidor para o browser sem conflitar com as threads C do gRPC |
| Gateway (BFF) | Flask + Flask-SocketIO | Traduz Socket.IO para gRPC e roteia para os microsserviços |
| Microsserviços | Python 3.12 + gRPC + Protocol Buffers | Contrato tipado por `.proto`, serialização binária e streaming nativo sobre HTTP/2 |
| Mensageria | Redis (pub/sub) | Broker que desacopla a publicação de eventos (auction) da entrega (notification) |
| Concorrência | `threading` + `Lock` | Permite demonstrar exclusão mútua explícita (o ponto central do trabalho) |
| Persistência | PostgreSQL + SQLAlchemy | Sobrevive a reinício; cada serviço dono das suas tabelas |
| Infraestrutura | Docker + Docker Compose | Sobe banco, Redis e os serviços juntos |

## Arquitetura

```
 FRONTEND          GATEWAY (BFF)         MICROSSERVICOS gRPC
 React+TS+MUI <-->  Flask-SocketIO <-->  auth-service         :50052  --> PostgreSQL :5432
 :5173      Socket  :5000          gRPC  auction-service      :50051  --> PostgreSQL + publica no Redis :6379
            .IO                          notification-service :50053  <-- assina o Redis
                                                ^ gRPC                            |
                                          client.py (CLI)            Redis (pub/sub) :6379
```

Fluxo da notificação: auction-service publica o lance no Redis -> notification-service assina e faz o streaming -> gateway reespalha para o navegador.

| Componente | Tecnologia | Papel | Porta |
|---|---|---|---|
| Frontend | React + TypeScript + Vite + MUI | Interface em tempo real (transportadora e admin) | 5173 |
| Gateway (BFF) | Flask + Flask-SocketIO (modo threading) | Traduz Socket.IO para gRPC e roteia para os serviços | 5000 |
| auth-service | Python 3.12 + gRPC | Login e cadastro de transportadora | 50052 |
| auction-service | Python 3.12 + gRPC | Leilões, lances, lock de concorrência; publica eventos no Redis | 50051 |
| notification-service | Python 3.12 + gRPC | Assina o Redis e entrega as notificações via server streaming | 50053 |
| Redis | Redis (pub/sub) | Broker de mensagens entre auction e notification | 6379 |
| Persistência | PostgreSQL + SQLAlchemy | Postgres compartilhado; cada serviço dono das suas tabelas | 5432 |
| Cliente CLI | Python + gRPC | Fala com o auction-service (lances) e o notification-service (stream) | - |
| Infra | Docker Compose | Sobe banco, Redis e os serviços | - |

## Estrutura do projeto

```
leilao-frete/
├── protos/
│   ├── auth.proto              # Contrato do AuthService
│   ├── auction.proto           # Contrato do AuctionService
│   └── notification.proto      # Contrato do NotificationService (streaming)
├── services/
│   ├── auth/                   # auth-service (login, contas)
│   │   ├── server.py           # AuthServicer (gRPC, porta 50052)
│   │   ├── database.py         # tabela transportadoras
│   │   └── Dockerfile + requirements.txt
│   ├── auction/                # auction-service (leiloes, lances)
│   │   ├── server.py           # AuctionServicer (gRPC, porta 50051)
│   │   ├── state.py            # AuctionState: estado em memória + Lock (seção crítica)
│   │   ├── notifier.py         # publica os eventos de lance no Redis (pub/sub)
│   │   ├── database.py         # tabelas leiloes e lances
│   │   └── Dockerfile + requirements.txt
│   ├── notification/           # notification-service (assina o Redis, faz o streaming)
│   │   ├── server.py           # NotificationServicer (gRPC, porta 50053)
│   │   └── Dockerfile + requirements.txt
│   └── gateway/                # gateway/BFF (Socket.IO <-> gRPC)
│       ├── gateway.py          # roteia para os três serviços
│       └── Dockerfile + requirements.txt
├── client/client.py            # Cliente CLI de texto (BID / STATUS / SAIR)
├── frontend/src/
│   ├── hooks/useSocket.ts      # Hook central de comunicação com o gateway
│   ├── pages/                  # Login, AdminDashboard, AdminPage,
│   │                           #   TransportadoraDashboard, AuctionPage
│   └── components/             # StatusPanel, BidHistory, modais, toasts (MUI)
├── docs/                       # SETUP.md (rodar), REDES.md (apresentação), TESTES.md (plano de testes)
├── docker-compose.yml
└── README.md
```

Cada serviço tem seu próprio `Dockerfile` e `requirements.txt`, gerando os stubs gRPC do seu proto no build.

## Papéis na interface

- **Transportadora**: vê a carga, o menor lance ao vivo, o timer, o histórico e o formulário de lance; recebe um toast sonoro e visual ao perder a liderança.
- **Admin**: cria leilões e contas de transportadora, vê o histórico, monitora a sala e encerra o leilão com o countdown "Dou-lhe uma, duas, três".

## Como rodar

Resumo: `docker-compose up --build` (backend) e, em outro terminal, `cd frontend && npm install && npm run dev` (frontend). Acesse `http://localhost:5173`.

Passo a passo completo, credenciais e solução de problemas em **[docs/SETUP.md](docs/SETUP.md)**.

---

## Detalhamento

### A sincronização (o ponto central do projeto)

Vive no auction-service. Em `services/auction/state.py`, o método `registrar_lance()` faz validação e registro **dentro do mesmo lock**:

1. Adquire o `Lock` do leilão (só uma thread por vez).
2. Lê o teto atual (menor lance, ou o valor inicial se ainda não houve lance).
3. Valida `valor < teto`, estritamente menor. Caso contrário, **rejeita**.
4. Captura o `timestamp` **dentro** do lock, refletindo a ordem real de processamento.
5. Registra o lance, atualiza o líder e libera o lock.
6. A persistência no banco ocorre **fora** do lock, mantendo a seção crítica curta.

Dois lances iguais simultâneos: o primeiro a pegar o lock vence; o segundo encontra o teto já atualizado e é rejeitado por não ser estritamente menor. **Empate é impossível.** Separar a autenticação em outro serviço não toca nesse caminho: todos os lances continuam passando por um único `Lock` no auction-service.

### Caminho de um lance (ponta a ponta)

1. Transportadora clica em um valor no frontend, que emite `bid` via Socket.IO.
2. O gateway recebe e chama `PlaceBid` por gRPC no **auction-service**.
3. O auction-service registra o lance (sob lock) e **publica** o evento no Redis, no canal `leilao:<id>`.
4. O **notification-service** está assinando esse canal; recebe o evento e o entrega pelo `SubscribeUpdates` (server streaming).
5. O gateway mantém **uma thread de stream por leilão** contra o notification-service; ao receber o `AuctionUpdate`, faz `emit` para a room `leilao_<id>`.
6. Só as abas daquele leilão recebem a atualização; o frontend atualiza status, histórico e dispara o toast.

### Estado: memória x banco

Leilões ativos vivem em memória no auction-service (fonte da verdade rápida para a concorrência); o banco guarda tudo para persistência e histórico. No startup, o serviço recarrega os leilões ativos do banco. `ListAuctions(apenas_ativos=true)` lê da memória; `apenas_ativos=false` lê do banco.

### Contratos gRPC

- **AuthService** (`protos/auth.proto`): `Login`, `CreateCarrier`.
- **AuctionService** (`protos/auction.proto`): RPCs unários `CreateAuction`, `CloseAuction`, `ListAuctions`, `GetAuctionDetail`, `GetCarrierHistory`, `ResolveJoinCode`, `PlaceBid`, `GetStatus`, `GetHistory`.
- **NotificationService** (`protos/notification.proto`): RPC de **server streaming** `SubscribeUpdates`, que envia um `AuctionUpdate` a cada novo lance ou encerramento (alimentado pelo Redis).

O gateway gera os stubs dos três protos (é cliente de todos); cada serviço gera só o seu.

### Decisões de design (e o porquê)

- **Microsserviços com o núcleo de sincronização intacto:** auth e auction são serviços gRPC independentes, mas todo o lance continua passando por um único `Lock` no auction-service, preservando a garantia de "ordem de chegada decide o vencedor". Não há acoplamento de dados entre os serviços (lances guardam `transportadora_id` como string), então o auction-service não precisa chamar o auth no caminho crítico.
- **`threading` + `Lock` em vez de `asyncio`:** escolha deliberada. `asyncio` evitaria race conditions por design e removeria a oportunidade de demonstrar exclusão mútua explícita, que é o objetivo do projeto.
- **Gateway com long-polling em vez de WebSocket:** o gRPC usa extensões C com suas próprias threads; o `eventlet`/WebSocket do Socket.IO conflita com isso. O long-polling tem latência abaixo de 1s para poucos usuários, suficiente aqui.
- **Cliente CLI separado:** cumpre o enunciado ao pé da letra (`BID <valor>`, `STATUS`), falando gRPC direto com o auction-service, sem passar pelo gateway.
- **Persistência fora do lock:** o `INSERT` no Postgres é lento; mantê-lo fora da seção crítica evita travar os outros lances.

## Testes

Suíte focada nos conceitos de Sistemas Distribuídos do projeto (não em cobertura ampla): **sincronização (lock), pub/sub e streaming**. São **28 testes** com `pytest`, que rodam **sem Docker** (usam `fakeredis` e SQLite in-memory).

| Serviço | Cobre |
|---|---|
| **auction** | concorrência do `Lock` (lances iguais → 1 vence), validação do lance, estado/encerramento, **teste de carga** (2500 lances simultâneos) e pub/sub do `Notifier` |
| **notification** | entrega do `AuctionUpdate` via `SubscribeUpdates` (streaming) e isolamento entre leilões |
| **auth** | login do `AuthServicer` (transportadora, admin e credencial inválida) |

### Como rodar

```bash
pip install -r requirements-dev.txt

# Suite completa (saida ao vivo + banner + relatorio HTML)
./run_tests.ps1                      # Windows (PowerShell)
python -m pytest services/auction services/auth services/notification

# Um teste especifico (detalhe so no terminal)
python -m pytest "services/auction/tests/test_state.py::test_lances_iguais_so_um_vence" -s
./run_tests.ps1 lances_iguais        # por palavra-chave
```

Cada serviço tem seu próprio `tests/` e `conftest.py` (por causa dos imports flat). A suíte completa gera o **`relatorio-testes.html`** (relatório visual, abre no navegador) com o resultado e o detalhamento de cada teste.

## Equipe

Equipe 14 (tema da Equipe 09): Ágata · Daniel Ramos · Felipe Leite · Matheus Henrique · Matheus Stepple

## Licença

MIT
