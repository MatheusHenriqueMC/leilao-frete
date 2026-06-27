import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuctionUpdate, AuctionStatus } from '../types'
import type { ToastItem } from '../components/ToastContainer'

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function playAlert() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    // Três bipes curtos
    ;[0, 0.22, 0.44].forEach(delay => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.35, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.18)
    })
  } catch {
    // AudioContext indisponível — sem som
  }
}

export interface SeedAuction {
  id: number
  transportadora_lider: string
  titulo: string
}

/**
 * Detecta perda de liderança e dispara toast + som.
 *
 * seedAuctions: lista de leilões ativos usada para pré-popular o estado
 *               de liderança (necessário no dashboard, onde o usuário ainda
 *               não recebeu um auction_update desde que montou a página).
 */
export function useLeadershipNotifications(
  userId: string | null,
  lastUpdate: AuctionUpdate | null,
  status?: AuctionStatus | null,
  seedAuctions?: SeedAuction[],
) {
  const [toasts, setToasts]       = useState<ToastItem[]>([])
  const idRef                     = useRef(0)
  const leadingAuctions           = useRef<Set<number>>(new Set())
  const auctionTitles             = useRef<Map<number, string>>(new Map())

  // Seed a partir do status da AuctionPage (quem é líder ao entrar na sala)
  useEffect(() => {
    if (!status || !userId) return
    auctionTitles.current.set(status.leilao_id, status.titulo)
    if (status.transportadora_lider === userId) {
      leadingAuctions.current.add(status.leilao_id)
    }
  }, [status?.leilao_id, status?.transportadora_lider, userId])

  // Seed a partir da lista de leilões ativos (dashboard)
  useEffect(() => {
    if (!userId || !seedAuctions) return
    seedAuctions.forEach(l => {
      auctionTitles.current.set(l.id, l.titulo)
      if (l.transportadora_lider === userId) {
        leadingAuctions.current.add(l.id)
      } else {
        leadingAuctions.current.delete(l.id)
      }
    })
  }, [seedAuctions, userId])

  const addToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, ...item }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Detecta mudança de liderança
  useEffect(() => {
    if (!lastUpdate || !userId || lastUpdate.encerrado) return

    const { leilao_id, transportadora_lider, menor_lance } = lastUpdate
    const isLeaderNow = transportadora_lider === userId
    const wasLeader   = leadingAuctions.current.has(leilao_id)

    if (wasLeader && !isLeaderNow) {
      const titulo = auctionTitles.current.get(leilao_id) ?? `Leilão #${leilao_id}`
      playAlert()
      addToast({
        type:  'warning',
        title: 'Você perdeu a liderança em um leilão!',
        lines: [
          titulo,
          `${transportadora_lider} deu um lance de ${brl(menor_lance)}`,
        ],
      })
    }

    if (isLeaderNow) {
      leadingAuctions.current.add(leilao_id)
    } else {
      leadingAuctions.current.delete(leilao_id)
    }
  }, [lastUpdate, userId, addToast])

  return { toasts, dismissToast }
}
