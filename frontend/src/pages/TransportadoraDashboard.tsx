import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import AuctionHistoryModal  from '../components/AuctionHistoryModal'
import AuctionPreviewModal  from '../components/AuctionPreviewModal'
import Logo           from '../components/Logo'
import ToastContainer from '../components/ToastContainer'
import { useLeadershipNotifications } from '../hooks/useLeadershipNotifications'
import type { AuctionSummary } from '../types'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtTime(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function TimerBadge({ segundos }: { segundos: number }) {
  const [s, setS] = useState(segundos)
  useEffect(() => {
    if (s <= 0) return
    const id = setInterval(() => setS(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  if (s <= 0) return null
  const m = Math.floor(s / 60), sec = s % 60
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${s < 30 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
      ⏱ {m > 0 ? `${m}m ` : ''}{sec}s
    </span>
  )
}

export default function TransportadoraDashboard() {
  const navigate = useNavigate()
  const userId = sessionStorage.getItem('userId')
  const role   = sessionStorage.getItem('userRole')

  const {
    connected, auctionsList, carrierHistory, auctionDetail,
    resolveCodeResult, lastUpdate, listAuctions, fetchCarrierHistory,
    fetchAuctionDetail, resolveCode, joinAuction,
  } = useSocket()

  // Usa auctionsList (do socket) como seed — disponível antes do estado local
  const { toasts, dismissToast } = useLeadershipNotifications(
    userId,
    lastUpdate,
    undefined,
    auctionsList.map(l => ({ id: l.id, transportadora_lider: l.transportadora_lider, titulo: l.titulo })),
  )

  const [ativos, setAtivos]       = useState<AuctionSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [preview, setPreview]     = useState<AuctionSummary | null>(null)
  const [code, setCode]           = useState('')
  const [codeErro, setCodeErro]   = useState('')
  const [loadingCode, setLoadingCode] = useState(false)

  useEffect(() => {
    if (!userId || role !== 'transportadora') navigate('/')
  }, [userId, role, navigate])

  useEffect(() => {
    if (connected) {
      listAuctions(true)
      if (userId) fetchCarrierHistory(userId)
    }
  }, [connected, userId, listAuctions, fetchCarrierHistory])

  useEffect(() => {
    setAtivos(auctionsList)
  }, [auctionsList])

  // Entra nas rooms dos leilões onde o usuário está liderando para receber notificações no dashboard
  useEffect(() => {
    if (!connected || !userId) return
    auctionsList
      .filter(l => !l.encerrado && l.transportadora_lider === userId)
      .forEach(l => joinAuction(l.id, userId))
  }, [auctionsList, connected, userId, joinAuction])

  // auto-refresh
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => listAuctions(true), 15000)
    return () => clearInterval(id)
  }, [connected, listAuctions])

  // resolve code result
  useEffect(() => {
    if (!resolveCodeResult) return
    setLoadingCode(false)
    if (!resolveCodeResult.encontrado) {
      setCodeErro(resolveCodeResult.mensagem)
      return
    }
    navigate(`/leilao/${resolveCodeResult.leilao_id}`)
  }, [resolveCodeResult, navigate])

  function handleCode(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setCodeErro('')
    setLoadingCode(true)
    resolveCode(code.trim())
  }

  if (!userId) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo height={60} />
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userId}</span>
            <button
              onClick={() => setShowHistory(true)}
              className="text-sm text-orange-500 hover:text-orange-700 font-medium"
            >
              Meu Histórico
            </button>
            <button onClick={() => { sessionStorage.clear(); navigate('/') }}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">
        {/* Entrar por código */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Entrar por Código</h2>
          <p className="text-sm text-gray-400 mb-4">Não está achando o leilão que procura? Utilize o código e vá direto para ele.</p>
          <form onSubmit={handleCode} className="flex gap-2">
            <input
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setCodeErro('') }}
              placeholder="ex: F3T8KZ"
              maxLength={6}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="submit"
              disabled={loadingCode || !code.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-lg"
            >
              {loadingCode ? '…' : 'Entrar'}
            </button>
          </form>
          {codeErro && (
            <p className="mt-2 text-sm text-red-600">{codeErro}</p>
          )}
        </div>

        {/* Leilões ativos */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Leilões Ativos</h2>
            <button onClick={() => listAuctions(true)} className="text-xs text-orange-500 hover:text-orange-700">
              Atualizar
            </button>
          </div>

          {ativos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-gray-400">Nenhum leilão ativo no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {ativos.map(l => (
                <div key={l.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">

                  {/* Data e hora */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs text-gray-600">{fmtDate(l.created_at)}</span>
                    <span className="text-xs font-semibold text-gray-700">{fmtTime(l.created_at)}</span>
                  </div>

                  {/* Imagem / thumbnail */}
                  <div className="bg-white flex items-center justify-center overflow-hidden"
                    style={{ height: '260px' }}>
                    {l.thumbnail ? (
                      <img src={l.thumbnail} alt={l.titulo}
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center text-gray-300 select-none">
                        <div className="text-7xl">🚚</div>
                      </div>
                    )}
                  </div>

                  {/* Título */}
                  <div className="px-3 py-2 border-t border-gray-100 flex-1 flex items-center justify-center">
                    <p className="text-sm font-bold text-orange-600 text-center uppercase leading-tight line-clamp-3">
                      {l.titulo}
                    </p>
                  </div>

                  {/* Timer se houver */}
                  {l.tempo_restante_s > 0 && (
                    <div className="px-3 pb-1 flex justify-center">
                      <TimerBadge segundos={l.tempo_restante_s} />
                    </div>
                  )}

                  {/* Botões */}
                  <div className="border-t border-gray-100 flex justify-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => navigate(`/leilao/${l.id}`)}
                      title="Entrar no leilão"
                      className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white text-xl transition-colors shadow-sm">
                      🔨
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setPreview(l) }}
                      title="Ver detalhes"
                      className="w-12 h-12 rounded-full bg-gray-400 hover:bg-gray-500 flex items-center justify-center text-white text-base transition-colors shadow-sm">
                      🔍
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {preview && (
        <AuctionPreviewModal
          leilao={preview}
          onClose={() => setPreview(null)}
          onEnter={() => { navigate(`/leilao/${preview.id}`); setPreview(null) }}
        />
      )}

      {showHistory && userId && (
        <AuctionHistoryModal
          titulo="Meu Histórico"
          leiloes={carrierHistory}
          onClose={() => setShowHistory(false)}
          onFetchDetail={fetchAuctionDetail}
          detail={auctionDetail}
        />
      )}
    </div>
  )
}
