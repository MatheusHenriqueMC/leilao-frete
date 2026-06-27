interface Props {
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
  onDismiss?: () => void
}

const styles: Record<Props['type'], string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
}

export default function AlertBanner({ message, type, onDismiss }: Props) {
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-center justify-between gap-3 ${styles[type]}`}>
      <p className="text-sm font-medium">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="opacity-50 hover:opacity-100 transition-opacity text-xl leading-none shrink-0"
          aria-label="Fechar"
        >
          ×
        </button>
      )}
    </div>
  )
}
