import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
// BidHistory removido — substituído pelo painel unificado abaixo
import AlertBanner    from '../components/AlertBanner'
import Logo           from '../components/Logo'
import ToastContainer from '../components/ToastContainer'
import { useLeadershipNotifications } from '../hooks/useLeadershipNotifications'

// ── Helpers ───────────────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

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

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function calcStep(valor: number): number {
  if (valor > 100_000) return 2_000
  if (valor > 10_000)  return 500
  if (valor > 1_000)   return 100
  return 10
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function AuctionPage() {
  const { id } = useParams()
  const leilaoId = parseInt(id ?? '0')
  const navigate = useNavigate()

  const userId = sessionStorage.getItem('userId')
  const role   = sessionStorage.getItem('userRole')

  const {
    connected, status, history, lastBidResponse, lastUpdate,
    auctionDetail, countdownEvent, error,
    joinAuction, placeBid, requestStatus, requestHistory,
    fetchAuctionDetail, clearError,
  } = useSocket()

  const [joined, setJoined]               = useState(false)
  const [tempoRestante, setTempoRestante] = useState(0)
  const [imgIndex, setImgIndex]           = useState(0)
  const [valorCustom, setValorCustom]     = useState('')
  const [bidFeedback, setBidFeedback]     = useState<{ msg: string; ok: boolean } | null>(null)
  const [pendingBid, setPendingBid]       = useState<number | null>(null)
  const [encerrandoCountdown, setEncerrandoCountdown] = useState<number | null>(null)
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!userId || role !== 'transportadora') navigate('/')
  }, [userId, role, navigate])

  // Join + load
  useEffect(() => {
    if (connected && userId && !joined) {
      joinAuction(leilaoId, userId)
      requestStatus(leilaoId)
      requestHistory(leilaoId)
      fetchAuctionDetail(leilaoId)
      setJoined(true)
    }
  }, [connected, userId, joined, leilaoId, joinAuction, requestStatus, requestHistory, fetchAuctionDetail])

  // Countdown local — reset sempre que o servidor atualizar o tempo restante
  useEffect(() => {
    if (!status) return
    if (timerRef.current) clearInterval(timerRef.current)
    setTempoRestante(status.tempo_restante_s)
    if (status.tempo_restante_s > 0 && !status.encerrado) {
      timerRef.current = setInterval(() => {
        setTempoRestante(prev => {
          if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status?.tempo_restante_s, status?.encerrado])

  // Bid feedback
  useEffect(() => {
    if (!lastBidResponse || lastBidResponse.leilao_id !== leilaoId) return
    setBidFeedback({ msg: lastBidResponse.mensagem, ok: lastBidResponse.aceito })
    const t = setTimeout(() => setBidFeedback(null), 4000)
    return () => clearTimeout(t)
  }, [lastBidResponse, leilaoId])

  const { toasts, dismissToast } = useLeadershipNotifications(userId, lastUpdate, status, undefined)

  // Mostra o countdown de encerramento broadcast pelo admin
  useEffect(() => {
    if (!countdownEvent || countdownEvent.leilao_id !== leilaoId) return
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    if (countdownEvent.active) {
      setEncerrandoCountdown(3)
      let c = 3
      countdownTimerRef.current = setInterval(() => {
        c -= 1
        setEncerrandoCountdown(c)
        if (c <= 0) {
          clearInterval(countdownTimerRef.current!)
          setEncerrandoCountdown(null)
        }
      }, 1000)
    } else {
      // Cancelado por novo lance
      setEncerrandoCountdown(null)
    }
    return () => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current) }
  }, [countdownEvent, leilaoId])

  if (!userId) return null

  // ── Estado derivado ───────────────────────────────────────────────────────

  const isAuctionClosed = status?.encerrado
    ?? (lastUpdate?.encerrado && lastUpdate.leilao_id === leilaoId)
    ?? false

  const menorLance = status?.menor_lance ?? status?.valor_inicial ?? 0
  const step       = calcStep(menorLance)
  const presets    = [1, 2, 3, 4, 6, 8, 12, 16]
    .map(m => parseFloat((menorLance - m * step).toFixed(2)))
    .filter(v => v > 0)
    .slice(0, 8)

  const imagens: string[] =
    auctionDetail?.leilao?.id === leilaoId ? auctionDetail.imagens : []

  // Vencedor — derivado do status (funciona tanto em tempo real quanto ao navegar para leilão já encerrado)
  const temVencedor = isAuctionClosed && !!status?.transportadora_lider
  const vencedorId  = status?.transportadora_lider ?? ''
  const vencedorValor = status?.menor_lance ?? 0

  // Status badge
  const badge = isAuctionClosed
    ? { label: 'Encerrado',     cls: 'bg-red-600 text-white' }
    : (status?.total_lances ?? 0) === 0
      ? { label: 'Aguardando',  cls: 'bg-orange-500 text-white' }
      : { label: 'Em andamento', cls: 'bg-green-600 text-white' }

  // Seleciona um lance para confirmação (não envia ainda)
  function handleSelectBid(valor: number) {
    setPendingBid(valor)
    setBidFeedback(null)
  }

  // Confirma e envia o lance
  function handleConfirmBid() {
    if (pendingBid === null || !userId || isAuctionClosed) return
    placeBid(leilaoId, userId, pendingBid)
    setPendingBid(null)
    setValorCustom('')
  }

  function handleCustomBid() {
    const v = parseFloat(valorCustom.replace(',', '.'))
    if (!isNaN(v) && v > 0) handleSelectBid(v)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Usuário é o líder atual com pelo menos 1 lance
  const isLeader = !!userId
    && status?.transportadora_lider === userId
    && (status?.total_lances ?? 0) > 0

  const COUNTDOWN_LABELS: Record<number, string> = {
    3: 'Dou-lhe uma!',
    2: 'Dou-lhe duas!',
    1: 'Dou-lhe três!',
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {/* Header — logo centralizada */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 grid grid-cols-3 items-center">
          <button onClick={() => navigate('/transportadora')}
            className="text-sm text-gray-500 hover:text-orange-500 justify-self-start">
            ← Voltar
          </button>
          <div className="flex justify-center">
            <Logo height={64} />
          </div>
          <button onClick={() => { sessionStorage.clear(); navigate('/') }}
            className="text-sm text-gray-400 hover:text-red-500 justify-self-end">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && <div className="mb-4"><AlertBanner message={error} type="error" onDismiss={clearError} /></div>}
        {!connected && <div className="mb-4"><AlertBanner message="Conectando…" type="warning" /></div>}

        <h2 className="text-xl font-bold text-gray-900 mb-4">{status?.titulo ?? '—'}</h2>

        {/* ── Grade principal: imagem + painel ────────────────────────────── */}
        {/*
          items-stretch (padrão flex) faz os dois filhos terem a mesma altura.
          A imagem usa h-full para preencher; o painel usa flex-col + h-full.
          min-h-[360px] garante altura mínima visível quando o painel tem pouco conteúdo.
        */}
        <div className="flex flex-col lg:flex-row gap-6 mb-6 lg:min-h-[360px]">

          {/* Carrossel */}
          <div className="lg:w-[55%] lg:flex-shrink-0 min-h-[260px] lg:min-h-0">
            <div className="h-full bg-white border border-gray-200 rounded-lg overflow-hidden
                            relative flex items-center justify-center">
              {imagens.length > 0 ? (
                <>
                  <img src={imagens[imgIndex]} alt=""
                    className="w-full h-full object-contain" />
                  {imagens.length > 1 && (
                    <>
                      <button
                        onClick={() => setImgIndex(p => (p - 1 + imagens.length) % imagens.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60
                                   text-white rounded-full w-8 h-8 flex items-center justify-center">
                        ‹
                      </button>
                      <button
                        onClick={() => setImgIndex(p => (p + 1) % imagens.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60
                                   text-white rounded-full w-8 h-8 flex items-center justify-center">
                        ›
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                        {imagens.map((_, i) => (
                          <button key={i} onClick={() => setImgIndex(i)}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              i === imgIndex ? 'bg-white' : 'bg-white/50'
                            }`} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-center text-gray-300 select-none">
                  <div className="text-6xl mb-2">🚚</div>
                  <p className="text-sm">Sem imagens</p>
                </div>
              )}
            </div>
          </div>

          {/* Painel lateral */}
          <div className="lg:flex-1">
            <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg overflow-hidden">

              {/* Badge de status / Timer — ocupa o mesmo espaço */}
              <div className={`px-4 py-2.5 text-center font-semibold shrink-0 ${badge.cls}`}>
                {isAuctionClosed ? (
                  <span className="text-sm">Encerrado</span>
                ) : status?.tempo_total_s && status.tempo_total_s > 0 ? (
                  // Quando há timer ativo, exibe a contagem no lugar do label
                  <span className={`font-mono text-base tracking-wide ${
                    tempoRestante < 30 ? 'animate-pulse' : ''
                  }`}>
                    {formatCountdown(tempoRestante)}
                  </span>
                ) : (
                  <span className="text-sm">{badge.label}</span>
                )}
              </div>

              {/* Grid de valores */}
              <div className="grid grid-cols-2 divide-x divide-y divide-gray-100 border-b border-gray-200 shrink-0">
                <div className="px-4 py-3">
                  <p className="text-xs text-orange-600 font-medium">Lance inicial</p>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">
                    {status ? brl(status.valor_inicial) : '—'}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-orange-600 font-medium">Lances</p>
                  <p className="font-semibold text-gray-800 text-sm mt-0.5">
                    {status?.total_lances ?? 0}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500">Último lance</p>
                  <p className={`font-bold text-sm mt-0.5 ${
                    (status?.total_lances ?? 0) > 0 ? 'text-orange-700' : 'text-gray-400'
                  }`}>
                    {(status?.total_lances ?? 0) > 0 ? brl(status!.menor_lance) : '—'}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500">Líder</p>
                  <p className="text-sm text-gray-700 mt-0.5 truncate font-medium">
                    {status?.transportadora_lider || '—'}
                  </p>
                </div>
              </div>

              {/* Vencedor — só quando tem lance real */}
              {isAuctionClosed && (
                <div className={`px-4 py-3 border-b border-gray-100 shrink-0 text-center ${
                  temVencedor ? 'bg-orange-50' : 'bg-gray-50'
                }`}>
                  {temVencedor ? (
                    <>
                      <p className="text-xs text-orange-500 mb-0.5">🏆 Vencedor</p>
                      <p className="font-bold text-orange-800 text-sm">
                        {vencedorId === userId ? 'Você!' : vencedorId}
                      </p>
                      <p className="text-orange-700 font-semibold text-sm">{brl(vencedorValor)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Nenhum lance registrado</p>
                  )}
                </div>
              )}

              {/* Área de lance — preenche o espaço disponível */}
              <div className="flex-1 flex flex-col">
                {isAuctionClosed ? (
                  <div className="p-4" />

                ) : encerrandoCountdown !== null && isLeader ? (
                  /* ── COUNTDOWN: usuário é o líder — não pode dar lance ── */
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="mb-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                      <p className="text-green-700 font-bold text-sm">🏆 Você está com o melhor lance!</p>
                      <p className="text-green-600 text-xs mt-0.5">Contagem iniciada — aguarde o resultado</p>
                    </div>
                    <p className="text-7xl font-black text-orange-500 tabular-nums my-3">
                      {encerrandoCountdown}
                    </p>
                    <p className="text-base font-bold text-gray-700">
                      {COUNTDOWN_LABELS[encerrandoCountdown] ?? '…'}
                    </p>
                  </div>

                ) : encerrandoCountdown !== null && !isLeader ? (
                  /* ── COUNTDOWN: usuário NÃO é o líder — pode dar lance para cancelar ── */
                  <div className="p-4">
                    <div className="text-center mb-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                      <p className="text-orange-700 font-bold text-sm">⚡ Leilão sendo encerrado!</p>
                      <p className="text-5xl font-black text-orange-500 tabular-nums my-2">
                        {encerrandoCountdown}
                      </p>
                      <p className="text-sm font-bold text-gray-700">
                        {COUNTDOWN_LABELS[encerrandoCountdown] ?? '…'}
                      </p>
                      <p className="text-xs text-orange-500 mt-1 font-medium">
                        Dê um lance para cancelar o encerramento!
                      </p>
                    </div>

                    {/* Formulário de lance ainda disponível */}
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {presets.map(v => (
                        <button key={v} onClick={() => handleSelectBid(v)} disabled={!connected}
                          className={`py-2 px-1 text-xs font-semibold rounded transition-colors border disabled:opacity-40
                                      ${pendingBid === v
                                        ? 'bg-orange-500 text-white border-orange-500'
                                        : 'bg-gray-100 hover:bg-orange-100 text-gray-700 border-gray-200 hover:border-orange-300'}`}>
                          {v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </button>
                      ))}
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mb-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                          <input type="number" value={valorCustom}
                            onChange={e => setValorCustom(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCustomBid()}
                            placeholder="0,00" step="0.01" min="0.01" disabled={!connected}
                            className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100" />
                        </div>
                        <button onClick={handleCustomBid} disabled={!connected || !valorCustom}
                          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded text-sm whitespace-nowrap">
                          Selecionar
                        </button>
                      </div>
                    </div>
                    {pendingBid !== null && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-orange-600 font-medium">Lance selecionado</p>
                          <p className="text-base font-black text-orange-700">{brl(pendingBid)}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setPendingBid(null)}
                            className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-100">
                            Cancelar
                          </button>
                          <button onClick={handleConfirmBid} disabled={!connected}
                            className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded">
                            Confirmar lance
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                ) : (
                  /* ── NORMAL: sem countdown ── */
                  <div className="flex flex-col justify-end flex-1 p-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
                      Dê o seu lance
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                      {presets.map(v => (
                        <button key={v} onClick={() => handleSelectBid(v)} disabled={!connected}
                          className={`py-2 px-1 text-xs font-semibold rounded transition-colors border disabled:opacity-40
                                      ${pendingBid === v
                                        ? 'bg-orange-500 text-white border-orange-500'
                                        : 'bg-gray-100 hover:bg-orange-100 text-gray-700 border-gray-200 hover:border-orange-300'}`}>
                          {v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </button>
                      ))}
                    </div>
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 mb-3">
                      <p className="text-xs text-gray-400 mb-2">
                        Outro Valor: <span className="text-gray-500">Decremento mín.: {brl(step)}</span>
                      </p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                          <input type="number" value={valorCustom}
                            onChange={e => setValorCustom(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCustomBid()}
                            placeholder="0,00" step="0.01" min="0.01" disabled={!connected}
                            className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-gray-100" />
                        </div>
                        <button onClick={handleCustomBid} disabled={!connected || !valorCustom}
                          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold px-3 py-1.5 rounded text-sm whitespace-nowrap">
                          Selecionar
                        </button>
                      </div>
                    </div>
                    {pendingBid !== null ? (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-orange-600 font-medium">Lance selecionado</p>
                          <p className="text-base font-black text-orange-700">{brl(pendingBid)}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setPendingBid(null)}
                            className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-100">
                            Cancelar
                          </button>
                          <button onClick={handleConfirmBid} disabled={!connected}
                            className="text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded">
                            Confirmar lance
                          </button>
                        </div>
                      </div>
                    ) : bidFeedback && (
                      <div className={`px-3 py-2 rounded text-xs font-medium ${
                        bidFeedback.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {bidFeedback.ok ? '✓ ' : '✗ '}{bidFeedback.msg}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Painel unificado: Especificações + Últimos Lances + Descrição ── */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">

          {/* ESPECIFICAÇÕES */}
          {status?.especificacoes && (
            <>
              <div className="px-6 py-5">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-widest mb-3">
                  Especificações
                </h3>
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                  {status.especificacoes}
                </p>
              </div>
              <hr className="border-gray-200" />
            </>
          )}

          {/* ÚLTIMOS LANCES */}
          <div className="px-6 py-5">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-widest mb-3">
              Últimos Lances
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Nenhum lance foi dado para este lote.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-6 font-semibold text-gray-500 text-xs uppercase">
                        Nº do lance
                      </th>
                      <th className="text-left py-2 pr-6 font-semibold text-gray-500 text-xs uppercase">
                        Lance
                      </th>
                      <th className="text-left py-2 pr-6 font-semibold text-gray-500 text-xs uppercase">
                        Data
                      </th>
                      <th className="text-left py-2 font-semibold text-gray-500 text-xs uppercase">
                        Arrematante
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((bid, i) => (
                      <tr
                        key={`${bid.timestamp}-${bid.transportadora_id}`}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="py-2.5 pr-6 text-gray-500">{history.length - i}</td>
                        <td className="py-2.5 pr-6 font-bold text-gray-800">{brl(bid.valor)}</td>
                        <td className="py-2.5 pr-6 text-gray-500 whitespace-nowrap">
                          {formatDateTime(bid.timestamp)}
                        </td>
                        <td className={`py-2.5 font-medium ${
                          bid.transportadora_id === userId
                            ? 'text-orange-600'
                            : 'text-gray-700'
                        }`}>
                          {bid.transportadora_id}
                          {bid.transportadora_id === userId && (
                            <span className="ml-1 text-xs text-orange-400 font-normal">(você)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DESCRIÇÃO DO LEILÃO */}
          {status?.descricao_carga && (
            <>
              <hr className="border-gray-200" />
              <div className="px-6 py-5">
                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-widest mb-3">
                  Descrição do Leilão
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{status.descricao_carga}</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
