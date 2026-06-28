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
| Cliente-servidor | Arquitetura cliente-servidor (microsserviços) | `services/auth/server.py` e `services/auction/server.py` (servidores), `client/client.py` e `frontend/` (clientes) |
| Usar framework (não socket puro) | RPC, contrato tipado, serialização binária | `protos/auth.proto` e `protos/auction.proto` + gRPC sobre HTTP/2 |
| `BID <valor>` valida menor lance | Validação no servidor, estado compartilhado | `services/auction/state.py::registrar_lance()` |
| `STATUS` | Operação request-response (RPC unário) | `GetStatus` em `services/auction/server.py` |
| Notificar todos a cada lance menor | Comunicação push, modelo publish/subscribe | `SubscribeUpdates` (server streaming) + `services/auction/notifier.py` |
| Ordem de chegada define vencedor, sem empate | Exclusão mútua, seção crítica, ordenação total | `threading.Lock()` em `AuctionState` (`services/auction/state.py`) |
| Múltiplos clientes simultâneos | Concorrência, threads | `ThreadPoolExecutor(max_workers=20)` no gRPC |
| Servidor persistente | Persistência / tolerância a reinício | `services/auth/database.py` e `services/auction/database.py` (PostgreSQL) |
| Sistema em serviços independentes | Decomposição em microsserviços, comunicação serviço-a-serviço | gateway -> auth-service e gateway -> auction-service (gRPC) |

---

## 3. O framework: gRPC e Protocol Buffers

**O que falar:** o enunciado pedia evoluir de sockets TCP/UDP puros para um framework de mercado. Escolhemos gRPC porque ele entrega de graça três coisas que teríamos que implementar à mão com socket puro:

1. **Contrato tipado** (`protos/auth.proto` e `protos/auction.proto`): o `.proto` define mensagens e RPCs. Cliente e servidor são gerados a partir dele, então o formato dos dados nunca diverge.
2. **Serialização binária** (Protocol Buffers): mais compacta e rápida que texto/JSON.
3. **Transporte HTTP/2**: multiplexação de várias chamadas numa conexão e suporte nativo a **streaming**.

**O que mostrar:** abrir os dois protos, mostrar o `AuthService` (login/contas) e o `AuctionService` (leilões/lances), os RPCs unários e o `SubscribeUpdates` marcado como `stream`. Explicar que cada serviço gera seus stubs com `protoc` no próprio `Dockerfile`.

**Tipos de RPC usados (vale citar):**
- **Unário** (request -> response único): `PlaceBid`, `GetStatus` (AuctionService), `Login` (AuthService), etc. É o `BID` e o `STATUS` do enunciado.
- **Server streaming** (uma requisição, vários responses ao longo do tempo): `SubscribeUpdates`. É a notificação push.

**Microsserviços (ponto forte de SD):** o backend foi dividido em dois serviços gRPC independentes (auth-service e auction-service), cada um com seu deploy e suas tabelas. O gateway é cliente dos dois. Isso demonstra **comunicação serviço-a-serviço** e decomposição por domínio, mantendo o núcleo de sincronização inteiro dentro do auction-service.

---

## 4. O comando BID e a validação no servidor

**Exigência:** "o servidor deve validar se o valor é menor que o lance atual e, se válido, registrar".

**Implementação** (`services/auction/state.py::registrar_lance`):

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

1. Cada cliente que quer receber atualizações abre o stream `SubscribeUpdates`. O `Notifier` (`services/auction/notifier.py`) cria uma `queue.Queue` para esse subscriber, indexada por leilão.
2. Quando um lance é aceito, o servidor publica um evento via `Notifier.publish()`, que o coloca **na fila de cada subscriber** daquele leilão.
3. Cada stream está num laço fazendo `fila.get()` e `yield`, entregando a mensagem pela conexão HTTP/2 aberta.

**Isolamento por leilão:** as notificações de um leilão não vazam para outro. No auction-service, os subscribers são indexados por `leilao_id`; no gateway, por rooms `leilao_<id>` do Socket.IO.

> O `Notifier` encapsula esse broadcast atrás de uma interface simples (`subscribe`/`unsubscribe`/`publish`). Hoje usa filas em memória; numa evolução futura, a implementação interna pode virar Redis pub/sub sem mudar o servicer.

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

**O que mostrar:** o trecho do `with self._lock` em `services/auction/state.py` e a resposta do auction-service com um lance aceito seguido de um rejeitado pelo mesmo valor.

---

## 8. Concorrência e múltiplos clientes

**Exigência:** "o servidor deve aceitar conexões de múltiplos clientes".

- O gRPC atende cada chamada numa thread do pool (`max_workers=20`).
- Os streams (`SubscribeUpdates`) ficam abertos e bloqueiam uma thread cada, esperando na fila.
- A escolha de **`threading` em vez de `asyncio` foi deliberada**: `asyncio` evitaria as race conditions por design (loop de evento single-thread) e tiraria a oportunidade de demonstrar a exclusão mútua explícita, que é o objetivo da disciplina.

---

## 9. Persistência

**Exigência:** "o servidor deve ser persistente".

- PostgreSQL via SQLAlchemy, **Postgres compartilhado com donos separados**: o auth-service é dono da tabela `transportadoras` (`services/auth/database.py`); o auction-service é dono de `leiloes` e `lances` (`services/auction/database.py`). Não há FK cruzada entre os serviços.
- Leilões **ativos** vivem em memória no auction-service (fonte da verdade rápida para a concorrência); o banco guarda tudo para histórico e para sobreviver a reinício.
- No startup, o auction-service recarrega os leilões ativos do banco para a memória (`_recarregar_leiloes_ativos`).

---

## 10. A arquitetura (microsserviços + por que o gateway existe)

O backend é composto por **dois microsserviços gRPC independentes** mais um gateway:
- **auth-service** (porta 50052): login e contas. Dono da tabela `transportadoras`.
- **auction-service** (porta 50051): leilões, lances, o `Lock` de sincronização, status, histórico e streaming. Dono de `leiloes` e `lances`.
- **gateway**: é cliente gRPC dos dois e a ponte para o navegador.

**Comunicação serviço-a-serviço:** o gateway abre um canal gRPC para cada serviço e roteia por domínio (login/cadastro -> auth-service; o resto -> auction-service). É comunicação real entre processos pela rede, com contratos `.proto` distintos. O núcleo de sincronização permanece inteiro no auction-service, então a divisão não enfraquece a garantia de ordenação dos lances.

**Por que o gateway existe:** o navegador **não fala gRPC** (precisaria de gRPC-Web + proxy). O gateway (BFF, Backend for Frontend):
- Recebe eventos **Socket.IO** do navegador e os converte em chamadas **gRPC** ao serviço certo.
- Mantém **uma thread de stream gRPC por leilão** contra o auction-service; ao receber um `AuctionUpdate`, faz `emit` para a room do leilão. É um **fan-out**: 1 conexão gRPC reespalha para N navegadores.

**Por que long-polling e não WebSocket:** o gRPC usa extensões C com threads próprias. O `eventlet`/WebSocket do Socket.IO faz monkey-patching que conflita com isso e derruba a conexão. O long-polling tem latência abaixo de 1s para poucos usuários, suficiente para o leilão. **É uma limitação consciente, não um bug.**

---

## 11. Diagrama de sequência (lance concorrente)

```
Transp. A         Gateway        auction-service         Transp. B
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

1. Mostrar os dois protos (`auth.proto` e `auction.proto`) e o compose com os serviços; citar gRPC + streaming + comunicação serviço-a-serviço. (45s)
2. Logar como admin (passa pelo auth-service), criar transportadoras e um leilão com timer curto. (1 min)
3. Abrir 2-3 abas de transportadora no mesmo leilão. (30s)
4. Dar lances normais e mostrar a atualização em tempo real em todas as abas. (1 min)
5. **Clímax:** clicar no mesmo valor em duas abas quase juntas; mostrar um aceito e um rejeitado (logs do auction-service). Explicar o lock. (1,5 min)
6. Encerrar com o countdown "Dou-lhe uma, duas, três" e mostrar o vencedor. (30s)
7. (Opcional) Mostrar o cliente CLI falando gRPC direto com o auction-service, sem o frontend.
