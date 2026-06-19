"""
modelagem do estado central em memória do leilão reverso de fretes.

o estado é protegido por threading.Lock para garantir exclusão mútua:
- Apenas uma thread por vez pode ler+escrever na seção crítica
- A ordem de aquisição do lock define o vencedor em caso de lances iguais
- O timestamp é capturado DENTRO do lock, não antes, para refletir a ordem real
"""

import threading
import time
from dataclasses import dataclass


@dataclass
class Lance:
    """representa um lance individual no leilão."""
    valor: float
    transportadora_id: str
    timestamp_ms: int  # Milissegundos desde epoch


@dataclass
class Carga:
    """representa a carga anunciada para o leilão."""
    descricao: str
    valor_inicial: float  # Teto máximo — primeiro lance deve ser menor que isso


class AuctionState:
    """
    estado centralizado do leilão.

    estrutura em memória:
    - carga: dados da carga anunciada (imutável após criação)
    - menor_lance: lance vencedor atual (None se nenhum lance foi feito)
    - historico_lances: lista ordenada de todos os lances válidos aceitos
    - participantes: set de IDs das transportadoras conectadas
    - encerrado: flag que indica se o leilão foi finalizado
    - _lock: threading.Lock para sincronização da seção crítica
    """

    def __init__(self, descricao_carga: str, valor_inicial: float):
        # Dados da carga (imutável)
        self.carga = Carga(descricao=descricao_carga, valor_inicial=valor_inicial)

        # Estado do leilão (protegido pelo lock)
        self.menor_lance: Lance | None = None
        self.historico_lances: list[Lance] = []
        self.participantes: set[str] = set()
        self.encerrado: bool = False

        # Lock para sincronização
        self._lock = threading.Lock()

    def registrar_lance(self, valor: float, transportadora_id: str) -> tuple[bool, str, float]:
        """
        tenta registrar um novo lance no leilão.

        returns:
            Tupla (aceito, mensagem, menor_lance_atual)
        """
        with self._lock:
            # Verifica se o leilão já foi encerrado
            if self.encerrado:
                lance_atual = self.menor_lance.valor if self.menor_lance else self.carga.valor_inicial
                return (False, "Leilão encerrado. Não é possível registrar novos lances.", lance_atual)

            # Timestamp capturado DENTRO do lock
            timestamp_ms = int(time.time() * 1000)

            # Validação: valor deve ser positivo
            if valor <= 0:
                lance_atual = self.menor_lance.valor if self.menor_lance else self.carga.valor_inicial
                return (False, "Valor deve ser positivo.", lance_atual)

            # Validação: transportadora_id não pode ser vazio
            if not transportadora_id or not transportadora_id.strip():
                lance_atual = self.menor_lance.valor if self.menor_lance else self.carga.valor_inicial
                return (False, "ID da transportadora não pode ser vazio.", lance_atual)

            # Validação: valor deve ser menor que o lance atual (ou valor inicial)
            teto = self.menor_lance.valor if self.menor_lance else self.carga.valor_inicial
            if valor >= teto:
                return (False, f"Lance deve ser menor que {teto}.", teto)

            # Lance válido — registrar
            novo_lance = Lance(
                valor=valor,
                transportadora_id=transportadora_id,
                timestamp_ms=timestamp_ms,
            )
            self.menor_lance = novo_lance
            self.historico_lances.append(novo_lance)

            return (True, "Lance registrado com sucesso!", novo_lance.valor)

    def obter_status(self) -> dict:
        """retorna o estado atual do leilão."""
        with self._lock:
            if self.menor_lance:
                return {
                    "menor_lance": self.menor_lance.valor,
                    "transportadora_lider": self.menor_lance.transportadora_id,
                    "timestamp_ms": self.menor_lance.timestamp_ms,
                    "total_lances": len(self.historico_lances),
                    "encerrado": self.encerrado,
                }
            else:
                return {
                    "menor_lance": self.carga.valor_inicial,
                    "transportadora_lider": "Nenhum lance registrado",
                    "timestamp_ms": 0,
                    "total_lances": 0,
                    "encerrado": self.encerrado,
                }

    def encerrar_leilao(self) -> dict:
        """
        encerra o leilão e retorna os dados do vencedor.

        returns:
            Dicionário com informações do vencedor ou indicação de que
            ninguém deu lance.
        """
        with self._lock:
            self.encerrado = True

            if self.menor_lance:
                return {
                    "teve_vencedor": True,
                    "vencedor_id": self.menor_lance.transportadora_id,
                    "valor_final": self.menor_lance.valor,
                    "timestamp_ms": self.menor_lance.timestamp_ms,
                    "total_lances": len(self.historico_lances),
                }
            else:
                return {
                    "teve_vencedor": False,
                    "vencedor_id": "",
                    "valor_final": self.carga.valor_inicial,
                    "timestamp_ms": 0,
                    "total_lances": 0,
                }

    def adicionar_participante(self, transportadora_id: str) -> None:
        """Registra uma transportadora como participante do leilão."""
        with self._lock:
            self.participantes.add(transportadora_id)

    def remover_participante(self, transportadora_id: str) -> None:
        """Remove uma transportadora da lista de participantes."""
        with self._lock:
            self.participantes.discard(transportadora_id)

    def obter_participantes(self) -> set[str]:
        """Retorna cópia do set de participantes."""
        with self._lock:
            return self.participantes.copy()