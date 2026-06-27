import { Paper, Box, Stack, Typography, Chip, Skeleton } from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import type { AuctionStatus } from '../types'

interface Props {
  status: AuctionStatus | null
  connected: boolean
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function StatusPanel({ status, connected }: Props) {
  if (!status) {
    if (!connected) {
      return (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <CloudOffIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" fontWeight={600} color="text.secondary">
            Servidor não conectado
          </Typography>
          <Typography variant="caption" color="text.disabled">
            Verifique se o gateway está rodando em localhost:5000
          </Typography>
        </Paper>
      )
    }
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Skeleton width="33%" height={20} sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[...Array(4)].map((_, i) => (
            <Box key={i}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="75%" height={28} />
            </Box>
          ))}
        </Box>
      </Paper>
    )
  }

  const statusColor = status.encerrado ? 'error' : connected ? 'success' : 'warning'
  const statusLabel = status.encerrado ? 'Encerrado' : connected ? 'Ao vivo' : 'Conectando...'

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
        <Typography fontWeight={600}>Status do Leilão</Typography>
        <Chip size="small" color={statusColor} label={statusLabel} variant="outlined" />
      </Stack>

      <Typography variant="body2" color="text.secondary" mb={3}>
        {status.descricao_carga}
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 3, rowGap: 2 }}>
        <Box>
          <Typography variant="caption" color="text.disabled">Valor inicial</Typography>
          <Typography variant="subtitle1" fontWeight={600} color="text.secondary">
            {brl(status.valor_inicial)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.disabled">Menor lance</Typography>
          <Typography variant="h5" fontWeight={700} color="primary.dark">
            {brl(status.menor_lance)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.disabled">Líder atual</Typography>
          <Typography variant="body2" fontWeight={500} noWrap>
            {status.transportadora_lider || '—'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.disabled">Total de lances</Typography>
          <Typography variant="body2" fontWeight={500}>{status.total_lances}</Typography>
        </Box>
      </Box>
    </Paper>
  )
}
