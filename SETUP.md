# SETUP - Como rodar o projeto

Guia passo a passo para subir a Plataforma de Negociação de Fretes localmente.

## Pré-requisitos

- **Docker** e **Docker Compose** (para o backend: banco, servidor gRPC e gateway)
- **Node.js 18+** e **npm** (para o frontend)
- Portas livres: `5432` (Postgres), `50051` (gRPC), `5000` (gateway), `5173` (frontend)

> Opcional, só se for rodar o backend sem Docker: Python 3.12.

## Passo 1 - Subir o backend (Docker)

Na raiz do projeto:

```bash
docker-compose up --build
```

Isso sobe três serviços, na ordem correta:

1. **PostgreSQL** na porta `5432`
2. **Servidor gRPC** na porta `50051` (espera o banco ficar saudável)
3. **Gateway** na porta `5000` (espera o servidor gRPC ficar saudável)

O `Dockerfile` gera os stubs gRPC automaticamente a partir do `protos/freight.proto`, então não é preciso rodar o `protoc` à mão.

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

1. Logue como **admin**.
2. Crie uma ou mais **contas de transportadora** (botão "Criar conta de transportadora").
3. Crie um **leilão** (título, valor inicial, timer opcional, imagem). Anote o **código de acesso**.
4. Em outras abas, logue como as transportadoras e entre no leilão pelo código.
5. Dê lances e observe a atualização em tempo real em todas as abas.

> Cada aba do navegador tem sua própria sessão (`sessionStorage`), então é possível logar com usuários diferentes em abas separadas ao mesmo tempo.

## Passo 4 (opcional) - Cliente CLI

O cliente de texto fala gRPC direto com o servidor (porta 50051). Requer Python 3.12 e as dependências instaladas:

```bash
pip install -r requirements.txt
python -m client.client
```

> Atenção: o `client/client.py` reflete uma versão anterior do protocolo (leilão único, sem `leilao_id`) e pode não funcionar contra o servidor multi-leilão atual. Use-o apenas como referência do protocolo de texto, ou ajuste antes de demonstrar.

## Demonstrar a disputa concorrente

Para mostrar a sincronização (o ponto central do projeto):

1. Crie um leilão com timer curto (ex.: 5 minutos).
2. Abra três abas de transportadora e entre todas no mesmo leilão.
3. Clique no mesmo valor de lance em abas diferentes quase ao mesmo tempo.
4. No log do servidor, observe um lance aceito e os demais rejeitados com "Lance deve ser menor que ...".

Exemplo de log esperado:

```
[...] INFO - Lance recebido: R$ 9500.00 da transportadora 'translog_sp'
[...] INFO - Lance aceito! Novo menor lance: R$ 9500.00
[...] INFO - Lance recebido: R$ 9500.00 da transportadora 'translog_rj'
[...] INFO - Lance rejeitado: Lance deve ser menor que 9500.00.
```

## Rodar o backend sem Docker (alternativa)

Se preferir não usar Docker para o backend, é preciso ter um PostgreSQL rodando e Python 3.12.

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Gerar os stubs gRPC
python -m grpc_tools.protoc -I protos/ --python_out=generated/ --grpc_python_out=generated/ protos/freight.proto

# 3. Configurar variáveis (copie .env.example para .env e ajuste se necessário)
#    DATABASE_URL aponta para o seu Postgres local.

# 4. Subir o servidor gRPC
python -m server.server

# 5. Em outro terminal, subir o gateway
python -m gateway.gateway
```

Variáveis de ambiente disponíveis (ver `.env.example`):

| Variável | Padrão | Onde é usada |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/freight_auction` | Servidor |
| `ADMIN_USERNAME` | `admin` | Servidor |
| `ADMIN_PASSWORD` | `admin123` | Servidor |
| `GRPC_HOST` | `localhost` | Gateway |
| `GRPC_PORT` | `50051` | Gateway |
| `GATEWAY_PORT` | `5000` | Gateway |
| `CORS_ORIGINS` | `http://localhost:5173` | Gateway |

## Solução de problemas

- **Frontend não conecta no gateway:** confirme que o gateway está em `http://localhost:5000` (`GET /health` deve responder `{"status":"ok"}`) e que `CORS_ORIGINS` inclui `http://localhost:5173`.
- **Servidor gRPC não sobe:** ele depende do banco estar saudável. Veja se o serviço `db` do Docker subiu sem erro.
- **Porta ocupada:** alguma das portas (5432, 50051, 5000, 5173) já está em uso. Libere-a ou ajuste a configuração.
- **Atualizações não chegam em tempo real:** o frontend usa long-polling (latência abaixo de 1s). Recarregue a aba e confirme que a transportadora entrou no leilão pelo código.
