import { createTheme } from '@mui/material/styles'

// Tema da plataforma. Mantem a identidade laranja da marca (DJMC Leiloes),
// com tipografia Inter, cantos suaves e sombras discretas.
const theme = createTheme({
  palette: {
    primary:   { main: '#f97316', dark: '#ea580c', light: '#fb923c', contrastText: '#ffffff' },
    secondary: { main: '#16a34a', dark: '#15803d', contrastText: '#ffffff' },
    error:     { main: '#dc2626' },
    warning:   { main: '#f59e0b' },
    success:   { main: '#16a34a' },
    background: { default: '#f3f4f6', paper: '#ffffff' },
    text:      { primary: '#111827', secondary: '#6b7280' },
    divider:   '#e9ebee',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#f3f4f6' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 18 },
        sizeLarge: { paddingBlock: 10, fontSize: '0.95rem' },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: {
          borderColor: '#e9ebee',
          transition: 'box-shadow .2s ease, transform .2s ease, border-color .2s ease',
        },
      },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: {
          '&:hover': { boxShadow: '0 6px 20px rgba(17,24,39,0.08)' },
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiAppBar: { styleOverrides: { colorInherit: { backgroundColor: '#ffffff' } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontSize: 12 } } },
  },
})

export default theme
