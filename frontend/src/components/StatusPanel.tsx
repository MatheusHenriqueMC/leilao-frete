import type { AuctionStatus } from '../types'

interface Props {
  status: AuctionStatus | null
  connected: boolean
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StatusPanel({ status, connected }: Props) {
  if (!status) {
    // Sem conexão: mostra estado offline em vez de skeleton infinito
    if (!connected) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center py-10">
          <p className="text-2xl mb-2">🔌</p>
          <p className="text-sm font-medium text-gray-500">Servidor não conectado</p>
          <p className="text-xs text-gray-400 mt-1">
            Verifique se o gateway está rodando em localhost:5000
          </p>
        </div>
      )
    }
    // Conectado mas aguardando resposta: skeleton
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-6 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const badgeClass = status.encerrado
    ? 'bg-red-50 text-red-600'
    : connected
      ? 'bg-green-50 text-green-600'
      : 'bg-yellow-50 text-yellow-600'

  const dotClass = status.encerrado
    ? 'bg-red-500'
    : connected
      ? 'bg-green-500 animate-pulse'
      : 'bg-yellow-500'

  const badgeLabel = status.encerrado ? 'Encerrado' : connected ? 'Ao vivo' : 'Conectando...'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-800">Status do Leilão</h2>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${badgeClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
          {badgeLabel}
        </span>
      </div>

      <p className="text-sm text-gray-400 mb-5">{status.descricao_carga}</p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Valor inicial</p>
          <p className="text-base font-semibold text-gray-600">{brl(status.valor_inicial)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Menor lance</p>
          <p className="text-2xl font-bold text-orange-600">{brl(status.menor_lance)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Líder atual</p>
          <p className="text-sm font-medium text-gray-700 truncate">{status.transportadora_lider}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Total de lances</p>
          <p className="text-sm font-medium text-gray-700">{status.total_lances}</p>
        </div>
      </div>
    </div>
  )
}
