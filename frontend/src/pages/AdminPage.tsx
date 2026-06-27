import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import StatusPanel  from '../components/StatusPanel'
import BidHistory   from '../components/BidHistory'
import Logo from '../components/Logo'
import AlertBanner  from '../components/AlertBanner'

const COUNTDOWN_LABELS: Record<number, string> = {
  3: 'Dou-lhe uma!',
  2: 'Dou-lhe duas!',
  1: 'Dou-lhe três!',
}

export default function AdminPage() {
  const { id } = useParams()
  const leilaoId = parseInt(id ?? '0')
  const navigate = useNavigate()

  const userId = sessionStorage.getItem('userId')
  const role   = sessionStorage.getItem('userRole')

  const {
    connected, status, history, closeResponse, lastUpdate, error,
    joinAuction, requestStatus, requestHistory, closeAuction, clearError,
  } = useSocket()

  const [joined, setJoined]         = useState(false)
  const [closing, setClosing]       = useState(false)
  const [countdown, setCountdown]   = useState<number | null>(null)
  const [copiado, setCopiado]       = useState(false)
  const [tempoRestante, setTempoRestante] = useState(0)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerCountRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  function formatCountdown(s: number): string {
    if (s <= 0) return '0s'
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const parts: string[] = []
    if (d > 0) parts.push(`${d}dia(s)`)
    if (h > 0 || d > 0) parts.push(`${h}h`)
    if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
    parts.push(`${sec}s`)
    return parts.join(' ')
  }

  useEffect(() => {
    if (!userId || role !== 'admin') navigate('/')
  }, [userId, role, navigate])

  useEffect(() => {
    if (connected && userId && !joined) {
      joinAuction(leilaoId, userId)
      requestStatus(leilaoId)
      requestHistory(leilaoId)
      setJoined(true)
    }
  }, [connected, userId, joined, leilaoId, joinAuction, requestStatus, requestHistory])

  useEffect(() => {
    if (closeResponse?.leilao_id === leilaoId) {
      setClosing(false)
      setCountdown(null)
    }
  }, [closeResponse, leilaoId])

  // Countdown do timer do leilão (local)
  useEffect(() => {
    if (!status) return
    setTempoRestante(status.tempo_restante_s)
    if (timerCountRef.current) clearInterval(timerCountRef.current)
    if (status.tempo_restante_s > 0 && !status.encerrado) {
      timerCountRef.current = setInterval(() => {
        setTempoRestante(prev => {
          if (prev <= 1) { clearInterval(timerCountRef.current!); return 0 }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (timerCountRef.current) clearInterval(timerCountRef.current) }
  }, [status?.tempo_restante_s, status?.encerrado])

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerCountRef.current) clearInterval(timerCountRef.current)
  }, [])

  function handleCopiar() {
    if (!status?.join_code) return
    navigator.clipboard.writeText(status.join_code)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function handleCloseClick() {
    if (closing || status?.encerrado || closeResponse?.sucesso) return
    setClosing(true)
    setCountdown(3)
    let count = 3
    intervalRef.current = setInterval(() => {
      count -= 1
      setCountdown(count)
      if (count <= 0) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        closeAuction(leilaoId, userId!)
      }
    }, 1000)
  }

  if (!userId) return null

  const isAuctionClosed = status?.encerrado ?? closeResponse?.sucesso ?? false
  const winner = closeResponse?.sucesso && closeResponse.leilao_id === leilaoId
    ? { id: closeResponse.vencedor_id, valor: closeResponse.valor_final }
    : null

  const encerradoPorUpdate = lastUpdate?.encerrado && lastUpdate.leilao_id === leilaoId
    ? { id: lastUpdate.transportadora_lider, valor: lastUpdate.menor_lance }
    : null
  const vencedor = winner ?? encerradoPorUpdate

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')}
              className="text-sm text-gray-400 hover:text-orange-500">← Voltar</button>
            <Logo height={56} />
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {status?.join_code && (
              <button
                onClick={handleCopiar}
                className="flex items-center gap-1.5 text-sm bg-orange-50 border border-orange-200 text-orange-700 font-mono font-bold px-3 py-1.5 rounded-lg hover:bg-orange-100"
              >
                {status.join_code} {copiado ? '✓' : '📋'}
              </button>
            )}
            <button onClick={() => { sessionStorage.clear(); navigate('/') }}
              className="text-sm text-gray-400 hover:text-red-500">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-4">
        {vencedor && (
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-6 text-white text-center">
            <p className="text-lg font-bold mb-1">✅ Leilão Encerrado!</p>
            {vencedor.id ? (
              <>
                <p className="text-green-100 text-sm">Vencedor: <strong>{vencedor.id}</strong></p>
                <p className="text-2xl font-bold mt-2">
                  {vencedor.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </>
            ) : (
              <p className="text-green-100 text-sm">Nenhum lance registrado.</p>
            )}
          </div>
        )}

        {error && <AlertBanner message={error} type="error" onDismiss={clearError} />}

        {/* Timer do leilão */}
        {status?.tempo_total_s != null && status.tempo_total_s > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-500">Tempo restante</span>
            <span className={`font-mono font-bold text-sm ${
              isAuctionClosed ? 'text-red-500' : tempoRestante < 30 ? 'text-red-600' : 'text-gray-800'
            }`}>
              {isAuctionClosed ? 'Encerrado' : formatCountdown(tempoRestante)}
            </span>
          </div>
        )}

        {status?.especificacoes && (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">Especificações</p>
            <p className="text-sm text-gray-700">{status.especificacoes}</p>
          </div>
        )}

        <StatusPanel status={status} connected={connected} />

        {!isAuctionClosed && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-1">Encerrar Leilão</h2>
            <p className="text-sm text-gray-400 mb-5">
              Ao encerrar, todos os participantes são notificados imediatamente.
            </p>
            {closing && countdown !== null ? (
              <div className="text-center py-4">
                <p className="text-6xl font-black text-orange-500 tabular-nums mb-2">{countdown}</p>
                <p className="text-sm font-medium text-gray-500">{COUNTDOWN_LABELS[countdown] ?? '…'}</p>
              </div>
            ) : (
              <button
                onClick={handleCloseClick}
                disabled={!connected}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg"
              >
                Encerrar Leilão
              </button>
            )}
          </div>
        )}

        <BidHistory history={history} />
      </main>
    </div>
  )
}
