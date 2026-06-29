# run_tests.ps1
#   .\run_tests.ps1                -> roda a suite inteira e abre o relatorio
#   .\run_tests.ps1 <filtro>       -> roda so os testes cujo nome contem <filtro>

param([string]$Filtro = "")

$python = ".\.venv\Scripts\python.exe"
$dirs = "services\auction", "services\auth", "services\notification"

if ($Filtro -eq "") {
    & $python -m pytest @dirs -q
    Start-Process "$(Resolve-Path relatorio-testes.html)"
} else {
    & $python -m pytest @dirs -k "$Filtro" -s
}
