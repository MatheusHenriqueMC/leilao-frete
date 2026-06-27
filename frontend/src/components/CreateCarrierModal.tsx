import { useState, type FormEvent, useEffect } from 'react'
import type { CreateCarrierResult } from '../types'

interface Props {
  onClose: () => void
  onCreate: (username: string, password: string) => void
  result: CreateCarrierResult | null
  onClearResult: () => void
}

export default function CreateCarrierModal({ onClose, onCreate, result, onClearResult }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [localErr, setLocalErr] = useState('')

  useEffect(() => {
    if (result) setLoading(false)
  }, [result])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setLocalErr('Preencha todos os campos.'); return }
    if (password !== confirm) { setLocalErr('Senhas não coincidem.'); return }
    setLocalErr('')
    onClearResult()
    setLoading(true)
    onCreate(username.trim(), password)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-lg">Nova Transportadora</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuário *</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ex: translog_sp" autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha *</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required />
          </div>

          {(localErr || (result && !result.sucesso)) && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {localErr || result?.mensagem}
            </p>
          )}
          {result?.sucesso && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              ✓ {result.mensagem}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg">
              {loading ? 'Criando…' : 'Criar Conta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
