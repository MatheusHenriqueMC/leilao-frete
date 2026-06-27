import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Container, Box, Stack, Typography, Chip, Button,
  Card, CardActionArea, CardContent, IconButton, Tooltip,
} from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import HistoryIcon from '@mui/icons-material/History'
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import GavelIcon from '@mui/icons-material/Gavel'
import VisibilityIcon from '@mui/icons-material/Visibility'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import { useSocket } from '../hooks/useSocket'
import CreateAuctionModal  from '../components/CreateAuctionModal'
import AuctionHistoryModal  from '../components/AuctionHistoryModal'
import CreateCarrierModal   from '../components/CreateCarrierModal'
import AuctionPreviewModal  from '../components/AuctionPreviewModal'
import Logo from '../components/Logo'
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

interface ActionCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  primary?: boolean
}

function ActionCard({ icon, title, subtitle, onClick, primary }: ActionCardProps) {
  return (
    <Card sx={primary ? { bgcolor: 'primary.main', color: 'primary.contrastText', border: 'none' } : undefined}>
      <CardActionArea onClick={onClick} sx={{ p: 2.5 }}>
        {icon}
        <Typography fontWeight={700} mt={1}>{title}</Typography>
        <Typography variant="caption" sx={{ opacity: primary ? 0.85 : 0.6 }}>{subtitle}</Typography>
      </CardActionArea>
    </Card>
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ gap: 2 }}>
            <Logo height={52} />
            <Chip label="Admin" size="small" color="primary" variant="outlined" />
            <Box flexGrow={1} />
            <Typography variant="body2" color="text.secondary">{userId}</Typography>
            <Button color="inherit" onClick={() => { sessionStorage.clear(); navigate('/') }}>Sair</Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 5 }}>
          <ActionCard
            primary
            icon={<AddCircleOutlineIcon fontSize="large" />}
            title="Criar leilão" subtitle="Novo leilão reverso"
            onClick={() => { clearCreate(); setShowCreate(true) }}
          />
          <ActionCard
            icon={<HistoryIcon fontSize="large" color="action" />}
            title="Histórico" subtitle="Leilões realizados"
            onClick={openHistory}
          />
          <ActionCard
            icon={<PersonAddAltIcon fontSize="large" color="action" />}
            title="Nova transportadora" subtitle="Criar conta de acesso"
            onClick={() => { clearCreateCarrier(); setShowCarrier(true) }}
          />
        </Box>

        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography fontWeight={600}>Leilões Ativos</Typography>
          <Button size="small" onClick={() => listAuctions(true)}>Atualizar</Button>
        </Stack>

        {ativos.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <Typography color="text.secondary">Nenhum leilão ativo no momento.</Typography>
              <Typography variant="body2" color="text.disabled">Crie um novo leilão para começar.</Typography>
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

                <Stack alignItems="center" spacing={0.5}
                  sx={{ px: 1.5, py: 1, borderTop: '1px solid', borderColor: 'divider', flexGrow: 1, justifyContent: 'center' }}>
                  <Typography variant="body2" fontWeight={700} color="primary.dark" textAlign="center"
                    sx={{ textTransform: 'uppercase', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {l.titulo}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    Código:{' '}
                    <Box component="strong" sx={{ color: 'primary.dark', fontFamily: 'monospace' }}>{l.join_code}</Box>
                  </Typography>
                </Stack>

                {l.tempo_restante_s > 0 && (
                  <Box sx={{ px: 1.5, pb: 1, display: 'flex', justifyContent: 'center' }}>
                    <TimerBadge segundos={l.tempo_restante_s} />
                  </Box>
                )}

                <Stack direction="row" justifyContent="center" spacing={2}
                  sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.5, py: 1.5 }}>
                  <Tooltip title="Gerenciar leilão">
                    <IconButton color="primary" onClick={() => navigate(`/admin/leilao/${l.id}`)}
                      sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }}>
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
    </Box>
  )
}
