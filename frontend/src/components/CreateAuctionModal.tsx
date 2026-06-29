import { useState, useRef, type FormEvent, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, TextField, Button, Box, Stack, Typography, Alert,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import type { CreateAuctionResult } from '../types'
import RichTextEditor from './RichTextEditor'

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
  const [tempoMinutos, setTempoMinutos]     = useState('')
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
      titulo: titulo.trim(),
      descricao,
      especificacoes,
      valor_inicial: valor,
      tempo_segundos: (parseInt(tempoMinutos) || 0) * 60,
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
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Novo Leilão
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      {result?.sucesso ? (
        <DialogContent sx={{ textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
          <Typography fontWeight={600} mb={0.5}>Leilão criado!</Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>{result.mensagem}</Typography>
          <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase' }}>
            Código de acesso
          </Typography>
          <Stack direction="row" alignItems="center" justifyContent="center" spacing={2}
            sx={{
              bgcolor: 'rgba(249,115,22,0.08)', border: '1px solid', borderColor: 'rgba(249,115,22,0.3)',
              borderRadius: 2, px: 3, py: 2, my: 2, width: 'fit-content', mx: 'auto',
            }}>
            <Typography variant="h4" fontWeight={800} color="primary.dark" letterSpacing={4}>
              {result.join_code}
            </Typography>
            <Button size="small" variant="outlined" onClick={handleCopiar}>
              {copiado ? 'Copiado!' : 'Copiar'}
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Compartilhe com as transportadoras.
          </Typography>
          <Button onClick={onClose} variant="contained" fullWidth sx={{ mt: 3 }}>Fechar</Button>
        </DialogContent>
      ) : (
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Stack spacing={2}>
              <TextField
                label="Título" value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="ex: Carga SP para Recife, 20t" required fullWidth size="small" autoFocus
              />
              <RichTextEditor
                label="Descrição"
                value={descricao}
                onChange={setDescricao}
                minRows={3}
                placeholder="Descrição geral do leilão — use Enter para separar parágrafos"
              />
              <RichTextEditor
                label="Especificações da carga"
                value={especificacoes}
                onChange={setEspecificacoes}
                minRows={4}
                placeholder="Peso, dimensões, tipo de produto, restrições..."
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Lance inicial (R$)" type="number" value={valorInicial}
                  onChange={e => setValorInicial(e.target.value)}
                  placeholder="10000.00" required fullWidth size="small"
                  inputProps={{ step: '0.01', min: '0.01' }}
                />
                <TextField
                  label="Tempo (min)" type="number" value={tempoMinutos}
                  onChange={e => setTempoMinutos(e.target.value)}
                  placeholder="opcional" fullWidth size="small"
                  inputProps={{ min: '0' }}
                />
              </Stack>

              <Box>
                <Typography variant="body2" fontWeight={500} gutterBottom>
                  Foto de capa <Box component="span" color="error.main">*</Box>
                  <Typography component="span" variant="caption" color="text.disabled">
                    {' '}(1ª foto será a capa, máx. 6)
                  </Typography>
                </Typography>
                {imagens.length === 0 && (
                  <Typography variant="caption" color="error.main" display="block" mb={1}>
                    Adicione pelo menos uma foto de capa para continuar.
                  </Typography>
                )}
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {imagens.map((src, i) => (
                    <Box key={i} sx={{
                      position: 'relative', width: 80, height: 80, borderRadius: 1.5, overflow: 'hidden',
                      border: '2px solid', borderColor: i === 0 ? 'primary.main' : 'grey.200',
                      '&:hover .overlay': { opacity: 1 },
                    }}>
                      {i === 0 && (
                        <Box sx={{
                          position: 'absolute', top: 0, left: 0, zIndex: 1, bgcolor: 'primary.main',
                          color: 'white', fontSize: 9, px: 0.5, borderBottomRightRadius: 4,
                        }}>
                          CAPA
                        </Box>
                      )}
                      <Box component="img" src={src} alt=""
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <Box className="overlay" onClick={() => removeImg(i)}
                        sx={{
                          position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: 0, transition: 'opacity 0.2s', cursor: 'pointer',
                        }}>
                        <CloseIcon />
                      </Box>
                    </Box>
                  ))}
                  {imagens.length < 6 && (
                    <Button
                      onClick={() => fileRef.current?.click()}
                      disabled={loadingImg}
                      sx={{
                        width: 80, height: 80, minWidth: 0, flexDirection: 'column', gap: 0.5,
                        border: '2px dashed', borderColor: imagens.length === 0 ? 'error.light' : 'grey.300',
                        color: imagens.length === 0 ? 'error.light' : 'text.disabled',
                      }}>
                      {loadingImg ? '...' : (
                        <>
                          <PhotoCameraIcon fontSize="small" />
                          <Typography variant="caption">{imagens.length === 0 ? 'Capa' : 'Adicionar'}</Typography>
                        </>
                      )}
                    </Button>
                  )}
                </Stack>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
              </Box>

              {result && !result.sucesso && <Alert severity="error">{result.mensagem}</Alert>}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} color="inherit">Cancelar</Button>
            <Button
              type="submit" variant="contained"
              disabled={loading || imagens.length === 0}
              title={imagens.length === 0 ? 'Adicione uma foto de capa antes de criar' : ''}
            >
              {loading ? 'Criando...' : 'Criar leilão'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  )
}
