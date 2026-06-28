import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppBar, Toolbar, Container, Box, Stack, Typography, Button, IconButton, Paper,
  Table, TableHead, TableBody, TableRow, TableCell, Divider, InputAdornment, TextField, Chip,
} from '@mui/material'
import { keyframes } from '@mui/system'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import BoltIcon from '@mui/icons-material/Bolt'
import { useSocket } from '../hooks/useSocket'
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

const COUNTDOWN_LABELS: Record<number, string> = {
  3: 'Dou-lhe uma!',
  2: 'Dou-lhe duas!',
  1: 'Dou-lhe três!',
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
`

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

  useEffect(() => {
    if (connected && userId && !joined) {
      joinAuction(leilaoId, userId)
      requestStatus(leilaoId)
      requestHistory(leilaoId)
      fetchAuctionDetail(leilaoId)
      setJoined(true)
    }
  }, [connected, userId, joined, leilaoId, joinAuction, requestStatus, requestHistory, fetchAuctionDetail])

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

  useEffect(() => {
    if (!lastBidResponse || lastBidResponse.leilao_id !== leilaoId) return
    setBidFeedback({ msg: lastBidResponse.mensagem, ok: lastBidResponse.aceito })
    const t = setTimeout(() => setBidFeedback(null), 4000)
    return () => clearTimeout(t)
  }, [lastBidResponse, leilaoId])

  const { toasts, dismissToast } = useLeadershipNotifications(userId, lastUpdate, status, undefined)

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

  const temVencedor = isAuctionClosed && !!status?.transportadora_lider
  const vencedorId  = status?.transportadora_lider ?? ''
  const vencedorValor = status?.menor_lance ?? 0

  const badge = isAuctionClosed
    ? { label: 'Encerrado',    color: 'error.main' as const }
    : (status?.total_lances ?? 0) === 0
      ? { label: 'Aguardando',   color: 'primary.main' as const }
      : { label: 'Em andamento', color: 'success.main' as const }

  const isLeader = !!userId
    && status?.transportadora_lider === userId
    && (status?.total_lances ?? 0) > 0

  function handleSelectBid(valor: number) {
    setPendingBid(valor)
    setBidFeedback(null)
  }

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

  // ── Sub-render: formulario de lance (presets + custom + confirmacao) ──────

  const presetGrid = (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
      {presets.map(v => (
        <Button
          key={v}
          size="small"
          variant={pendingBid === v ? 'contained' : 'outlined'}
          color={pendingBid === v ? 'primary' : 'inherit'}
          onClick={() => handleSelectBid(v)}
          disabled={!connected}
          sx={{ fontSize: 12, px: 0.5 }}
        >
          {v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </Button>
      ))}
    </Box>
  )

  const customInput = (
    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
      <TextField
        type="number" value={valorCustom} size="small" fullWidth
        onChange={e => setValorCustom(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleCustomBid()}
        placeholder="0,00" disabled={!connected}
        InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
        inputProps={{ step: '0.01', min: '0.01' }}
      />
      <Button variant="contained" onClick={handleCustomBid} disabled={!connected || !valorCustom}>
        Selecionar
      </Button>
    </Stack>
  )

  const pendingConfirm = pendingBid !== null && (
    <Paper variant="outlined" sx={{
      p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5,
      bgcolor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.3)',
    }}>
      <Box>
        <Typography variant="caption" color="primary.dark" fontWeight={500}>Lance selecionado</Typography>
        <Typography fontWeight={800} color="primary.dark">{brl(pendingBid!)}</Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button size="small" color="inherit" variant="outlined" onClick={() => setPendingBid(null)}>Cancelar</Button>
        <Button size="small" variant="contained" onClick={handleConfirmBid} disabled={!connected}>Confirmar lance</Button>
      </Stack>
    </Paper>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
            <Box sx={{ justifySelf: 'start' }}>
              <Button size="small" color="inherit" startIcon={<ArrowBackIcon />} onClick={() => navigate('/transportadora')}>
                Voltar
              </Button>
            </Box>
            <Logo height={56} />
            <Box sx={{ justifySelf: 'end' }}>
              <Button size="small" color="inherit" onClick={() => { sessionStorage.clear(); navigate('/') }}>Sair</Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {error && <Box mb={2}><AlertBanner message={error} type="error" onDismiss={clearError} /></Box>}
        {!connected && <Box mb={2}><AlertBanner message="Conectando..." type="warning" /></Box>}

        <Typography variant="h6" fontWeight={700} mb={2}>{status?.titulo ?? '—'}</Typography>

        {/* Grade principal: carrossel + painel */}
        <Box sx={{
          display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3, mb: 3,
          minHeight: { lg: 360 },
        }}>
          {/* Carrossel */}
          <Box sx={{ width: { lg: '55%' }, flexShrink: { lg: 0 }, minHeight: { xs: 260, lg: 'auto' } }}>
            <Paper variant="outlined" sx={{
              height: '100%', position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {imagens.length > 0 ? (
                <>
                  <Box component="img" src={imagens[imgIndex]} alt=""
                    sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  {imagens.length > 1 && (
                    <>
                      <IconButton
                        onClick={() => setImgIndex(p => (p - 1 + imagens.length) % imagens.length)}
                        sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                          bgcolor: 'rgba(0,0,0,0.4)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } }}
                      >
                        <ChevronLeftIcon />
                      </IconButton>
                      <IconButton
                        onClick={() => setImgIndex(p => (p + 1) % imagens.length)}
                        sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          bgcolor: 'rgba(0,0,0,0.4)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' } }}
                      >
                        <ChevronRightIcon />
                      </IconButton>
                      <Stack direction="row" spacing={0.5}
                        sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>
                        {imagens.map((_, i) => (
                          <Box key={i} onClick={() => setImgIndex(i)}
                            sx={{ width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                              bgcolor: i === imgIndex ? 'white' : 'rgba(255,255,255,0.5)' }} />
                        ))}
                      </Stack>
                    </>
                  )}
                </>
              ) : (
                <Stack alignItems="center" sx={{ color: 'grey.300' }}>
                  <LocalShippingIcon sx={{ fontSize: 64 }} />
                  <Typography variant="body2">Sem imagens</Typography>
                </Stack>
              )}
            </Paper>
          </Box>

          {/* Painel lateral */}
          <Box sx={{ flex: 1 }}>
            <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Badge / Timer */}
              <Box sx={{ px: 2, py: 1.25, textAlign: 'center', fontWeight: 600, color: 'white', bgcolor: badge.color, flexShrink: 0 }}>
                {isAuctionClosed ? (
                  <Typography variant="body2">Encerrado</Typography>
                ) : status?.tempo_total_s && status.tempo_total_s > 0 ? (
                  <Typography fontFamily="monospace" sx={{ animation: tempoRestante < 30 ? `${pulse} 1s infinite` : undefined }}>
                    {formatCountdown(tempoRestante)}
                  </Typography>
                ) : (
                  <Typography variant="body2">{badge.label}</Typography>
                )}
              </Box>

              {/* Menor lance atual — protagonista da tela */}
              <Box sx={{ px: 2, py: 2, textAlign: 'center', flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {isAuctionClosed ? 'Lance final' : (status?.total_lances ?? 0) > 0 ? 'Menor lance atual' : 'Lance inicial'}
                </Typography>
                <Typography sx={{ fontSize: 36, fontWeight: 800, color: 'primary.dark', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, mt: 0.25, mb: 0.75 }}>
                  {brl(menorLance)}
                </Typography>
                {!isAuctionClosed && (
                  (status?.total_lances ?? 0) > 0 ? (
                    isLeader ? (
                      <Chip size="small" color="success" variant="outlined"
                        icon={<EmojiEventsIcon />} label="Você está na frente" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Líder: <Box component="strong" sx={{ color: 'text.primary' }}>{status?.transportadora_lider}</Box>
                      </Typography>
                    )
                  ) : (
                    <Typography variant="caption" color="text.disabled">Seja o primeiro a dar um lance</Typography>
                  )
                )}
              </Box>

              {/* Stats secundarios */}
              <Box sx={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', flexShrink: 0,
                borderBottom: '1px solid', borderColor: 'divider',
                '& > *': { px: 2, py: 1.25 },
                '& > *:first-of-type': { borderRight: '1px solid', borderColor: 'divider' },
              }}>
                <Box>
                  <Typography variant="caption" color="text.disabled">Lance inicial</Typography>
                  <Typography variant="body2" fontWeight={600}>{status ? brl(status.valor_inicial) : '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.disabled">Total de lances</Typography>
                  <Typography variant="body2" fontWeight={600}>{status?.total_lances ?? 0}</Typography>
                </Box>
              </Box>

              {/* Vencedor */}
              {isAuctionClosed && (
                <Box sx={{ px: 2, py: 1.5, textAlign: 'center', flexShrink: 0,
                  borderBottom: '1px solid', borderColor: 'divider',
                  bgcolor: temVencedor ? 'rgba(249,115,22,0.08)' : 'grey.50' }}>
                  {temVencedor ? (
                    <>
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                        <EmojiEventsIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                        <Typography variant="caption" color="primary.main">Vencedor</Typography>
                      </Stack>
                      <Typography fontWeight={700} color="primary.dark">
                        {vencedorId === userId ? 'Você!' : vencedorId}
                      </Typography>
                      <Typography fontWeight={600} color="primary.dark">{brl(vencedorValor)}</Typography>
                    </>
                  ) : (
                    <Typography variant="caption" color="text.disabled">Nenhum lance registrado</Typography>
                  )}
                </Box>
              )}

              {/* Área de lance */}
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {isAuctionClosed ? (
                  <Box sx={{ p: 2 }} />
                ) : encerrandoCountdown !== null && isLeader ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, p: 3, textAlign: 'center' }}>
                    <Paper variant="outlined" sx={{ px: 2, py: 1, mb: 1.5, bgcolor: 'rgba(22,163,74,0.08)', borderColor: 'rgba(22,163,74,0.3)' }}>
                      <Typography variant="body2" fontWeight={700} color="success.dark">Você está com o melhor lance!</Typography>
                      <Typography variant="caption" color="success.main">Contagem iniciada, aguarde o resultado</Typography>
                    </Paper>
                    <Typography sx={{ fontSize: 72, fontWeight: 900, color: 'primary.main', fontVariantNumeric: 'tabular-nums', my: 1 }}>
                      {encerrandoCountdown}
                    </Typography>
                    <Typography fontWeight={700} color="text.secondary">{COUNTDOWN_LABELS[encerrandoCountdown] ?? '...'}</Typography>
                  </Stack>
                ) : encerrandoCountdown !== null && !isLeader ? (
                  <Box sx={{ p: 2 }}>
                    <Paper variant="outlined" sx={{ textAlign: 'center', px: 2, py: 1.5, mb: 1.5, bgcolor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.3)' }}>
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                        <BoltIcon sx={{ fontSize: 18, color: 'primary.dark' }} />
                        <Typography variant="body2" fontWeight={700} color="primary.dark">Leilão sendo encerrado!</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 40, fontWeight: 900, color: 'primary.main', fontVariantNumeric: 'tabular-nums', my: 0.5 }}>
                        {encerrandoCountdown}
                      </Typography>
                      <Typography variant="body2" fontWeight={700} color="text.secondary">{COUNTDOWN_LABELS[encerrandoCountdown] ?? '...'}</Typography>
                      <Typography variant="caption" color="primary.dark" fontWeight={500}>
                        Dê um lance para cancelar o encerramento!
                      </Typography>
                    </Paper>
                    {presetGrid}
                    {customInput}
                    {pendingConfirm}
                  </Box>
                ) : (
                  <Stack sx={{ flex: 1, justifyContent: 'flex-end', p: 2 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary"
                      sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                      Dê o seu lance
                    </Typography>
                    {presetGrid}
                    <Typography variant="caption" color="text.disabled" mb={1}>
                      Decremento mínimo: {brl(step)}
                    </Typography>
                    {customInput}
                    {pendingBid !== null ? pendingConfirm : bidFeedback && (
                      <Paper variant="outlined" sx={{
                        px: 1.5, py: 1,
                        bgcolor: bidFeedback.ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                        borderColor: bidFeedback.ok ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)',
                      }}>
                        <Typography variant="caption" fontWeight={600}
                          color={bidFeedback.ok ? 'success.dark' : 'error.main'}>
                          {bidFeedback.msg}
                        </Typography>
                      </Paper>
                    )}
                  </Stack>
                )}
              </Box>
            </Paper>
          </Box>
        </Box>

        {/* Painel unificado: Especificações + Últimos Lances + Descrição */}
        <Paper variant="outlined">
          {status?.especificacoes && (
            <>
              <Box sx={{ px: 3, py: 2.5 }}>
                <Typography fontWeight={700} variant="body2" sx={{ textTransform: 'uppercase', letterSpacing: 1.5, mb: 1.5 }}>
                  Especificações
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {status.especificacoes}
                </Typography>
              </Box>
              <Divider />
            </>
          )}

          <Box sx={{ px: 3, py: 2.5 }}>
            <Typography fontWeight={700} variant="body2" sx={{ textTransform: 'uppercase', letterSpacing: 1.5, mb: 1.5 }}>
              Últimos Lances
            </Typography>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.disabled" py={1}>
                Nenhum lance foi dado para este lote.
              </Typography>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: 11 }}>Nº do lance</TableCell>
                      <TableCell sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: 11 }}>Lance</TableCell>
                      <TableCell sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: 11 }}>Data</TableCell>
                      <TableCell sx={{ color: 'text.disabled', textTransform: 'uppercase', fontSize: 11 }}>Arrematante</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...history].reverse().map((bid, i) => (
                      <TableRow key={`${bid.timestamp}-${bid.transportadora_id}`}>
                        <TableCell sx={{ color: 'text.secondary' }}>{history.length - i}</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{brl(bid.valor)}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{formatDateTime(bid.timestamp)}</TableCell>
                        <TableCell sx={{ fontWeight: 500, color: bid.transportadora_id === userId ? 'primary.dark' : 'text.primary' }}>
                          {bid.transportadora_id}
                          {bid.transportadora_id === userId && (
                            <Typography component="span" variant="caption" color="primary.light" sx={{ ml: 0.5 }}>(você)</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </Box>

          {status?.descricao_carga && (
            <>
              <Divider />
              <Box sx={{ px: 3, py: 2.5 }}>
                <Typography fontWeight={700} variant="body2" sx={{ textTransform: 'uppercase', letterSpacing: 1.5, mb: 1.5 }}>
                  Descrição do Leilão
                </Typography>
                <Typography variant="body2" color="text.secondary">{status.descricao_carga}</Typography>
              </Box>
            </>
          )}
        </Paper>
      </Container>
    </Box>
  )
}
