"""
Interface de console para transportadoras participarem do leilao (auction-service):
- BID <valor>  : Enviar um lance
- STATUS       : Consultar estado atual do leilao
- SAIR         : Desconectar do servidor

Recebe notificacoes em tempo real de novos lances e do encerramento do leilao
(anuncio do vencedor) via server streaming.

Stubs: gere com
  python -m grpc_tools.protoc -I protos/ --python_out=client/generated/ \
    --grpc_python_out=client/generated/ protos/auction.proto
"""

import sys
import os
import threading

import grpc

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "generated"))

import auction_pb2
import auction_pb2_grpc

# Configuracao do auction-service
SERVER_HOST = os.environ.get("AUCTION_HOST", "localhost")
SERVER_PORT = os.environ.get("AUCTION_PORT", "50051")

# Flag global para saber se o leilao foi encerrado
leilao_encerrado = threading.Event()


def ouvir_atualizacoes(stub, transportadora_id, leilao_id):
    """Thread de background: mantem o stream aberto e imprime notificacoes."""
    try:
        request = auction_pb2.SubscriptionRequest(
            transportadora_id=transportadora_id,
            leilao_id=leilao_id,
        )
        for update in stub.SubscribeUpdates(request):
            if update.encerrado:
                print(f"\n  [ENCERRADO] {update.mensagem}")
                print("  Digite SAIR para encerrar o cliente.")
                leilao_encerrado.set()
                break
            else:
                print(
                    f"\n  [NOTIFICAÇÃO] Novo menor lance: R$ {update.menor_lance:.2f} "
                    f"por '{update.transportadora_lider}'"
                )
                print(">>> ", end="", flush=True)
    except grpc.RpcError as e:
        if e.code() != grpc.StatusCode.CANCELLED:
            print(f"\n  [ERRO] Stream de atualizações encerrado: {e.details()}")


def enviar_lance(stub, valor, transportadora_id, leilao_id):
    """Envia um lance (BID) para o auction-service."""
    if leilao_encerrado.is_set():
        print("  Leilão já foi encerrado. Não é possível dar lances.")
        return

    try:
        request = auction_pb2.BidRequest(
            valor=valor,
            transportadora_id=transportadora_id,
            leilao_id=leilao_id,
        )
        response = stub.PlaceBid(request)
        print(f"  {response.mensagem} | Menor lance: R$ {response.menor_lance_atual:.2f}")
    except grpc.RpcError as e:
        print(f"  [ERRO] Falha ao enviar lance: {e.details()}")


def consultar_status(stub, leilao_id):
    """Consulta o estado atual do leilao (STATUS)."""
    try:
        response = stub.GetStatus(auction_pb2.StatusRequest(leilao_id=leilao_id))
        status_label = "ENCERRADO" if response.encerrado else "EM ANDAMENTO"
        print(f"  Estado: {status_label}")
        print(f"  Menor lance: R$ {response.menor_lance:.2f}")
        print(f"  Lider: {response.transportadora_lider}")
        print(f"  Timestamp: {response.timestamp} ms")
        print(f"  Total lances: {response.total_lances}")
    except grpc.RpcError as e:
        print(f"  [ERRO] Falha ao consultar status: {e.details()}")


def main():
    print("FREIGHT AUCTION — Leilão Reverso de Fretes (cliente CLI)")

    transportadora_id = input("Digite o ID da sua transportadora: ").strip()
    if not transportadora_id:
        print("ID não pode ser vazio. Encerrando.")
        return

    try:
        leilao_id = int(input("Digite o ID do leilão: ").strip())
    except ValueError:
        print("ID de leilão inválido. Encerrando.")
        return

    endereco = f"{SERVER_HOST}:{SERVER_PORT}"
    print(f"\nConectando ao auction-service em {endereco}...")

    try:
        channel = grpc.insecure_channel(endereco)
        stub = auction_pb2_grpc.AuctionServiceStub(channel)

        status = stub.GetStatus(auction_pb2.StatusRequest(leilao_id=leilao_id))
        print("Conectado com sucesso!")

        if status.encerrado:
            print("\n  O leilão já foi encerrado.")
            print(f"  Vencedor: {status.transportadora_lider}")
            print(f"  Valor final: R$ {status.menor_lance:.2f}")
            channel.close()
            return

        print(f"  Menor lance atual: R$ {status.menor_lance:.2f}\n")
    except grpc.RpcError:
        print(f"Não foi possível conectar ao servidor em {endereco}.")
        print("Verifique se o auction-service está rodando.")
        return

    thread_updates = threading.Thread(
        target=ouvir_atualizacoes,
        args=(stub, transportadora_id, leilao_id),
        daemon=True,
    )
    thread_updates.start()

    print("Comandos disponíveis:")
    print("  BID <valor>  — Enviar um lance (ex: BID 5000)")
    print("  STATUS       — Consultar estado do leilão")
    print("  SAIR         — Desconectar\n")

    while True:
        try:
            entrada = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nDesconectando...")
            break

        if not entrada:
            continue

        partes = entrada.upper().split(maxsplit=1)
        comando = partes[0]

        if comando == "BID":
            if len(partes) < 2:
                print("  Uso: BID <valor> (ex: BID 5000)")
                continue
            try:
                valor = float(partes[1])
            except ValueError:
                print("  Valor inválido. Use um número (ex: BID 5000)")
                continue
            enviar_lance(stub, valor, transportadora_id, leilao_id)

        elif comando == "STATUS":
            consultar_status(stub, leilao_id)

        elif comando == "SAIR":
            print("Desconectando...")
            break

        else:
            print(f"  Comando desconhecido: '{entrada}'")
            print("  Comandos: BID <valor> | STATUS | SAIR")

    channel.close()
    print("Conexão encerrada. Até a próxima!")


if __name__ == "__main__":
    main()
