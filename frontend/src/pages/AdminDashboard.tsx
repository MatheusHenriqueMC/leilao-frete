import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import CreateAuctionModal  from '../components/CreateAuctionModal'
import AuctionHistoryModal  from '../components/AuctionHistoryModal'
import CreateCarrierModal   from '../components/CreateCarrierModal'
import AuctionPreviewModal  from '../components/AuctionPreviewModal'
import Logo from '../components/Logo'
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

export default function AdminDashboard() {
  const navigate = useNavigate()
  const userId = sessionStorage.getItem('userId')
  const role   = sessionStorage.getItem('userRole')

  const {
    connected, auctionsList, auctionDetail,
    createResult, createCarrierResult,
    listAuctions, createAuction, createCarrier, fetchAuctionDetail,
    clearCreate, clearCreateCarrier,
  } = useSocket()

  const [showCreate,  setShowCreate]  = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCarrier, setShowCarrier] = useState(false)
  const [preview, setPreview]         = useState<AuctionSummary | null>(null)
  const [ativos, setAtivos]           = useState<AuctionSummary[]>([])

  useEffect(() => {
    if (!userId || role !== 'admin') navigate('/')
  }, [userId, role, navigate])

  useEffect(() => {
    if (connected) listAuctions(true)
  }, [connected, listAuctions])

  useEffect(() => {
    setAtivos(auctionsList)
  }, [auctionsList])

  // auto-refresh a cada 15s
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => listAuctions(true), 15000)
    return () => clearInterval(id)
  }, [connected, listAuctions])

  function openHistory() {
    listAuctions(false)
    setShowHistory(true)
  }

  if (!userId) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo height={60} />
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userId}</span>
            <button onClick={() => { sessionStorage.clear(); navigate('/') }}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Ações rápidas */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => { clearCreate(); setShowCreate(true) }}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl p-5 text-left transition-colors"
          >
            <div className="text-3xl mb-2">➕</div>
            <p className="font-bold text-base">Criar Leilão</p>
            <p className="text-orange-100 text-xs mt-1">Novo leilão reverso</p>
          </button>
          <button
            onClick={openHistory}
            className="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl p-5 text-left transition-colors"
          >
            <div className="text-3xl mb-2">📋</div>
            <p className="font-bold text-base">Histórico</p>
            <p className="text-gray-400 text-xs mt-1">Leilões realizados</p>
          </button>
          <button
            onClick={() => { clearCreateCarrier(); setShowCarrier(true) }}
            className="bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 rounded-xl p-5 text-left transition-colors"
          >
            <div className="text-3xl mb-2">👤</div>
            <p className="font-bold text-base">Nova Transportadora</p>
            <p className="text-gray-400 text-xs mt-1">Criar conta de acesso</p>
          </button>
        </div>

        {/* Leilões ativos */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Leilões Ativos</h2>
            <button onClick={() => listAuctions(true)}
              className="text-xs text-orange-500 hover:text-orange-700">
              Atualizar
            </button>
          </div>

          {ativos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
              <p className="text-gray-400">Nenhum leilão ativo no momento.</p>
              <p className="text-sm text-gray-400 mt-1">Crie um novo leilão para começar.</p>
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

                  {/* Imagem */}
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
                  <div className="px-3 py-2 border-t border-gray-100 flex-1 flex flex-col items-center justify-center gap-1">
                    <p className="text-sm font-bold text-orange-600 text-center uppercase leading-tight line-clamp-2">
                      {l.titulo}
                    </p>
                    <p className="text-xs text-gray-400">
                      Código: <strong className="text-orange-600 font-mono">{l.join_code}</strong>
                    </p>
                  </div>

                  {l.tempo_restante_s > 0 && (
                    <div className="px-3 pb-1 flex justify-center">
                      <TimerBadge segundos={l.tempo_restante_s} />
                    </div>
                  )}

                  {/* Botões */}
                  <div className="border-t border-gray-100 flex justify-center gap-3 px-3 py-2.5">
                    <button
                      onClick={() => navigate(`/admin/leilao/${l.id}`)}
                      title="Gerenciar leilão"
                      className="w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center text-white text-xl transition-colors shadow-sm">
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

      {showCreate && (
        <CreateAuctionModal
          onClose={() => setShowCreate(false)}
          onCreate={createAuction}
          result={createResult}
          onClearResult={clearCreate}
        />
      )}

      {preview && (
        <AuctionPreviewModal
          leilao={preview}
          isAdmin
          onClose={() => setPreview(null)}
          onEnter={() => { navigate(`/admin/leilao/${preview.id}`); setPreview(null) }}
        />
      )}

      {showCarrier && (
        <CreateCarrierModal
          onClose={() => setShowCarrier(false)}
          onCreate={createCarrier}
          result={createCarrierResult}
          onClearResult={clearCreateCarrier}
        />
      )}

      {showHistory && (
        <AuctionHistoryModal
          titulo="Histórico de Leilões"
          leiloes={auctionsList}
          onClose={() => setShowHistory(false)}
          onFetchDetail={fetchAuctionDetail}
          detail={auctionDetail}
        />
      )}
    </div>
  )
}
