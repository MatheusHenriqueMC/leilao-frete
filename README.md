# Plataforma de Negociação de Fretes

Sistema distribuído cliente-servidor para **leilão reverso de fretes**. O servidor anuncia uma carga com um valor inicial e as transportadoras competem enviando **lances decrescentes** para transportá-la. O **menor lance vence** e, em caso de empate, **a ordem de chegada decide**, sem empates possíveis.

> Projeto da disciplina CIN0143 (Introdução aos Sistemas Distribuídos e Redes), CIn/UFPE.
> O requisito central é demonstrar **controle de concorrência explícito** no servidor.

## Como funciona em 30 segundos

- O **servidor gRPC** mantém o estado de cada leilão em memória, protegido por um `threading.Lock()`.
- Cada lance chega numa thread separada. O lock serializa os lances: o primeiro a entrar registra, e um lance de valor igual ou maior é rejeitado.
- Quando um lance é aceito, o servidor faz **push** para todos os participantes via server streaming, sem polling.
- O navegador não fala gRPC, então um **gateway** traduz Socket.IO para gRPC e vice-versa.

## Arquitetura

```
 FRONTEND          GATEWAY            SERVIDOR          BANCO
 React + TS  <--->  Flask-      <--->  gRPC      <--->  PostgreSQL
 :5173      Socket  SocketIO    gRPC   :50051   SQLAlc  :5432
            .IO     :5000
                                         ^
                                         | gRPC
                                   client.py (CLI)
                                   BID / STATUS / SAIR
```

| Camada | Tecnologia | Papel |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | Interface em tempo real (transportadora e admin) |
| Gateway (BFF) | Flask + Flask-SocketIO (modo threading) | Traduz HTTP long-polling para gRPC e reespalha as notificações |
| Servidor | Python 3.12 + gRPC | Lógica central, lock de concorrência, server streaming |
| Persistência | PostgreSQL + SQLAlchemy | Leilões, lances e transportadoras |
| Cliente CLI | Python + gRPC | Cliente de texto que fala gRPC direto (cumpre `BID`/`STATUS` do enunciado) |
| Infra | Docker Compose | Sobe banco, servidor e gateway |

## Estrutura do projeto

```
leilao-frete/
├── protos/freight.proto        # Contrato gRPC (proto3), fonte da verdade do protocolo
├── generated/                  # Stubs gerados pelo protoc (não editar)
├── server/
│   ├── server.py               # Servidor gRPC multi-leilão (porta 50051)
│   ├── auction.py              # AuctionState: estado em memória + Lock (seção crítica)
│   └── database.py             # Modelos e CRUD (PostgreSQL + SQLAlchemy)
├── gateway/gateway.py          # Ponte Socket.IO para gRPC; 1 thread de stream por leilão
├── client/client.py            # Cliente CLI de texto (BID / STATUS / SAIR)
├── frontend/src/
│   ├── hooks/useSocket.ts      # Hook central de comunicação com o gateway
│   ├── pages/                  # Login, AdminDashboard, AdminPage,
│   │                           #   TransportadoraDashboard, AuctionPage
│   └── components/             # StatusPanel, BidHistory, BidForm, modais, toasts
├── docker-compose.yml
├── Dockerfile
└── SETUP.md                    # Passo a passo para rodar
```

## Papéis na interface

- **Transportadora**: vê a carga, o menor lance ao vivo, o timer, o histórico e o formulário de lance; recebe um toast sonoro e visual ao perder a liderança.
- **Admin**: cria leilões e contas de transportadora, vê o histórico, monitora a sala e encerra o leilão com o countdown "Dou-lhe uma, duas, três".

## Como rodar

Resumo: `docker-compose up --build` (backend) e, em outro terminal, `cd frontend && npm install && npm run dev` (frontend). Acesse `http://localhost:5173`.

Passo a passo completo, credenciais e solução de problemas em **[SETUP.md](SETUP.md)**.

---

## Detalhamento

### A sincronização (o ponto central do projeto)

Em `server/auction.py`, o método `registrar_lance()` faz validação e registro **dentro do mesmo lock**:

1. Adquire o `Lock` do leilão (só uma thread por vez).
2. Lê o teto atual (menor lance, ou o valor inicial se ainda não houve lance).
3. Valida `valor < teto`, estritamente menor. Caso contrário, **rejeita**.
4. Captura o `timestamp` **dentro** do lock, refletindo a ordem real de processamento.
5. Registra o lance, atualiza o líder e libera o lock.
6. A persistência no banco ocorre **fora** do lock, mantendo a seção crítica curta.

Dois lances iguais simultâneos: o primeiro a pegar o lock vence; o segundo encontra o teto já atualizado e é rejeitado por não ser estritamente menor. **Empate é impossível.**

### Caminho de um lance (ponta a ponta)

1. Transportadora clica em um valor no frontend, que emite `bid` via Socket.IO.
2. O gateway recebe e chama `PlaceBid` por gRPC no servidor.
3. O servidor registra o lance (sob lock) e notifica os inscritos via `SubscribeUpdates`.
4. O gateway mantém **uma thread de stream por leilão**: ao receber o `AuctionUpdate`, faz `emit` para a room `leilao_<id>`.
5. Só as abas daquele leilão recebem a atualização; o frontend atualiza status, histórico e dispara o toast.

### Estado: memória x banco

Leilões ativos vivem em memória no servidor (fonte da verdade rápida); o banco guarda tudo para persistência e histórico. No startup, o servidor recarrega os leilões ativos do banco. `ListAuctions(apenas_ativos=true)` lê da memória; `apenas_ativos=false` lê do banco.

### Contrato gRPC

O serviço `FreightAuction` (em `protos/freight.proto`) tem RPCs unários (`Login`, `CreateCarrier`, `CreateAuction`, `CloseAuction`, `ListAuctions`, `GetAuctionDetail`, `GetCarrierHistory`, `ResolveJoinCode`, `PlaceBid`, `GetStatus`, `GetHistory`) e um RPC de **server streaming** (`SubscribeUpdates`) que envia um `AuctionUpdate` a cada novo lance ou encerramento.

> Observação: `client/client.py` e `docs/protocolo.md` refletem uma versão anterior (leilão único, sem `leilao_id`). O contrato vigente é sempre o `protos/freight.proto`.

### Decisões de design (e o porquê)

- **`threading` + `Lock` em vez de `asyncio`:** escolha deliberada. `asyncio` evitaria race conditions por design e removeria a oportunidade de demonstrar exclusão mútua explícita, que é o objetivo do projeto.
- **Gateway com long-polling em vez de WebSocket:** o gRPC usa extensões C com suas próprias threads; o `eventlet`/WebSocket do Socket.IO conflita com isso. O long-polling tem latência abaixo de 1s para poucos usuários, suficiente aqui.
- **Cliente CLI separado:** cumpre o enunciado ao pé da letra (`BID <valor>`, `STATUS`), falando gRPC direto com o servidor, sem passar pelo gateway.
- **Persistência fora do lock:** o `INSERT` no Postgres é lento; mantê-lo fora da seção crítica evita travar os outros lances.

## Equipe

Equipe 14 (tema da Equipe 09): Ágata · Daniel Ramos · Felipe Leite · Matheus Henrique · Matheus Stepple

## Licença

MIT
