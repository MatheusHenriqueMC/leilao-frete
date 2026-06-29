import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Button, Box, Stack, Typography, Divider,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import type { AuctionSummary } from '../types'

interface Props {
  leilao: AuctionSummary
  onClose: () => void
  onEnter: () => void
  isAdmin?: boolean
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AuctionPreviewModal({ leilao, onClose, onEnter, isAdmin }: Props) {
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
            {leilao.titulo}
          </Typography>
          {isAdmin && (
            <Typography variant="caption" color="text.disabled">
              Código:{' '}
              <Box component="strong" sx={{ color: 'primary.dark', fontFamily: 'monospace' }}>
                {leilao.join_code}
              </Box>
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {leilao.thumbnail && (
          <Box
            component="img"
            src={leilao.thumbnail}
            alt={leilao.titulo}
            sx={{
              width: '100%', height: 192, objectFit: 'contain',
              borderRadius: 2, border: '1px solid', borderColor: 'grey.100',
              bgcolor: 'grey.50', mb: 2,
            }}
          />
        )}

        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box sx={{ bgcolor: 'grey.50', borderRadius: 1.5, px: 2, py: 1.5 }}>
              <Typography variant="caption" color="text.disabled">Lance inicial</Typography>
              <Typography sx={{ fontWeight: 600 }} color="text.secondary">{brl(leilao.valor_inicial)}</Typography>
            </Box>
            <Box sx={{ bgcolor: 'rgba(249,115,22,0.08)', borderRadius: 1.5, px: 2, py: 1.5 }}>
              <Typography variant="caption" color="primary.light">Menor lance</Typography>
              <Typography sx={{ fontWeight: 700 }} color="primary.dark">{brl(leilao.menor_lance)}</Typography>
            </Box>
          </Box>

          {leilao.descricao && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
                  Descrição
                </Typography>
                <Typography
                  component="div" variant="body2" color="text.secondary"
                  sx={{ whiteSpace: 'pre-wrap', '& b, & strong': { fontWeight: 700 }, '& i, & em': { fontStyle: 'italic' } }}
                  dangerouslySetInnerHTML={{ __html: leilao.descricao }}
                />
              </Box>
            </>
          )}

          {leilao.especificacoes && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
                  Especificações
                </Typography>
                <Typography
                  component="div" variant="body2" color="text.secondary"
                  sx={{ whiteSpace: 'pre-wrap', '& b, & strong': { fontWeight: 700 }, '& i, & em': { fontStyle: 'italic' } }}
                  dangerouslySetInnerHTML={{ __html: leilao.especificacoes }}
                />
              </Box>
            </>
          )}

          <Divider />
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {leilao.total_lances} lance{leilao.total_lances !== 1 ? 's' : ''}
            </Typography>
            {leilao.tempo_restante_s > 0 && (
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'primary.dark' }}>
                <AccessTimeIcon sx={{ fontSize: 16 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {Math.floor(leilao.tempo_restante_s / 60)}m restantes
                </Typography>
              </Stack>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Fechar</Button>
        <Button onClick={onEnter} variant="contained">
          {isAdmin ? 'Gerenciar' : 'Entrar no leilão'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
