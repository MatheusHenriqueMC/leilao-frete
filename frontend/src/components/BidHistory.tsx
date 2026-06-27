import { useEffect, useRef, useState } from 'react'
import type { BidItem } from '../types'

interface Props {
  history: BidItem[]
  highlightId?: string
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function timeLabel(timestamp_ms: number) {
  return new Date(timestamp_ms).toLocaleTimeString('pt-BR')
}

export default function BidHistory({ history, highlightId }: Props) {
  const sorted = [...history].reverse()
  const prevLengthRef = useRef(0)
  const [animatingKey, setAnimatingKey] = useState<string | null>(null)

  useEffect(() => {
    // Anima apenas quando um lance novo é adicionado (não no carregamento inicial)
    if (history.length > prevLengthRef.current && prevLengthRef.current > 0) {
      const newest = [...history].reverse()[0]
      if (newest) {
        setAnimatingKey(`${newest.timestamp}-${newest.transportadora_id}`)
      }
    }
    prevLengthRef.current = history.length
  }, [history])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Histórico de Lances</h2>
        <span className="text-xs text-gray-400">
          {history.length} lance{history.length !== 1 ? 's' : ''}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhum lance registrado ainda.</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {sorted.map((bid, i) => {
            const key = `${bid.timestamp}-${bid.transportadora_id}`
            const isMe = bid.transportadora_id === highlightId
            const isWinner = i === 0
            const isNew = key === animatingKey

            return (
              <div
                key={key}
                onAnimationEnd={() => setAnimatingKey(null)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                  isNew
                    ? 'bid-flash-new'
                    : isMe
                      ? 'bg-orange-50 border border-orange-100'
                      : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isWinner && <span className="text-xs">🏆</span>}
                  <span className={`font-medium truncate ${isMe ? 'text-orange-700' : 'text-gray-700'}`}>
                    {bid.transportadora_id}
                    {isMe && <span className="ml-1 text-orange-400 font-normal">(você)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="font-bold text-orange-600">{brl(bid.valor)}</span>
                  <span className="text-gray-400 text-xs">{timeLabel(bid.timestamp)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
