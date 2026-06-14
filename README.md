# Plataforma de Negociação de Fretes

Sistema distribuído cliente-servidor para leilão reverso de fretes. Transportadoras competem enviando lances decrescentes para carregar uma carga anunciada pelo servidor. O menor lance vence; em caso de empate, a ordem de chegada define o vencedor.

> **Status atual:** Entrega 1 — Arquitetura e Escopo

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
├── protos/            # Definições Protocol Buffers (.proto)
├── server/            # Implementação do servidor gRPC
├── client/            # Implementação do cliente gRPC
├── generated/         # Stubs Python gerados pelo protoc
├── docs/              # Documentação adicional (protocolo, diagramas)
├── requirements.txt   # Dependências Python
├── README.md          # Este arquivo
└── .gitignore
```

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

O servidor inicia na porta `50051`.

### Executar o cliente

```bash
python -m client.client
```

## Equipe

- Agáta
- Daniel Ramos
- Felipe Leite
- Matheus Henrique
- Matheus Stepple

## Licença

MIT
