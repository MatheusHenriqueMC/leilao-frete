import { useState } from 'react'
import {
  Dialog, DialogTitle, IconButton, Box, Stack, Typography,
  Chip, Divider, ListItemButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import type { AuctionSummary, BidItem } from '../types'

interface Props {
  titulo: string
  leiloes: AuctionSummary[]
  onClose: () => void
  onFetchDetail: (leilao_id: number) => void
  detail: { leilao: AuctionSummary; lances: BidItem[] } | null
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

export default function AuctionHistoryModal({ titulo, leiloes, onClose, onFetchDetail, detail }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  function handleSelect(id: number) {
    setSelectedId(id)
    onFetchDetail(id)
  }

  const detailForSelected = detail?.leilao?.id === selectedId ? detail : null

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { height: '85vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {titulo}
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <Divider />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Lista */}
        <Box sx={{ width: 288, borderRight: '1px solid', borderColor: 'divider', overflowY: 'auto' }}>
          {leiloes.length === 0 ? (
            <Typography variant="body2" color="text.disabled" textAlign="center" py={5}>
              Nenhum leilão encontrado.
            </Typography>
          ) : (
            <Stack sx={{ p: 1 }} spacing={0.5}>
              {leiloes.map(l => (
                <ListItemButton
                  key={l.id}
                  selected={selectedId === l.id}
                  onClick={() => handleSelect(l.id)}
                  sx={{ borderRadius: 1.5, flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <Typography variant="body2" fontWeight={500} noWrap sx={{ width: '100%' }}>
                    {l.titulo}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">{fmtDate(l.created_at)}</Typography>
                  <Stack direction="row" alignItems="center" spacing={1} mt={0.5}>
                    <Chip
                      size="small"
                      label={l.encerrado ? 'Encerrado' : 'Ativo'}
                      color={l.encerrado ? 'error' : 'success'}
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.disabled">
                      {l.total_lances} lance{l.total_lances !== 1 ? 's' : ''}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </Stack>
          )}
        </Box>

        {/* Detalhe */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          {!selectedId ? (
            <Typography variant="body2" color="text.disabled" textAlign="center" pt={5}>
              Selecione um leilão para ver os detalhes.
            </Typography>
          ) : !detailForSelected ? (
            <Typography variant="body2" color="text.disabled" textAlign="center" pt={5}>
              Carregando...
            </Typography>
          ) : (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h6">{detailForSelected.leilao.titulo}</Typography>
                {detailForSelected.leilao.descricao && (
                  <Typography
                    component="div" variant="body2" color="text.secondary"
                    sx={{ whiteSpace: 'pre-wrap', '& b, & strong': { fontWeight: 700 }, '& i, & em': { fontStyle: 'italic' } }}
                    dangerouslySetInnerHTML={{ __html: detailForSelected.leilao.descricao }}
                  />
                )}
              </Box>

              {detailForSelected.leilao.especificacoes && (
                <Box sx={{ bgcolor: 'grey.50', borderRadius: 1.5, p: 1.5 }}>
                  <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
                    Especificações
                  </Typography>
                  <Typography
                    component="div" variant="body2" color="text.secondary"
                    sx={{ whiteSpace: 'pre-wrap', '& b, & strong': { fontWeight: 700 }, '& i, & em': { fontStyle: 'italic' } }}
                    dangerouslySetInnerHTML={{ __html: detailForSelected.leilao.especificacoes }}
                  />
                </Box>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box sx={{ bgcolor: 'grey.50', borderRadius: 1.5, p: 1.5 }}>
                  <Typography variant="caption" color="text.disabled">Valor inicial</Typography>
                  <Typography fontWeight={600} color="text.secondary">
                    {brl(detailForSelected.leilao.valor_inicial)}
                  </Typography>
                </Box>
                {detailForSelected.leilao.encerrado && detailForSelected.leilao.valor_final > 0 ? (
                  <Box sx={{ bgcolor: 'rgba(249,115,22,0.08)', borderRadius: 1.5, p: 1.5 }}>
                    <Typography variant="caption" color="primary.light">Valor final</Typography>
                    <Typography fontWeight={700} color="primary.dark">
                      {brl(detailForSelected.leilao.valor_final)}
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ bgcolor: 'grey.50', borderRadius: 1.5, p: 1.5 }}>
                    <Typography variant="caption" color="text.disabled">Menor lance</Typography>
                    <Typography fontWeight={600} color="text.secondary">
                      {brl(detailForSelected.leilao.menor_lance)}
                    </Typography>
                  </Box>
                )}
              </Box>

              {detailForSelected.leilao.encerrado && detailForSelected.leilao.vencedor_id && (
                <Box sx={{
                  bgcolor: 'rgba(22,163,74,0.08)', border: '1px solid', borderColor: 'rgba(22,163,74,0.2)',
                  borderRadius: 1.5, p: 2, textAlign: 'center',
                }}>
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} mb={0.5}>
                    <EmojiEventsIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="caption" color="success.main">Vencedor</Typography>
                  </Stack>
                  <Typography variant="h6" color="success.dark" fontWeight={700}>
                    {detailForSelected.leilao.vencedor_id}
                  </Typography>
                  <Typography color="success.main" fontWeight={600}>
                    {brl(detailForSelected.leilao.valor_final)}
                  </Typography>
                </Box>
              )}

              {detailForSelected.lances.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
                    Lances ({detailForSelected.lances.length})
                  </Typography>
                  <Stack spacing={0.5} sx={{ maxHeight: 192, overflowY: 'auto', mt: 1 }}>
                    {[...detailForSelected.lances].reverse().map((b, i) => (
                      <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                        sx={{ bgcolor: 'grey.50', px: 1.5, py: 0.75, borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">{b.transportadora_id}</Typography>
                        <Typography variant="body2" fontWeight={700} color="primary.dark">{brl(b.valor)}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.disabled" display="block">
                  Criado: {fmtDate(detailForSelected.leilao.created_at)}
                </Typography>
                {detailForSelected.leilao.ended_at && (
                  <Typography variant="caption" color="text.disabled" display="block">
                    Encerrado: {fmtDate(detailForSelected.leilao.ended_at)}
                  </Typography>
                )}
              </Box>
            </Stack>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}
