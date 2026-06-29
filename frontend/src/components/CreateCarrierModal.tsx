import { useState, type FormEvent, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, TextField, Button, Stack, Alert, Divider, Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import type { CreateCarrierResult } from '../types'

interface Props {
  onClose: () => void
  onCreate: (username: string, password: string, cnpj: string, email: string, telefone: string) => void
  result: CreateCarrierResult | null
  onClearResult: () => void
}

export default function CreateCarrierModal({ onClose, onCreate, result, onClearResult }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [cnpj,     setCnpj]     = useState('')
  const [email,    setEmail]    = useState('')
  const [telefone, setTelefone] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [localErr, setLocalErr] = useState('')

  useEffect(() => {
    if (result) setLoading(false)
  }, [result])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setLocalErr('Preencha usuário e senha.'); return }
    if (password !== confirm) { setLocalErr('Senhas não coincidem.'); return }
    setLocalErr('')
    onClearResult()
    setLoading(true)
    onCreate(username.trim(), password, cnpj.trim(), email.trim(), telefone.trim())
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Nova Transportadora
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
              Acesso
            </Typography>
            <TextField
              label="Usuário" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ex: translog_sp" autoComplete="off" required fullWidth size="small" autoFocus
            />
            <TextField
              label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres" required fullWidth size="small"
            />
            <TextField
              label="Confirmar senha" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repita a senha" required fullWidth size="small"
            />

            <Divider />

            <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
              Dados de contato
            </Typography>
            <TextField
              label="CNPJ" value={cnpj} onChange={e => setCnpj(e.target.value)}
              placeholder="00.000.000/0001-00" fullWidth size="small"
            />
            <TextField
              label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="contato@transportadora.com" fullWidth size="small"
            />
            <TextField
              label="Telefone" value={telefone} onChange={e => setTelefone(e.target.value)}
              placeholder="(81) 99999-0000" fullWidth size="small"
            />

            {(localErr || (result && !result.sucesso)) && (
              <Alert severity="error">{localErr || result?.mensagem}</Alert>
            )}
            {result?.sucesso && <Alert severity="success">{result.mensagem}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit">Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Criando...' : 'Criar conta'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
