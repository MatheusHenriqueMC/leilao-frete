import { createTheme } from '@mui/material/styles'

// Tema da plataforma. Mantem a identidade laranja da marca (DJMC Leiloes).
const theme = createTheme({
  palette: {
    primary:   { main: '#f97316', dark: '#ea580c', light: '#fb923c', contrastText: '#ffffff' },
    secondary: { main: '#16a34a', dark: '#15803d', contrastText: '#ffffff' },
    error:     { main: '#dc2626' },
    warning:   { main: '#f97316' },
    success:   { main: '#16a34a' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text:      { primary: '#1f2937', secondary: '#6b7280' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper:  { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard:   { defaultProps: { variant: 'outlined' } },
  },
})

export default theme
