import { useRef, useEffect } from 'react'
import { Box, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'

interface Props {
  label: string
  value: string           // HTML armazenado
  onChange: (html: string) => void
  minRows?: number
  placeholder?: string
}

export default function RichTextEditor({ label, value, onChange, minRows = 3, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)

  // Inicializa o conteúdo apenas na montagem (evita reset do cursor durante digitação)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function execCmd(cmd: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false)
    onChange(editorRef.current?.innerHTML ?? '')
  }

  function handleInput() {
    if (!isComposing.current) {
      onChange(editorRef.current?.innerHTML ?? '')
    }
  }

  const minH = minRows * 24

  return (
    <Box>
      <Box sx={{
        border: '1px solid',
        borderColor: 'rgba(0,0,0,0.23)',
        borderRadius: 1,
        overflow: 'hidden',
        '&:focus-within': { borderColor: 'primary.main', borderWidth: 2, m: '-1px' },
      }}>
        {/* Label flutuante */}
        <Box sx={{
          px: 1.5, pt: 0.5,
          fontSize: 11, color: 'text.disabled',
          userSelect: 'none',
        }}>
          {label}
        </Box>

        {/* Toolbar */}
        <Box sx={{ px: 1, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <ToggleButtonGroup size="small" exclusive={false}>
            <Tooltip title="Negrito (selecione o texto e clique)">
              <ToggleButton value="bold" onClick={() => execCmd('bold')} sx={{ border: 'none', px: 1 }}>
                <FormatBoldIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Itálico (selecione o texto e clique)">
              <ToggleButton value="italic" onClick={() => execCmd('italic')} sx={{ border: 'none', px: 1 }}>
                <FormatItalicIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Box>

        {/* Área editável */}
        <Box
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onCompositionStart={() => { isComposing.current = true }}
          onCompositionEnd={() => {
            isComposing.current = false
            onChange(editorRef.current?.innerHTML ?? '')
          }}
          data-placeholder={placeholder}
          sx={{
            px: 1.75,
            py: 1,
            minHeight: minH,
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'text.primary',
            '& b, & strong': { fontWeight: 700 },
            '& i, & em': { fontStyle: 'italic' },
            '&:empty::before': {
              content: 'attr(data-placeholder)',
              color: 'text.disabled',
              pointerEvents: 'none',
            },
          }}
        />
      </Box>
    </Box>
  )
}
