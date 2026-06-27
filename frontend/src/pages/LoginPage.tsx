import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import Logo from '../components/Logo'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')
  const navigate = useNavigate()
  const { connected, login, loginResponse } = useSocket()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) { setErro('Informe um nome ou usuário.'); return }
    setErro('')
    setLoading(true)
    login(username.trim(), password.trim())
  }

  useEffect(() => {
    if (!loginResponse) return
    setLoading(false)
    if (!loginResponse.sucesso) { setErro(loginResponse.mensagem); return }
    sessionStorage.setItem('userId',   loginResponse.userId)
    sessionStorage.setItem('userRole', loginResponse.role)
    navigate(loginResponse.role === 'admin' ? '/admin' : '/transportadora')
  }, [loginResponse, navigate])

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo height={200} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome / Usuário
            </label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ex: TransLog SP  ou  admin"
              autoFocus autoComplete="off"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Senha <span className="text-gray-400 font-normal">(apenas para admin e transportadoras cadastradas)</span>
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Sua senha"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-900"
            />
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
              {erro}
            </p>
          )}

          <button
            type="submit" disabled={loading || !connected}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Entrando…' : !connected ? 'Conectando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
