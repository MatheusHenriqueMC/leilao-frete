import { useEffect, useRef, useState, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  AuctionStatus, BidItem, BidResponse, AuctionUpdate, CloseResponse,
  LoginResponse, AuctionSummary, AuctionDetail, CreateAuctionResult,
  ResolveCodeResult, CreateCarrierResult,
} from '../types'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? 'http://localhost:5000'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected]     = useState(false)

  // Auction room state
  const [status, setStatus]           = useState<AuctionStatus | null>(null)
  const [history, setHistory]         = useState<BidItem[]>([])
  const [lastBidResponse, setLastBidResponse] = useState<BidResponse | null>(null)
  const [lastUpdate, setLastUpdate]   = useState<AuctionUpdate | null>(null)
  const [closeResponse, setCloseResponse] = useState<CloseResponse | null>(null)

  // Auth / listings
  const [loginResponse, setLoginResponse]         = useState<LoginResponse | null>(null)
  const [createResult, setCreateResult]           = useState<CreateAuctionResult | null>(null)
  const [auctionsList, setAuctionsList]           = useState<AuctionSummary[]>([])
  const [auctionDetail, setAuctionDetail]         = useState<AuctionDetail | null>(null)
  const [carrierHistory, setCarrierHistory]       = useState<AuctionSummary[]>([])
  const [resolveCodeResult, setResolveCodeResult] = useState<ResolveCodeResult | null>(null)
  const [createCarrierResult, setCreateCarrierResult] = useState<CreateCarrierResult | null>(null)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Usar polling garante compatibilidade com o servidor Flask/Werkzeug.
    // Para um leilão com poucos usuários, long-polling tem latência < 1s — suficiente.
    const socket = io(GATEWAY_URL, { transports: ['polling'] })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('login_response',          (d: LoginResponse)       => setLoginResponse(d))
    socket.on('create_auction_response', (d: CreateAuctionResult) => setCreateResult(d))
    socket.on('list_auctions_response',  (d: { leiloes: AuctionSummary[] }) => setAuctionsList(d.leiloes))
    socket.on('auction_detail_response', (d: AuctionDetail)       => setAuctionDetail(d))
    socket.on('carrier_history_response',(d: { leiloes: AuctionSummary[] }) => setCarrierHistory(d.leiloes))
    socket.on('resolve_code_response',   (d: ResolveCodeResult)    => setResolveCodeResult(d))
    socket.on('create_carrier_response', (d: CreateCarrierResult)  => setCreateCarrierResult(d))

    socket.on('status_response',  (d: AuctionStatus) => setStatus(d))
    socket.on('history_response', (d: { lances: BidItem[] }) => setHistory(d.lances))
    socket.on('bid_response',     (d: BidResponse)   => setLastBidResponse(d))
    socket.on('close_response',   (d: CloseResponse) => setCloseResponse(d))

    socket.on('auction_update', (d: AuctionUpdate) => {
      setLastUpdate(d)
      setStatus(prev => prev && prev.leilao_id === d.leilao_id
        ? {
            ...prev,
            menor_lance:          d.menor_lance,
            transportadora_lider: d.transportadora_lider,
            timestamp:            d.timestamp,
            encerrado:            d.encerrado,
            tempo_restante_s:     d.tempo_restante_s,
            total_lances:         d.encerrado ? prev.total_lances : prev.total_lances + 1,
          }
        : prev
      )
      socket.emit('status',  { leilao_id: d.leilao_id })
      socket.emit('history', { leilao_id: d.leilao_id })
    })

    socket.on('error', (d: { mensagem: string }) => setError(d.mensagem))

    return () => { socket.disconnect() }
  }, [])

  // ── Métodos ──────────────────────────────────────────────────────────────────

  const login = useCallback((username: string, password: string) => {
    socketRef.current?.emit('login', { username, password })
  }, [])

  const createAuction = useCallback((data: {
    titulo: string; descricao: string; especificacoes: string
    valor_inicial: number; tempo_segundos: number
  }) => {
    socketRef.current?.emit('create_auction', data)
  }, [])

  const joinAuction = useCallback((leilao_id: number, transportadora_id: string) => {
    socketRef.current?.emit('join_auction', { leilao_id, transportadora_id })
  }, [])

  const placeBid = useCallback((leilao_id: number, transportadora_id: string, valor: number) => {
    socketRef.current?.emit('bid', { leilao_id, transportadora_id, valor })
  }, [])

  const requestStatus = useCallback((leilao_id: number) => {
    socketRef.current?.emit('status', { leilao_id })
  }, [])

  const requestHistory = useCallback((leilao_id: number) => {
    socketRef.current?.emit('history', { leilao_id })
  }, [])

  const closeAuction = useCallback((leilao_id: number, admin_id: string) => {
    socketRef.current?.emit('close_auction', { leilao_id, admin_id })
  }, [])

  const listAuctions = useCallback((apenas_ativos: boolean) => {
    socketRef.current?.emit('list_auctions', { apenas_ativos })
  }, [])

  const fetchAuctionDetail = useCallback((leilao_id: number) => {
    socketRef.current?.emit('auction_detail', { leilao_id })
  }, [])

  const fetchCarrierHistory = useCallback((transportadora_id: string) => {
    socketRef.current?.emit('carrier_history', { transportadora_id })
  }, [])

  const resolveCode = useCallback((join_code: string) => {
    socketRef.current?.emit('resolve_code', { join_code })
  }, [])

  const createCarrier = useCallback((username: string, password: string) => {
    socketRef.current?.emit('create_carrier', { username, password })
  }, [])

  const clearError         = useCallback(() => setError(null), [])
  const clearCreate        = useCallback(() => setCreateResult(null), [])
  const clearCreateCarrier = useCallback(() => setCreateCarrierResult(null), [])

  return {
    connected,
    // auction room
    status, history, lastBidResponse, lastUpdate, closeResponse,
    // auth / listings
    loginResponse, createResult, auctionsList, auctionDetail,
    carrierHistory, resolveCodeResult,
    error,
    createCarrierResult,
    // actions
    login, createAuction, createCarrier, joinAuction, placeBid,
    requestStatus, requestHistory, closeAuction,
    listAuctions, fetchAuctionDetail, fetchCarrierHistory, resolveCode,
    clearError, clearCreate, clearCreateCarrier,
  }
}
