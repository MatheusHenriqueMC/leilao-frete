import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppBar, Toolbar, Container, Box, Stack, Typography, Chip, Button, IconButton, Paper,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
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

export default function AdminPage() {
  const { id } = useParams()
  const leilaoId = parseInt(id ?? '0')
  const navigate = useNavigate()

  const userId = sessionStorage.getItem('userId')
  const role   = sessionStorage.getItem('userRole')

  const {
    connected, status, history, closeResponse, lastUpdate, countdownEvent, error,
    joinAuction, requestStatus, requestHistory, closeAuction,
    startCountdown, cancelCountdown, clearError,
  } = useSocket()

  const [joined, setJoined]         = useState(false)
  const [closing, setClosing]       = useState(false)
  const [countdown, setCountdown]   = useState<number | null>(null)
  const [copiado, setCopiado]       = useState(false)
  const [tempoRestante, setTempoRestante] = useState(0)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerCountRef  = useRef<ReturnType<typeof setInterval> | null>(null)

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

  useEffect(() => {
    if (!countdownEvent || countdownEvent.leilao_id !== leilaoId) return
    if (countdownEvent.active) {
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
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setClosing(false)
      setCountdown(null)
    }
  }, [countdownEvent, leilaoId, closeAuction, userId])

  const closingRef = useRef(false)
  useEffect(() => { closingRef.current = closing }, [closing])

  useEffect(() => {
    if (!lastUpdate || lastUpdate.leilao_id !== leilaoId) return
    if (!closingRef.current) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    cancelCountdown(leilaoId)
    setClosing(false)
    setCountdown(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdate, leilaoId, cancelCountdown])

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
    startCountdown(leilaoId)
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="sm">
          <Toolbar disableGutters sx={{ gap: 1.5 }}>
            <IconButton size="small" onClick={() => navigate('/admin')}><ArrowBackIcon /></IconButton>
            <Logo height={48} />
            <Chip label="Admin" size="small" color="primary" variant="outlined" />
            <Box flexGrow={1} />
            {status?.join_code && (
              <Button
                size="small" variant="outlined" onClick={handleCopiar}
                endIcon={copiado ? <CheckIcon /> : <ContentCopyIcon />}
                sx={{ fontFamily: 'monospace', fontWeight: 700 }}
              >
                {status.join_code}
              </Button>
            )}
            <Button color="inherit" onClick={() => { sessionStorage.clear(); navigate('/') }}>Sair</Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Stack spacing={2}>
          {vencedor && (
            <Paper sx={{ background: 'linear-gradient(90deg, #16a34a, #15803d)', color: 'white', p: 3, textAlign: 'center', border: 'none' }}>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} mb={0.5}>
                <CheckCircleIcon />
                <Typography variant="h6" fontWeight={700}>Leilão Encerrado!</Typography>
              </Stack>
              {vencedor.id ? (
                <>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Vencedor: <strong>{vencedor.id}</strong>
                  </Typography>
                  <Typography variant="h5" fontWeight={700} mt={1}>{brl(vencedor.valor)}</Typography>
                </>
              ) : (
                <Typography variant="body2" sx={{ opacity: 0.9 }}>Nenhum lance registrado.</Typography>
              )}
            </Paper>
          )}

          {error && <AlertBanner message={error} type="error" onDismiss={clearError} />}

          {status?.tempo_total_s != null && status.tempo_total_s > 0 && (
            <Paper variant="outlined" sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Tempo restante</Typography>
              <Typography
                fontFamily="monospace" fontWeight={700}
                color={isAuctionClosed ? 'error.main' : tempoRestante < 30 ? 'error.main' : 'text.primary'}
              >
                {isAuctionClosed ? 'Encerrado' : formatCountdown(tempoRestante)}
              </Typography>
            </Paper>
          )}

          {status?.especificacoes && (
            <Paper variant="outlined" sx={{ px: 2.5, py: 2 }}>
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
                Especificações
              </Typography>
              <Typography variant="body2" color="text.secondary">{status.especificacoes}</Typography>
            </Paper>
          )}

          <StatusPanel status={status} connected={connected} />

          {!isAuctionClosed && (
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography fontWeight={600}>Encerrar Leilão</Typography>
              <Typography variant="body2" color="text.secondary" mb={2.5}>
                Ao encerrar, todos os participantes são notificados imediatamente.
              </Typography>
              {closing && countdown !== null ? (
                <Box textAlign="center" py={2}>
                  <Typography sx={{ fontSize: 56, fontWeight: 900, color: 'primary.main', fontVariantNumeric: 'tabular-nums' }}>
                    {countdown}
                  </Typography>
                  <Typography variant="body2" fontWeight={500} color="text.secondary">
                    {COUNTDOWN_LABELS[countdown] ?? '...'}
                  </Typography>
                </Box>
              ) : (
                <Button variant="contained" color="error" disabled={!connected} onClick={handleCloseClick}>
                  Encerrar Leilão
                </Button>
              )}
            </Paper>
          )}

          <BidHistory history={history} />
        </Stack>
      </Container>
    </Box>
  )
}
