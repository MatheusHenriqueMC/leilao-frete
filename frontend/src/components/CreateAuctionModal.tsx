import { useState, useRef, type FormEvent, useEffect } from 'react'
import type { CreateAuctionResult } from '../types'

interface Props {
  onClose: () => void
  onCreate: (data: {
    titulo: string; descricao: string; especificacoes: string
    valor_inicial: number; tempo_segundos: number; imagens: string[]
  }) => void
  result: CreateAuctionResult | null
  onClearResult: () => void
}

/** Comprime imagem para base64 (max 800px, quality 0.75) */
function comprimirImagem(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 800
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    img.src = url
  })
}

export default function CreateAuctionModal({ onClose, onCreate, result, onClearResult }: Props) {
  const [titulo, setTitulo]                 = useState('')
  const [descricao, setDescricao]           = useState('')
  const [especificacoes, setEspecificacoes] = useState('')
  const [valorInicial, setValorInicial]     = useState('')
  const [tempoSegundos, setTempoSegundos]   = useState('')
  const [imagens, setImagens]               = useState<string[]>([])
  const [loadingImg, setLoadingImg]         = useState(false)
  const [loading, setLoading]               = useState(false)
  const [copiado, setCopiado]               = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (result) setLoading(false) }, [result])

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setLoadingImg(true)
    const b64s = await Promise.all(files.map(comprimirImagem))
    setImagens(prev => [...prev, ...b64s].slice(0, 6))
    setLoadingImg(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeImg(i: number) {
    setImagens(prev => prev.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const valor = parseFloat(valorInicial.replace(',', '.'))
    if (!titulo.trim() || isNaN(valor) || valor <= 0) return
    setLoading(true)
    onClearResult()
    onCreate({
      titulo: titulo.trim(), descricao: descricao.trim(),
      especificacoes: especificacoes.trim(),
      valor_inicial: valor,
      tempo_segundos: parseInt(tempoSegundos) || 0,
      imagens,
    })
  }

  function handleCopiar() {
    if (!result?.join_code) return
    navigator.clipboard.writeText(result.join_code)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900 text-lg">Novo Leilão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {result?.sucesso ? (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-semibold text-gray-800 mb-1">Leilão criado!</p>
            <p className="text-sm text-gray-500 mb-6">{result.mensagem}</p>
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Código de acesso</p>
            <div className="inline-flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-6 py-4 mb-6">
              <span className="text-3xl font-black text-orange-700 tracking-widest">{result.join_code}</span>
              <button onClick={handleCopiar}
                className="text-xs text-orange-500 hover:text-orange-700 border border-orange-300 rounded px-2 py-1">
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="text-sm text-gray-400">Compartilhe com as transportadoras.</p>
            <button onClick={onClose}
              className="mt-6 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-lg">
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="ex: Carga SP → Recife, 20t"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
                rows={2} placeholder="Descrição geral do leilão"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Especificações da Carga</label>
              <textarea value={especificacoes} onChange={e => setEspecificacoes(e.target.value)}
                rows={3} placeholder="Peso, dimensões, tipo de produto, restrições…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lance Inicial (R$) *</label>
                <input type="number" value={valorInicial} onChange={e => setValorInicial(e.target.value)}
                  placeholder="10000.00" step="0.01" min="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tempo (seg) <span className="text-gray-400 font-normal">opcional</span>
                </label>
                <input type="number" value={tempoSegundos} onChange={e => setTempoSegundos(e.target.value)}
                  placeholder="0 = sem timer" min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>

            {/* Upload de imagens — capa obrigatória */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Foto de Capa{' '}
                <span className="text-red-500">*</span>
                <span className="text-gray-400 font-normal"> (1ª foto será a capa · máx. 6)</span>
              </label>
              {imagens.length === 0 && (
                <p className="text-xs text-red-500 mb-2">
                  ⚠ Adicione pelo menos uma foto de capa para continuar.
                </p>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {imagens.map((src, i) => (
                  <div key={i}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden border group ${
                      i === 0 ? 'border-orange-400 ring-2 ring-orange-300' : 'border-gray-200'
                    }`}>
                    {i === 0 && (
                      <span className="absolute top-0 left-0 bg-orange-500 text-white text-[9px] px-1 leading-4 z-10 rounded-br">
                        CAPA
                      </span>
                    )}
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeImg(i)}
                      className="absolute inset-0 bg-black/50 text-white text-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      ×
                    </button>
                  </div>
                ))}
                {imagens.length < 6 && (
                  <button type="button" onClick={() => fileRef.current?.click()}
                    disabled={loadingImg}
                    className={`w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1 transition-colors disabled:opacity-50 ${
                      imagens.length === 0
                        ? 'border-red-300 hover:border-orange-400 text-red-400 hover:text-orange-500'
                        : 'border-gray-300 hover:border-orange-400 text-gray-400 hover:text-orange-500'
                    }`}>
                    {loadingImg ? '…' : <>📷<span>{imagens.length === 0 ? 'Capa' : 'Adicionar'}</span></>}
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={handleFiles} />
            </div>

            {result && !result.sucesso && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{result.mensagem}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={loading || imagens.length === 0}
                title={imagens.length === 0 ? 'Adicione uma foto de capa antes de criar' : ''}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg">
                {loading ? 'Criando…' : 'Criar Leilão'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
