import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Paper, TextField, Button, Stack, Alert } from '@mui/material'
import { useSocket } from '../hooks/useSocket'
import Logo from '../components/Logo'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState('')
  const navigate = useNavigate()
  const { connected, login, loginResponse } = useSocket()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username.trim()) { setErro('Informe um nome ou usuário.'); return }
    setErro('')
    setLoading(true)
    login(username.trim(), password.trim())
  }

  useEffect(() => {
    if (!loginResponse) return
    setLoading(false)
    if (!loginResponse.sucesso) { setErro(loginResponse.mensagem); return }
    sessionStorage.setItem('userId',   loginResponse.userId)
    sessionStorage.setItem('userRole', loginResponse.role)
    navigate(loginResponse.role === 'admin' ? '/admin' : '/transportadora')
  }, [loginResponse, navigate])

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: 'background.default', p: 2,
    }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, p: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Logo height={160} />
        </Box>

        <form onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <TextField
              label="Nome / Usuário" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ex: TransLog SP ou admin" autoComplete="off" autoFocus fullWidth
            />
            <TextField
              label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Sua senha" fullWidth
              helperText="Apenas para admin e transportadoras cadastradas"
            />

            {erro && <Alert severity="error">{erro}</Alert>}

            <Button
              type="submit" variant="contained" size="large" fullWidth
              disabled={loading || !connected}
            >
              {loading ? 'Entrando...' : !connected ? 'Conectando...' : 'Entrar'}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}
