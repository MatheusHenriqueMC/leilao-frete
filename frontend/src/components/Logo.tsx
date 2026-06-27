interface Props {
  height?: number
  className?: string
}

export default function Logo({ height = 40, className = '' }: Props) {
  return (
    <img
      src="/logo.png"
      alt="DJMC Leilões - Transportes & Logística"
      style={{ height: `${height}px`, width: 'auto', objectFit: 'contain' }}
      className={className}
      onError={e => {
        // Fallback enquanto logo.png não estiver na pasta public
        (e.target as HTMLImageElement).style.display = 'none'
      }}
    />
  )
}
