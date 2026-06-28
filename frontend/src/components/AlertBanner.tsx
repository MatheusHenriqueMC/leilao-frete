import Alert from '@mui/material/Alert'

interface Props {
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  onDismiss?: () => void
}

export default function AlertBanner({ message, type, onDismiss }: Props) {
  return (
    <Alert severity={type} onClose={onDismiss} variant="outlined">
      {message}
    </Alert>
  )
}
