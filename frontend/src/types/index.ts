export type UserRole = 'admin' | 'transportadora'

export interface LoginResponse {
  sucesso: boolean
  role: UserRole
  mensagem: string
  userId: string
}

export interface AuctionSummary {
  id: number
  titulo: string
  descricao: string
  especificacoes: string
  join_code: string
  valor_inicial: number
  menor_lance: number
  transportadora_lider: string
  encerrado: boolean
  total_lances: number
  tempo_restante_s: number
  tempo_total_s: number
  created_at: string
  ended_at: string
  vencedor_id: string
  valor_final: number
  thumbnail: string
}

export interface AuctionDetail {
  leilao: AuctionSummary
  lances: BidItem[]
  imagens: string[]
}

export interface CreateCarrierResult {
  sucesso: boolean
  mensagem: string
}

export interface CarrierInfo {
  encontrado: boolean
  username: string
  cnpj: string
  email: string
  telefone: string
}

export interface CreateAuctionResult {
  sucesso: boolean
  leilao_id: number
  join_code: string
  mensagem: string
}

export interface ResolveCodeResult {
  encontrado: boolean
  leilao_id: number
  titulo: string
  mensagem: string
}

export interface AuctionStatus {
  leilao_id: number
  titulo: string
  descricao_carga: string
  especificacoes: string
  valor_inicial: number
  menor_lance: number
  transportadora_lider: string
  timestamp: number
  total_lances: number
  encerrado: boolean
  tempo_restante_s: number
  tempo_total_s: number
  join_code: string
}

export interface BidItem {
  valor: number
  transportadora_id: string
  timestamp: number
}

export interface BidResponse {
  aceito: boolean
  menor_lance_atual: number
  mensagem: string
  leilao_id: number
}

export interface AuctionUpdate {
  leilao_id: number
  menor_lance: number
  transportadora_lider: string
  timestamp: number
  encerrado: boolean
  mensagem: string
  tempo_restante_s: number
}

export interface CloseResponse {
  sucesso: boolean
  mensagem: string
  vencedor_id: string
  valor_final: number
  total_lances: number
  leilao_id: number
}
