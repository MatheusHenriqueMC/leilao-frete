import { useState, type FormEvent } from 'react'
import type { BidResponse } from '../types'

interface Props {
  currentLowest: number | null
  onBid: (valor: number) => void
  lastResponse: BidResponse | null
  disabled: boolean
}

export default function BidForm({ currentLowest, onBid, lastResponse, disabled }: Props) {
  const [valor, setValor] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const v = parseFloat(valor.replace(',', '.'))
    if (isNaN(v) || v <= 0) return
    onBid(v)
    setValor('')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-800 mb-1">Fazer Lance</h2>
      {currentLowest !== null && (
        <p className="text-sm text-gray-400 mb-4">
          Lance deve ser menor que{' '}
          <strong className="text-blue-600">
            {currentLowest.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </strong>
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium select-none">
            R$
          </span>
          <input
            type="number"
            value={valor}
            onChange={e => setValor(e.target.value)}
            placeholder="0,00"
            step="0.01"
            min="0.01"
            disabled={disabled}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed text-gray-900"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || !valor}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Dar lance
        </button>
      </form>

      {lastResponse && (
        <div
          className={`mt-3 px-4 py-2.5 rounded-lg text-sm font-medium ${
            lastResponse.aceito
              ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {lastResponse.aceito ? '✓ ' : '✗ '}
          {lastResponse.mensagem}
        </div>
      )}
    </div>
  )
}
