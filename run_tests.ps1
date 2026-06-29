# run_tests.ps1 -- executa a suite de testes com feedback rico por teste
#
# MODOS DE USO:
#   .\run_tests.ps1                          -> roda tudo, gera relatorio-testes.html e abre no navegador
#   .\run_tests.ps1 lances_iguais            -> roda so o(s) teste(s) cujo nome contem "lances_iguais"
#   .\run_tests.ps1 test_carga               -> roda so test_carga_lock_alto_volume
#   .\run_tests.ps1 subscribe                -> roda testes de subscribe
#
# Alternativa direta (sem este script):
#   .\.venv\Scripts\python.exe -m pytest services\auction\tests\test_state.py::test_lances_iguais_so_um_vence -s

param(
    [string]$Filtro = ""   # filtro opcional de nome de teste (equivale a -k do pytest)
)

# Caminho do Python no venv
$python = ".\.venv\Scripts\python.exe"

# Diretorios de teste dos tres servicos
$dirs = "services\auction", "services\auth", "services\notification"

if ($Filtro -eq "") {
    # ── Modo suite completa ───────────────────────────────────────────────────
    Write-Host ""
    Write-Host "Rodando suite completa..." -ForegroundColor Cyan

    # -q: saida compacta do pytest (a lista bonita e o banner saem do conftest)
    & $python -m pytest @dirs -q

    Write-Host ""
    Write-Host "Relatorio: $(Resolve-Path relatorio-testes.html)" -ForegroundColor Cyan

    # Abre o relatorio bonito no navegador padrao
    Start-Process "$(Resolve-Path relatorio-testes.html)"

} else {
    # ── Modo teste especifico (sem gerar HTML, foco no terminal) ─────────────
    Write-Host ""
    Write-Host "Rodando testes com filtro: '$Filtro'" -ForegroundColor Yellow
    Write-Host ""

    # -k: filtra por nome; -s: mostra stdout; sem --html (rapido, foco no terminal)
    & $python -m pytest @dirs -k "$Filtro" -s
}
