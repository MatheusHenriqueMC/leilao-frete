import type { AuctionSummary } from '../types'

interface Props {
  leilao: AuctionSummary
  onClose: () => void
  onEnter: () => void
  isAdmin?: boolean
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AuctionPreviewModal({ leilao, onClose, onEnter, isAdmin }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base uppercase">{leilao.titulo}</h2>
            {isAdmin && (
              <p className="text-xs text-gray-400 mt-0.5">
                Código: <strong className="text-orange-600 font-mono">{leilao.join_code}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4 shrink-0">×</button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Imagem de capa */}
          {leilao.thumbnail && (
            <div className="px-6 pt-5">
              <img src={leilao.thumbnail} alt={leilao.titulo}
                className="w-full h-48 object-contain rounded-xl border border-gray-100 bg-gray-50" />
            </div>
          )}

          <div className="p-6 space-y-4">
            {/* Valores */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-400">Lance inicial</p>
                <p className="font-semibold text-gray-700 mt-0.5">{brl(leilao.valor_inicial)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg px-4 py-3">
                <p className="text-xs text-orange-400">Menor lance</p>
                <p className="font-bold text-orange-700 mt-0.5">{brl(leilao.menor_lance)}</p>
              </div>
            </div>

            {/* Descrição */}
            {leilao.descricao && (
              <>
                <hr className="border-gray-100" />
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Descrição</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{leilao.descricao}</p>
                </div>
              </>
            )}

            {/* Especificações */}
            {leilao.especificacoes && (
              <>
                <hr className="border-gray-100" />
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Especificações</p>
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                    {leilao.especificacoes}
                  </p>
                </div>
              </>
            )}

            {/* Stats */}
            <hr className="border-gray-100" />
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{leilao.total_lances} lance{leilao.total_lances !== 1 ? 's' : ''}</span>
              {leilao.tempo_restante_s > 0 && (
                <span className="text-orange-600 font-medium">
                  ⏱ {Math.floor(leilao.tempo_restante_s / 60)}m restantes
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 shrink-0 border-t border-gray-100 pt-4">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50">
            Fechar
          </button>
          <button onClick={onEnter}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg">
            {isAdmin ? 'Gerenciar' : 'Entrar no Leilão'}
          </button>
        </div>
      </div>
    </div>
  )
}
