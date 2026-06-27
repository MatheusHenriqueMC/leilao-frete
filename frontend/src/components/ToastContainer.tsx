import { useEffect, useState } from 'react'

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
  const [leaving, setLeaving] = useState(false)

  function dismiss() {
    setLeaving(true)
    setTimeout(() => onDismiss(item.id), 280)
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 7000)
    return () => clearTimeout(t)
  }, [])

  const colors: Record<ToastItem['type'], string> = {
    warning: 'bg-orange-500 border-orange-600',
    info:    'bg-blue-600  border-blue-700',
    success: 'bg-green-600 border-green-700',
  }
  const icons: Record<ToastItem['type'], string> = {
    warning: '⚠️',
    info:    'ℹ️',
    success: '✅',
  }

  return (
    <div className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border
                     text-white ${colors[item.type]} ${leaving ? 'toast-leave' : 'toast-enter'}`}>
      <span className="text-xl shrink-0 mt-0.5">{icons[item.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-snug">{item.title}</p>
        {item.lines?.map((line, i) => (
          <p key={i} className="text-xs text-white/85 mt-0.5 leading-snug">{line}</p>
        ))}
      </div>
      <button onClick={dismiss}
        className="text-white/70 hover:text-white text-xl leading-none shrink-0 ml-1">
        ×
      </button>
    </div>
  )
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
