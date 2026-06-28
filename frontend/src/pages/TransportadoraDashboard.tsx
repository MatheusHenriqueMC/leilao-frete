import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Container, Box, Stack, Typography, Chip, Button,
  Card, CardContent, TextField, IconButton, Tooltip,
} from '@mui/material'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import GavelIcon from '@mui/icons-material/Gavel'
import VisibilityIcon from '@mui/icons-material/Visibility'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { useSocket } from '../hooks/useSocket'
import AuctionHistoryModal  from '../components/AuctionHistoryModal'
import AuctionPreviewModal  from '../components/AuctionPreviewModal'
import Logo           from '../components/Logo'
import ToastContainer from '../components/ToastContainer'
import { useLeadershipNotifications } from '../hooks/useLeadershipNotifications'
import type { AuctionSummary } from '../types'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (s <= 0) return null
  const m = Math.floor(s / 60), sec = s % 60
  return (
    <Chip
      size="small"
      color={s < 30 ? 'error' : 'primary'}
      variant="outlined"
      icon={<AccessTimeIcon />}
      label={`${m > 0 ? `${m}m ` : ''}${sec}s`}
      sx={{ fontFamily: 'monospace' }}
    />
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

  useEffect(() => {
    if (!connected || !userId) return
    auctionsList
      .filter(l => !l.encerrado && l.transportadora_lider === userId)
      .forEach(l => joinAuction(l.id, userId))
  }, [auctionsList, connected, userId, joinAuction])

  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => listAuctions(true), 15000)
    return () => clearInterval(id)
  }, [connected, listAuctions])

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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ gap: 2 }}>
            <Logo height={52} />
            <Box flexGrow={1} />
            <Chip
              icon={<LocalShippingIcon />}
              label={userId}
              size="small"
              color="primary"
              variant="outlined"
            />
            <Button color="primary" onClick={() => setShowHistory(true)}>Meu histórico</Button>
            <Button color="inherit" onClick={() => { sessionStorage.clear(); navigate('/') }}>Sair</Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Typography fontWeight={600}>Entrar por Código</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Não está achando o leilão que procura? Utilize o código e vá direto para ele.
            </Typography>
            <Stack direction="row" spacing={1} component="form" onSubmit={handleCode}>
              <TextField
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setCodeErro('') }}
                placeholder="ex: F3T8KZ"
                inputProps={{ maxLength: 6, style: { fontFamily: 'monospace', letterSpacing: 4, textTransform: 'uppercase' } }}
                error={!!codeErro}
                helperText={codeErro}
                fullWidth size="small"
              />
              <Box>
                <Button type="submit" variant="contained" disabled={loadingCode || !code.trim()} sx={{ height: 40 }}>
                  {loadingCode ? '...' : 'Entrar'}
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography fontWeight={600}>Leilões Ativos</Typography>
          <Button size="small" onClick={() => listAuctions(true)}>Atualizar</Button>
        </Stack>

        {ativos.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <Typography color="text.secondary">Nenhum leilão ativo no momento.</Typography>
            </CardContent>
          </Card>
        ) : (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            gap: 3,
          }}>
            {ativos.map(l => (
              <Card key={l.id} sx={{ display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between"
                  sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
                  <Typography variant="caption" color="text.secondary">{fmtDate(l.created_at)}</Typography>
                  <Typography variant="caption" fontWeight={600}>{fmtTime(l.created_at)}</Typography>
                </Stack>

                <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {l.thumbnail ? (
                    <Box component="img" src={l.thumbnail} alt={l.titulo}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <LocalShippingIcon sx={{ fontSize: 64, color: 'grey.300' }} />
                  )}
                </Box>

                <Stack alignItems="center"
                  sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider', flexGrow: 1, justifyContent: 'center' }}>
                  <Typography variant="body2" fontWeight={700} color="primary.dark" textAlign="center"
                    sx={{ textTransform: 'uppercase', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {l.titulo}
                  </Typography>
                </Stack>

                {l.tempo_restante_s > 0 && (
                  <Box sx={{ px: 1.5, pb: 1, display: 'flex', justifyContent: 'center' }}>
                    <TimerBadge segundos={l.tempo_restante_s} />
                  </Box>
                )}

                <Stack direction="row" justifyContent="center" spacing={2}
                  sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.5, py: 1.5 }}>
                  <Tooltip title="Entrar no leilão">
                    <IconButton color="success" onClick={() => navigate(`/leilao/${l.id}`)}
                      sx={{ bgcolor: 'success.main', color: 'common.white', '&:hover': { bgcolor: 'success.dark' } }}>
                      <GavelIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Ver detalhes">
                    <IconButton onClick={e => { e.stopPropagation(); setPreview(l) }}
                      sx={{ bgcolor: 'grey.400', color: 'common.white', '&:hover': { bgcolor: 'grey.500' } }}>
                      <VisibilityIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Card>
            ))}
          </Box>
        )}
      </Container>

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
    </Box>
  )
}
