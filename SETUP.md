# SETUP - Como rodar o projeto

Guia passo a passo para subir a Plataforma de Negociação de Fretes localmente.

## Pré-requisitos

- **Docker** e **Docker Compose** (para o backend: banco, Redis, auth-service, auction-service, notification-service e gateway)
- **Node.js 18+** e **npm** (para o frontend)
- Portas livres: `5432` (Postgres), `6379` (Redis), `50051` (auction-service), `50052` (auth-service), `50053` (notification-service), `5000` (gateway), `5173` (frontend)

> Opcional, só se for rodar o backend sem Docker: Python 3.12.

## Passo 1 - Subir o backend (Docker)

Na raiz do projeto:

```bash
docker-compose up --build
```

Isso sobe seis serviços, na ordem correta:

1. **PostgreSQL** na porta `5432`
2. **Redis** na porta `6379` (broker de mensagens)
3. **auth-service** (gRPC) na porta `50052` (espera o banco)
4. **auction-service** (gRPC) na porta `50051` (espera banco e Redis)
5. **notification-service** (gRPC) na porta `50053` (espera o Redis)
6. **gateway** na porta `5000` (espera os três serviços)

Cada serviço tem seu próprio `Dockerfile`, que gera os stubs gRPC do seu proto automaticamente no build. Não é preciso rodar o `protoc` à mão.

Deixe esse terminal aberto. Para parar, use `Ctrl+C`.

## Passo 2 - Subir o frontend

Em **outro terminal**:

```bash
cd frontend
npm install
npm run dev
```

Acesse **http://localhost:5173**.

Por padrão o frontend aponta para o gateway em `http://localhost:5000`. Para mudar, crie um arquivo `frontend/.env` com:

```
VITE_GATEWAY_URL=http://localhost:5000
```

## Passo 3 - Entrar no sistema

| Papel | Usuário | Senha |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Transportadora | criado pelo admin | definido pelo admin |

Fluxo básico:

1. Logue como **admin** (autenticado pelo auth-service).
2. Crie uma ou mais **contas de transportadora** (botão "Criar conta de transportadora").
3. Crie um **leilão** (título, valor inicial, timer opcional, imagem). Anote o **código de acesso**.
4. Em outras abas, logue como as transportadoras e entre no leilão pelo código.
5. Dê lances e observe a atualização em tempo real em todas as abas.

> Cada aba do navegador tem sua própria sessão (`sessionStorage`), então é possível logar com usuários diferentes em abas separadas ao mesmo tempo.

## Passo 4 (opcional) - Cliente CLI

O cliente de texto fala com o **auction-service** (lances/status, porta 50051) e o **notification-service** (streaming, porta 50053). Requer Python 3.12, as dependências e os stubs gerados:

```bash
pip install -r services/auction/requirements.txt
mkdir -p client/generated
python -m grpc_tools.protoc -I protos/ --python_out=client/generated/ --grpc_python_out=client/generated/ protos/auction.proto protos/notification.proto
python client/client.py
```

O cliente pede o ID da transportadora e o ID do leilão, e aceita os comandos `BID <valor>`, `STATUS` e `SAIR`.

## Demonstrar a disputa concorrente

Para mostrar a sincronização (o ponto central do projeto):

1. Crie um leilão com timer curto (ex.: 5 minutos).
2. Abra três abas de transportadora e entre todas no mesmo leilão.
3. Clique no mesmo valor de lance em abas diferentes quase ao mesmo tempo.
4. Uma aba recebe "Lance registrado com sucesso!" e as demais "Lance deve ser menor que ...". Nos logs do **auction-service** aparecem as notificações enviadas a cada lance aceito.

## Rodar o backend sem Docker (alternativa)

Se preferir não usar Docker, é preciso ter um PostgreSQL e um Redis rodando, e Python 3.12. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` e `REDIS_URL`.

```bash
# Dependencias (grpcio-tools vem em qualquer requirements de servico)
pip install -r services/auction/requirements.txt -r services/notification/requirements.txt -r gateway/requirements.txt

# Gera os stubs de cada componente
mkdir -p services/auth/generated services/auction/generated services/notification/generated gateway/generated
python -m grpc_tools.protoc -I protos/ --python_out=services/auth/generated/ --grpc_python_out=services/auth/generated/ protos/auth.proto
python -m grpc_tools.protoc -I protos/ --python_out=services/auction/generated/ --grpc_python_out=services/auction/generated/ protos/auction.proto
python -m grpc_tools.protoc -I protos/ --python_out=services/notification/generated/ --grpc_python_out=services/notification/generated/ protos/notification.proto
python -m grpc_tools.protoc -I protos/ --python_out=gateway/generated/ --grpc_python_out=gateway/generated/ protos/auth.proto protos/auction.proto protos/notification.proto

# Sobe cada componente (em terminais separados)
python services/auth/server.py
python services/auction/server.py
python services/notification/server.py
python gateway/gateway.py
```

Variáveis de ambiente (ver `.env.example`):

| Variável | Padrão | Onde é usada |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/freight_auction` | auth-service, auction-service |
| `REDIS_URL` | `redis://localhost:6379/0` | auction-service, notification-service |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | auth-service |
| `AUTH_PORT` | `50052` | auth-service |
| `AUCTION_PORT` | `50051` | auction-service |
| `NOTIFICATION_PORT` | `50053` | notification-service |
| `AUTH_HOST` / `AUTH_PORT` | `localhost` / `50052` | gateway (alvo do auth) |
| `AUCTION_HOST` / `AUCTION_PORT` | `localhost` / `50051` | gateway (alvo do auction) |
| `NOTIFICATION_HOST` / `NOTIFICATION_PORT` | `localhost` / `50053` | gateway (alvo do notification) |
| `GATEWAY_PORT` | `5000` | gateway |
| `CORS_ORIGINS` | `http://localhost:5173` | gateway |

## Solução de problemas

- **Frontend não conecta no gateway:** confirme que o gateway está em `http://localhost:5000` (`GET /health` deve responder `{"status":"ok", ...}`) e que `CORS_ORIGINS` inclui `http://localhost:5173`.
- **Um serviço gRPC não sobe:** auth-service e auction-service dependem do banco; auction-service e notification-service dependem do Redis. Veja se `db` e `redis` subiram sem erro.
- **Login falha mas leilão funciona (ou vice-versa):** os caminhos passam por serviços diferentes. Cheque os logs do **auth-service** (login/contas) ou do **auction-service** (leilões/lances).
- **Lances funcionam mas a tela não atualiza sozinha:** o caminho da notificação é auction-service -> Redis -> notification-service -> gateway. Veja os logs do **notification-service** (assinatura dos canais) e do **redis**.
- **Porta ocupada:** alguma das portas (5432, 6379, 50051, 50052, 50053, 5000, 5173) já está em uso. Libere-a ou ajuste a configuração.
- **Atualizações não chegam em tempo real:** o frontend usa long-polling (latência abaixo de 1s). Recarregue a aba e confirme que a transportadora entrou no leilão pelo código.
