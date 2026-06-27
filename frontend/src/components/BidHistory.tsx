import { useEffect, useRef, useState } from 'react'
import { Paper, Box, Stack, Typography } from '@mui/material'
import { keyframes } from '@mui/system'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import type { BidItem } from '../types'

interface Props {
  history: BidItem[]
  highlightId?: string
}

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function timeLabel(timestamp_ms: number) {
  return new Date(timestamp_ms).toLocaleTimeString('pt-BR')
}

const flash = keyframes`
  0%   { background-color: #bbf7d0; }
  60%  { background-color: #dcfce7; }
  100% { background-color: transparent; }
`

export default function BidHistory({ history, highlightId }: Props) {
  const sorted = [...history].reverse()
  const prevLengthRef = useRef(0)
  const [animatingKey, setAnimatingKey] = useState<string | null>(null)

  useEffect(() => {
    if (history.length > prevLengthRef.current && prevLengthRef.current > 0) {
      const newest = [...history].reverse()[0]
      if (newest) setAnimatingKey(`${newest.timestamp}-${newest.transportadora_id}`)
    }
    prevLengthRef.current = history.length
  }, [history])

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography fontWeight={600}>Histórico de Lances</Typography>
        <Typography variant="caption" color="text.disabled">
          {history.length} lance{history.length !== 1 ? 's' : ''}
        </Typography>
      </Stack>

      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.disabled" textAlign="center" py={4}>
          Nenhum lance registrado ainda.
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ maxHeight: 288, overflowY: 'auto', pr: 0.5 }}>
          {sorted.map((bid, i) => {
            const key = `${bid.timestamp}-${bid.transportadora_id}`
            const isMe = bid.transportadora_id === highlightId
            const isWinner = i === 0
            const isNew = key === animatingKey

            return (
              <Stack
                key={key}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                onAnimationEnd={() => setAnimatingKey(null)}
                sx={{
                  px: 1.5, py: 1, borderRadius: 1.5,
                  bgcolor: isMe ? 'rgba(249,115,22,0.08)' : 'grey.50',
                  border: isMe ? '1px solid rgba(249,115,22,0.2)' : '1px solid transparent',
                  animation: isNew ? `${flash} 1.4s ease-out` : undefined,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                  {isWinner && <EmojiEventsIcon sx={{ fontSize: 16, color: 'primary.main' }} />}
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    noWrap
                    color={isMe ? 'primary.dark' : 'text.primary'}
                  >
                    {bid.transportadora_id}
                    {isMe && (
                      <Typography component="span" variant="caption" color="primary.light" sx={{ ml: 0.5 }}>
                        (você)
                      </Typography>
                    )}
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0, ml: 1 }}>
                  <Typography variant="body2" fontWeight={700} color="primary.dark">
                    {brl(bid.valor)}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {timeLabel(bid.timestamp)}
                  </Typography>
                </Stack>
              </Stack>
            )
          })}
        </Stack>
      )}
    </Paper>
  )
}
