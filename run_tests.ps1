# run_tests.ps1
#   .\run_tests.ps1           -> roda a suite inteira e abre o relatorio
#   .\run_tests.ps1 <filtro>  -> roda so os testes cujo nome contem <filtro>

param([string]$Filtro = "")

$python = ".\.venv\Scripts\python.exe"
$dirs = "services\auction", "services\auth", "services\notification"

# Cria o venv e instala dependencias caso nao exista
if (-not (Test-Path $python)) {
    Write-Host "Criando ambiente virtual..."
    python -m venv .venv
    Write-Host "Instalando dependencias de teste..."
    & ".\.venv\Scripts\pip" install -q -r requirements-dev.txt
    Write-Host "Ambiente pronto."
}

# Gera os stubs gRPC localmente (necessario fora do Docker)
$servicoStubs = @{
    "services\auth"         = @("protos\auth.proto")
    "services\auction"      = @("protos\auction.proto")
    "services\notification" = @("protos\notification.proto")
}

foreach ($svc in $servicoStubs.Keys) {
    $genDir = "$svc\generated"
    if (-not (Test-Path $genDir)) { New-Item -ItemType Directory -Force $genDir | Out-Null }
    $protoList = $servicoStubs[$svc]
    & $python -m grpc_tools.protoc -I protos --python_out=$genDir --grpc_python_out=$genDir @protoList
}

# Roda os testes
if ($Filtro -eq "") {
    & $python -m pytest @dirs -q
    $relatorio = "relatorio-testes.html"
    if (Test-Path $relatorio) {
        Start-Process (Resolve-Path $relatorio)
    }
} else {
    & $python -m pytest @dirs -k $Filtro -s
}
