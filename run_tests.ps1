# run_tests.ps1 — executa a suite completa e abre o relatorio HTML
# Uso: .\run_tests.ps1

# Caminho do Python no venv
$python = ".\.venv\Scripts\python.exe"

# Roda pytest com saida verbosa, captura stdout (-s para ver throughput do carga),
# e gera relatorio HTML self-contained
& $python -m pytest services\auction services\auth services\notification `
    -v -s `
    --html=test-report.html `
    --self-contained-html

# Mostra onde esta o relatorio
Write-Host ""
Write-Host "Relatorio HTML gerado em: $(Resolve-Path test-report.html)" -ForegroundColor Cyan

# Abre no navegador padrao
Start-Process "$(Resolve-Path test-report.html)"
