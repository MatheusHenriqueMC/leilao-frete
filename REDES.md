# REDES.md - Sistemas Distribuídos e Redes na prática

Documento de apresentação. Mapeia **cada exigência do enunciado** (tema da Equipe 09, "Plataforma de Negociação de Fretes") para **como foi implementado** no código, com foco nos conceitos de Sistemas Distribuídos e Redes. É o roteiro do que mostrar e do que falar na avaliação.

---

## 1. O enunciado, em uma linha

> "Implemente um sistema distribuído cliente-servidor onde transportadoras dão lances para carregar uma carga (leilão reverso). O cliente envia `BID <valor>`; o servidor valida se o valor é menor que o lance atual e registra. O cliente pode pedir `STATUS`. **O servidor deve notificar todos os participantes sempre que um lance menor for registrado. A sincronização é crítica: a ordem de chegada dos lances deve definir o vencedor incondicional em caso de valores idênticos.**"

Sugestão de tecnologia do enunciado: **gRPC**. Foi a adotada.

A frase que vale a nota é a última: **sincronização e ordenação total de eventos concorrentes**. Todo o resto serve de moldura para isso.

---

## 2. Mapa exigência -> implementação

| Exigência do enunciado | Conceito de SD/Redes | Onde está no código |
|---|---|---|
| Cliente-servidor | Arquitetura cliente-servidor | `server/server.py` (servidor), `client/client.py` e `frontend/` (clientes) |
| Usar framework (não socket puro) | RPC, contrato tipado, serialização binária | `protos/freight.proto` + gRPC sobre HTTP/2 |
| `BID <valor>` valida menor lance | Validação no servidor, estado compartilhado | `server/auction.py::registrar_lance()` |
| `STATUS` | Operação request-response (RPC unário) | `GetStatus` em `server/server.py` |
| Notificar todos a cada lance menor | Comunicação push, modelo publish/subscribe | `SubscribeUpdates` (server streaming) + filas por subscriber |
| Ordem de chegada define vencedor, sem empate | Exclusão mútua, seção crítica, ordenação total | `threading.Lock()` em `AuctionState` |
| Múltiplos clientes simultâneos | Concorrência, threads | `ThreadPoolExecutor(max_workers=20)` no gRPC |
| Servidor persistente | Persistência / tolerância a reinício | `server/database.py` (PostgreSQL) |

---

## 3. O framework: gRPC e Protocol Buffers

**O que falar:** o enunciado pedia evoluir de sockets TCP/UDP puros para um framework de mercado. Escolhemos gRPC porque ele entrega de graça três coisas que teríamos que implementar à mão com socket puro:

1. **Contrato tipado** (`protos/freight.proto`): o `.proto` define mensagens e RPCs. Cliente e servidor são gerados a partir dele (`generated/`), então o formato dos dados nunca diverge.
2. **Serialização binária** (Protocol Buffers): mais compacta e rápida que texto/JSON.
3. **Transporte HTTP/2**: multiplexação de várias chamadas numa conexão e suporte nativo a **streaming**.

**O que mostrar:** abrir o `freight.proto`, mostrar o serviço `FreightAuction`, os RPCs unários e o `SubscribeUpdates` marcado como `stream`. Explicar que o stub é gerado pelo `protoc` (acontece no `Dockerfile`).

**Tipos de RPC usados (vale citar):**
- **Unário** (request -> response único): `PlaceBid`, `GetStatus`, `Login`, etc. É o `BID` e o `STATUS` do enunciado.
- **Server streaming** (uma requisição, vários responses ao longo do tempo): `SubscribeUpdates`. É a notificação push.

---

## 4. O comando BID e a validação no servidor

**Exigência:** "o servidor deve validar se o valor é menor que o lance atual e, se válido, registrar".

**Implementação** (`server/auction.py::registrar_lance`):

```python
with self._lock:
    teto = self.menor_lance.valor if self.menor_lance else self.valor_inicial
    if valor >= teto:
        return False, f"Lance deve ser menor que {teto:.2f}.", teto   # rejeita
    timestamp_ms = int(time.time() * 1000)                            # timestamp DENTRO do lock
    novo = Lance(valor, transportadora_id, timestamp_ms)
    self.menor_lance = novo
    self.historico_lances.append(novo)
```

**Pontos a destacar:**
- A validação é **estritamente** `<` (menor, não menor ou igual). É isso que elimina empates.
- O servidor é a **autoridade**: o cliente nunca decide se o lance vale, só envia. Toda a regra está no servidor.

---

## 5. O comando STATUS

**Exigência:** "o cliente também pode solicitar o estado atual usando STATUS".

**Implementação:** RPC unário `GetStatus` retorna menor lance, líder, total de lances, tempo restante e se está encerrado. No frontend, o `STATUS` é refeito automaticamente a cada `auction_update` para garantir consistência; no CLI, é o comando `STATUS` digitado.

---

## 6. Notificação push a todos (o "broadcast")

**Exigência:** "o servidor deve notificar todos os participantes sempre que um lance menor for registrado".

Este é um requisito de **comunicação iniciada pelo servidor** (push). Com REST puro exigiria polling; com gRPC usamos **server streaming**, que é push nativo.

**Como funciona (modelo publish/subscribe simples):**

1. Cada cliente que quer receber atualizações abre o stream `SubscribeUpdates`. O servidor cria uma `queue.Queue` para esse subscriber e a guarda numa lista por leilão (`self._subscribers[leilao_id]`).
2. Quando um lance é aceito, `_notificar()` monta um `AuctionUpdate` e o coloca **na fila de cada subscriber** daquele leilão.
3. Cada stream está num laço fazendo `fila.get()` e `yield update`, entregando a mensagem pela conexão HTTP/2 aberta.

**Isolamento por leilão:** as notificações de um leilão não vazam para outro. No servidor, os subscribers são indexados por `leilao_id`; no gateway, por rooms `leilao_<id>` do Socket.IO.

**O que mostrar:** abrir duas abas no mesmo leilão, dar um lance numa e ver a outra atualizar sozinha, sem refresh.

---

## 7. O coração: sincronização e ordenação total

**Exigência (a mais importante):** "a ordem de chegada dos lances deve definir o vencedor incondicional em caso de valores idênticos".

Isto é o problema clássico de **seção crítica** e **exclusão mútua**. Vários clientes acessam o mesmo estado (o menor lance) ao mesmo tempo; sem controle, dois lances iguais poderiam ambos "vencer" (condição de corrida).

**Por que existe a corrida:** o servidor gRPC roda um `ThreadPoolExecutor(max_workers=20)`. Cada chamada `PlaceBid` é atendida por **uma thread diferente em paralelo**. Duas threads podem ler o teto ao mesmo tempo.

**A solução:** cada leilão tem um `threading.Lock()`. A validação e o registro acontecem **dentro do mesmo lock** (operação atômica).

**Cenário de dois lances iguais simultâneos (`BID 9500` de A e B):**

1. Threads A e B chegam ao `with self._lock`. O lock deixa **só uma** entrar, digamos A.
2. A lê `teto = 10000`, valida `9500 < 10000`, registra, vira líder, libera o lock.
3. B entra agora. O teto **já é 9500**. `9500 >= 9500` -> rejeitado.
4. Resultado: o lock impôs uma **ordem total**. Quem chegou ao lock primeiro venceu. **Empate é impossível.**

**Detalhe fino (vale ponto):** o `timestamp` é capturado **dentro** do lock, não quando o pacote chegou na rede. Assim o timestamp reflete a **ordem real de processamento** (a serialização imposta pelo lock), e não a ordem de chegada na placa de rede, que poderia divergir por jitter. É exatamente a "ordem de chegada incondicional" que o enunciado pede.

**Otimização que mostra maturidade:** a persistência no banco fica **fora** do lock. Dentro do lock só há operações de memória (rápidas); o `INSERT` lento no Postgres roda depois de liberar. Isso mantém a seção crítica curta e não serializa o banco junto com a lógica.

**O que mostrar:** o trecho do `with self._lock` no `auction.py` e o log do servidor com um lance aceito seguido de um rejeitado pelo mesmo valor.

---

## 8. Concorrência e múltiplos clientes

**Exigência:** "o servidor deve aceitar conexões de múltiplos clientes".

- O gRPC atende cada chamada numa thread do pool (`max_workers=20`).
- Os streams (`SubscribeUpdates`) ficam abertos e bloqueiam uma thread cada, esperando na fila.
- A escolha de **`threading` em vez de `asyncio` foi deliberada**: `asyncio` evitaria as race conditions por design (loop de evento single-thread) e tiraria a oportunidade de demonstrar a exclusão mútua explícita, que é o objetivo da disciplina.

---

## 9. Persistência

**Exigência:** "o servidor deve ser persistente".

- PostgreSQL via SQLAlchemy (`server/database.py`): tabelas de leilões, lances e transportadoras.
- Leilões **ativos** vivem em memória (fonte da verdade rápida para a concorrência); o banco guarda tudo para histórico e para sobreviver a reinício.
- No startup, o servidor recarrega os leilões ativos do banco para a memória (`_recarregar_leiloes_ativos`).

---

## 10. A arquitetura de 4 camadas (e por que o gateway existe)

O enunciado pede cliente + servidor gRPC. Entregamos isso (o `client/client.py` cumpre `BID`/`STATUS` ao pé da letra) e, por cima, uma interface web.

**O problema:** o navegador **não fala gRPC** (precisaria de gRPC-Web + proxy). 

**A solução:** um **gateway (BFF, Backend for Frontend)** que traduz:
- Recebe eventos **Socket.IO** do navegador e os converte em chamadas **gRPC** ao servidor.
- Mantém **uma thread de stream gRPC por leilão**; ao receber um `AuctionUpdate`, faz `emit` para a room do leilão. É um **fan-out**: 1 conexão gRPC com o servidor reespalha para N navegadores.

**Por que long-polling e não WebSocket:** o gRPC usa extensões C com threads próprias. O `eventlet`/WebSocket do Socket.IO faz monkey-patching que conflita com isso e derruba a conexão. O long-polling tem latência abaixo de 1s para poucos usuários, suficiente para o leilão. **É uma limitação consciente, não um bug.**

---

## 11. Diagrama de sequência (lance concorrente)

```
Transp. A         Gateway          Servidor gRPC         Transp. B
   |                 |                   |                    |
   |--bid 9500------>|                   |                    |
   |                 |--PlaceBid(9500)-->|                    |
   |                 |                   |[lock] 9500<10000 OK|
   |                 |                   |[registra, t=ms]    |
   |                 |                   |[unlock]            |
   |                 |<--aceito----------|                    |
   |                 |                   |<--PlaceBid(9500)---|  (B, quase junto)
   |                 |                   |[lock] 9500>=9500   |
   |                 |                   |[REJEITA] [unlock]  |
   |                 |                   |--rejeitado-------->|
   |                 |<==AuctionUpdate(9500, lider=A)=========| (stream p/ a room)
   |<--auction_update|                   |                    |
   |   (UI atualiza) |                   |  auction_update--->| (UI de B atualiza)
```

---

## 12. Perguntas prováveis na banca (e respostas curtas)

- **"O que garante que não há empate?"** O `threading.Lock` serializa o acesso ao estado; a validação é estritamente `<`. O segundo lance igual encontra o teto já atualizado e é rejeitado.
- **"Por que o timestamp é pego dentro do lock?"** Para refletir a ordem real de processamento (a serialização do lock), não a ordem de chegada na rede.
- **"Por que threading e não asyncio?"** Para poder demonstrar exclusão mútua explícita; asyncio esconderia o problema.
- **"Como o servidor avisa os clientes?"** Server streaming do gRPC (push), com uma fila por subscriber e isolamento por leilão.
- **"O que acontece se o servidor reiniciar?"** Os leilões ativos são recarregados do PostgreSQL para a memória.
- **"Por que precisa do gateway?"** O navegador não fala gRPC; o gateway traduz Socket.IO para gRPC e faz o fan-out das notificações.
- **"E se dois admins encerrarem o mesmo leilão?"** O encerramento também passa pelo lock e checa `if self.encerrado`, então a segunda tentativa é tratada com segurança.

---

## 13. Roteiro sugerido de demonstração (5 min)

1. Mostrar o `freight.proto` (contrato) e citar gRPC + streaming. (30s)
2. Logar como admin, criar transportadoras e um leilão com timer curto. (1 min)
3. Abrir 2-3 abas de transportadora no mesmo leilão. (30s)
4. Dar lances normais e mostrar a atualização em tempo real em todas as abas. (1 min)
5. **Clímax:** clicar no mesmo valor em duas abas quase juntas; mostrar no log do servidor um aceito e um rejeitado. Explicar o lock. (1,5 min)
6. Encerrar com o countdown "Dou-lhe uma, duas, três" e mostrar o vencedor. (30s)
7. (Opcional) Mostrar o cliente CLI falando gRPC direto, sem o frontend.
