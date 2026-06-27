import { useEffect, useState } from 'react'
import { Box, Alert, AlertTitle, Slide, Typography } from '@mui/material'

export interface ToastItem {
  id: number
  type: 'warning' | 'info' | 'success'
  title: string
  lines?: string[]
}

interface Props {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [open, setOpen] = useState(true)

  function dismiss() {
    setOpen(false)
    setTimeout(() => onDismiss(item.id), 250)
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 7000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Slide direction="left" in={open} mountOnEnter unmountOnExit>
      <Alert
        severity={item.type}
        variant="filled"
        onClose={dismiss}
        sx={{ width: 320, boxShadow: 6 }}
      >
        <AlertTitle sx={{ fontWeight: 700, mb: item.lines?.length ? 0.5 : 0 }}>
          {item.title}
        </AlertTitle>
        {item.lines?.map((line, i) => (
          <Typography key={i} variant="caption" sx={{ display: 'block', lineHeight: 1.4 }}>
            {line}
          </Typography>
        ))}
      </Alert>
    </Slide>
  )
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <Box
      sx={{
        position: 'fixed', top: 16, right: 16, zIndex: 1400,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}
    >
      {toasts.map(t => (
        <Toast key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </Box>
  )
}
