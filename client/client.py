"""
interface de console para transportadoras participarem do leilão:
- BID <valor>  : Enviar um lance
- STATUS       : Consultar estado atual do leilão
- SAIR         : Desconectar do servidor

recebe notificações em tempo real de novos lances e do encerramento
do leilão (anúncio do vencedor) via server streaming.
"""

import sys
import os
import threading

import grpc

# Adiciona o diretório raiz e generated/ ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "generated"))

from generated import freight_pb2
from generated import freight_pb2_grpc

# Configuração do servidor
SERVER_HOST = "localhost"
SERVER_PORT = 50051

# Flag global para saber se o leilão foi encerrado
leilao_encerrado = threading.Event()


def ouvir_atualizacoes(stub, transportadora_id):
    """
    Thread de background que mantém o stream aberto e imprime
    notificações de novos lances e encerramento em tempo real.
    """
    try:
        request = freight_pb2.SubscriptionRequest(
            transportadora_id=transportadora_id
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


def enviar_lance(stub, valor, transportadora_id):
    """Envia um lance (BID) para o servidor."""
    if leilao_encerrado.is_set():
        print("  Leilão já foi encerrado. Não é possível dar lances.")
        return

    try:
        request = freight_pb2.BidRequest(
            valor=valor,
            transportadora_id=transportadora_id,
        )
        response = stub.PlaceBid(request)

        if response.aceito:
            print(f"  {response.mensagem} | Menor lance: R$ {response.menor_lance_atual:.2f}")
        else:
            print(f"  {response.mensagem} | Menor lance: R$ {response.menor_lance_atual:.2f}")
    except grpc.RpcError as e:
        print(f"  [ERRO] Falha ao enviar lance: {e.details()}")


def consultar_status(stub):
    """Consulta o estado atual do leilão (STATUS)."""
    try:
        request = freight_pb2.StatusRequest()
        response = stub.GetStatus(request)

        status_label = "ENCERRADO" if response.encerrado else "EM ANDAMENTO"

        print(f"  Estado: {status_label}")
        print(f"  Menor lance: R$ {response.menor_lance:.2f}")
        print(f"  Lider: {response.transportadora_lider}")
        print(f"  Timestamp: {response.timestamp} ms")
        print(f"  Total lances: {response.total_lances}")
    except grpc.RpcError as e:
        print(f"  [ERRO] Falha ao consultar status: {e.details()}")


def main():
    """Loop principal do cliente."""
    print("FREIGHT AUCTION — Leilão Reverso de Fretes")

    # Identificação da transportadora
    transportadora_id = input("Digite o ID da sua transportadora: ").strip()
    if not transportadora_id:
        print("ID não pode ser vazio. Encerrando.")
        return

    # Conexão com o servidor
    endereco = f"{SERVER_HOST}:{SERVER_PORT}"
    print(f"\nConectando ao servidor em {endereco}...")

    try:
        channel = grpc.insecure_channel(endereco)
        stub = freight_pb2_grpc.FreightAuctionStub(channel)

        # Testa conexão com um STATUS inicial
        status = stub.GetStatus(freight_pb2.StatusRequest())
        print("Conectado com sucesso!")

        if status.encerrado:
            print("\n  O leilão já foi encerrado.")
            print(f"  Vencedor: {status.transportadora_lider}")
            print(f"  Valor final: R$ {status.menor_lance:.2f}")
            channel.close()
            return

        print(f"  Valor inicial da carga: R$ {status.menor_lance:.2f}\n")
    except grpc.RpcError:
        print(f"Não foi possível conectar ao servidor em {endereco}.")
        print("Verifique se o servidor está rodando.")
        return

    # Inicia thread de notificações em background
    thread_updates = threading.Thread(
        target=ouvir_atualizacoes,
        args=(stub, transportadora_id),
        daemon=True,
    )
    thread_updates.start()

    # Mostra comandos disponíveis
    print("Comandos disponíveis:")
    print("  BID <valor>  — Enviar um lance (ex: BID 5000)")
    print("  STATUS       — Consultar estado do leilão")
    print("  SAIR         — Desconectar\n")

    # Loop de comandos
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

            enviar_lance(stub, valor, transportadora_id)

        elif comando == "STATUS":
            consultar_status(stub)

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