import { useState } from 'react'
import type { AuctionSummary, BidItem } from '../types'

interface Props {
  titulo: string
  leiloes: AuctionSummary[]
  onClose: () => void
  onFetchDetail: (leilao_id: number) => void
  detail: { leilao: AuctionSummary; lances: BidItem[] } | null
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

export default function AuctionHistoryModal({ titulo, leiloes, onClose, onFetchDetail, detail }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  function handleSelect(id: number) {
    setSelectedId(id)
    onFetchDetail(id)
  }

  const detailForSelected = detail?.leilao?.id === selectedId ? detail : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Lista */}
          <div className="w-72 border-r border-gray-100 overflow-y-auto">
            {leiloes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">Nenhum leilão encontrado.</p>
            ) : (
              <ul className="p-2 space-y-1">
                {leiloes.map(l => (
                  <li key={l.id}>
                    <button
                      onClick={() => handleSelect(l.id)}
                      className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                        selectedId === l.id ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{l.titulo}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(l.created_at)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          l.encerrado ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                        }`}>
                          {l.encerrado ? 'Encerrado' : 'Ativo'}
                        </span>
                        <span className="text-xs text-gray-400">{l.total_lances} lance{l.total_lances !== 1 ? 's' : ''}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detalhe */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selectedId ? (
              <p className="text-sm text-gray-400 text-center pt-10">Selecione um leilão para ver os detalhes.</p>
            ) : !detailForSelected ? (
              <p className="text-sm text-gray-400 text-center pt-10">Carregando…</p>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="font-semibold text-gray-900 text-base mb-1">{detailForSelected.leilao.titulo}</h3>
                  {detailForSelected.leilao.descricao && (
                    <p className="text-sm text-gray-500">{detailForSelected.leilao.descricao}</p>
                  )}
                </div>

                {detailForSelected.leilao.especificacoes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Especificações</p>
                    <p className="text-sm text-gray-700">{detailForSelected.leilao.especificacoes}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Valor inicial</p>
                    <p className="font-semibold text-gray-700">{brl(detailForSelected.leilao.valor_inicial)}</p>
                  </div>
                  {detailForSelected.leilao.encerrado && detailForSelected.leilao.valor_final > 0 ? (
                    <div className="bg-orange-50 rounded-lg p-3">
                      <p className="text-xs text-orange-500">Valor final</p>
                      <p className="font-bold text-orange-700">{brl(detailForSelected.leilao.valor_final)}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Menor lance</p>
                      <p className="font-semibold text-gray-700">{brl(detailForSelected.leilao.menor_lance)}</p>
                    </div>
                  )}
                </div>

                {detailForSelected.leilao.encerrado && detailForSelected.leilao.vencedor_id && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-center">
                    <p className="text-xs text-green-600 mb-1">🏆 Vencedor</p>
                    <p className="font-bold text-green-800 text-lg">{detailForSelected.leilao.vencedor_id}</p>
                    <p className="text-green-600 font-semibold">{brl(detailForSelected.leilao.valor_final)}</p>
                  </div>
                )}

                {detailForSelected.lances.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Lances ({detailForSelected.lances.length})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {[...detailForSelected.lances].reverse().map((b, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-1.5 rounded text-sm">
                          <span className="text-gray-700">{b.transportadora_id}</span>
                          <span className="font-bold text-orange-600">{brl(b.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>Criado: {fmtDate(detailForSelected.leilao.created_at)}</p>
                  {detailForSelected.leilao.ended_at && (
                    <p>Encerrado: {fmtDate(detailForSelected.leilao.ended_at)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
