# Protocolo de Comunicação

Documento de definição do protocolo de comunicação entre cliente e servidor
para a plataforma de leilão reverso de fretes.

**Framework:** gRPC com Protocol Buffers (proto3)
**Porta do servidor:** 50051
**Transporte:** HTTP/2 (nativo do gRPC)

## Serviço: FreightAuction

O servidor expõe um único serviço gRPC chamado `FreightAuction` com três operações:

### 1. PlaceBid (Unário)

Envia um lance para o leilão. Equivale ao comando `BID <valor>`.

**Fluxo:**
1. Cliente envia `BidRequest` com valor e seu ID
2. Servidor adquire o lock
3. Servidor captura timestamp em milissegundos
4. Servidor valida se valor > 0, ID não vazio, e valor < lance atual
5. Se válido: registra o lance, notifica inscritos via stream, responde aceite
6. Se inválido: responde rejeição com motivo
7. Servidor libera o lock

**Requisição — BidRequest:**
| Campo | Tipo | Descrição |
|---|---|---|
| valor | float | Valor do lance proposto |
| transportadora_id | string | Identificador único da transportadora |

**Resposta — BidResponse:**
| Campo | Tipo | Descrição |
|---|---|---|
| aceito | bool | Se o lance foi registrado |
| menor_lance_atual | float | Menor lance após a operação |
| mensagem | string | Feedback (motivo de rejeição ou confirmação) |

### 2. GetStatus (Unário)

Consulta o estado atual do leilão. Equivale ao comando `STATUS`.

**Requisição — StatusRequest:**
Mensagem vazia (sem campos).

**Resposta — StatusResponse:**
| Campo | Tipo | Descrição |
|---|---|---|
| menor_lance | float | Menor lance registrado (ou valor inicial se nenhum lance) |
| transportadora_lider | string | ID de quem detém o menor lance |
| timestamp | int64 | Momento do registro do menor lance (ms desde epoch) |
| total_lances | int32 | Quantidade total de lances válidos registrados |

### 3. SubscribeUpdates (Server Streaming)

Cliente se inscreve para receber notificações em tempo real.
O servidor envia uma mensagem pelo stream toda vez que um novo menor lance é registrado.

**Requisição — SubscriptionRequest:**
| Campo | Tipo | Descrição |
|---|---|---|
| transportadora_id | string | ID da transportadora que quer receber atualizações |

**Stream de respostas — AuctionUpdate:**
| Campo | Tipo | Descrição |
|---|---|---|
| menor_lance | float | Novo menor lance registrado |
| transportadora_lider | string | ID da transportadora que fez o lance |
| timestamp | int64 | Momento do registro (ms desde epoch) |

**Comportamento do stream:**
- O stream permanece aberto enquanto o cliente estiver conectado
- O servidor envia um `AuctionUpdate` imediatamente após cada lance válido
- Se o cliente desconectar, o servidor remove ele da lista de participantes

## Regras de Validação

| Regra | Descrição |
|---|---|
| Valor positivo | `valor` deve ser > 0 |
| Valor decrescente | `valor` deve ser estritamente < menor lance atual (ou valor inicial) |
| ID obrigatório | `transportadora_id` não pode ser vazio |
| Atomicidade | Validação e registro acontecem dentro do mesmo lock |
| Timestamp interno | Timestamp é capturado dentro do lock, refletindo ordem real de chegada |

## Lógica de Desempate

Em caso de dois lances com o mesmo valor chegando simultaneamente:
1. O `threading.Lock` serializa o acesso — apenas um entra por vez
2. O primeiro a adquirir o lock registra o lance com sucesso
3. O segundo, ao adquirir o lock, encontra o teto já atualizado e tem o lance rejeitado (pois não é estritamente menor)
4. Resultado: **não existe empate** — o lock garante ordenação total

## Diagrama de Sequência

```
Transportadora A                Servidor                 Transportadora B
      |                            |                            |
      |--- SubscribeUpdates ------>|                            |
      |                            |<--- SubscribeUpdates ------|
      |                            |                            |
      |--- BidRequest(500) ------->|                            |
      |                            | [lock adquirido]           |
      |                            | [valida: 500 < 1000? sim]  |
      |                            | [registra lance]           |
      |                            | [lock liberado]            |
      |<-- BidResponse(aceito) ----|                            |
      |<-- AuctionUpdate(500) -----|---- AuctionUpdate(500) --->|
      |                            |                            |
      |                            |<--- BidRequest(450) -------|
      |                            | [lock adquirido]           |
      |                            | [valida: 450 < 500? sim]   |
      |                            | [registra lance]           |
      |                            | [lock liberado]            |
      |                            |---- BidResponse(aceito) -->|
      |<-- AuctionUpdate(450) -----|---- AuctionUpdate(450) --->|
      |                            |                            |
```

## Comandos do Cliente (Interface de Texto)

O cliente oferece uma interface de texto que traduz comandos para chamadas gRPC:

| Comando digitado | Chamada gRPC correspondente |
|---|---|
| `BID <valor>` | `PlaceBid(BidRequest)` |
| `STATUS` | `GetStatus(StatusRequest)` |
| `SAIR` | Fecha a conexão e o stream |
