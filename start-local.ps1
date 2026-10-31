param([switch]$Pull)
$ErrorActionPreference = 'Stop'
$composeFile = Join-Path $PSScriptRoot 'deploy/compose/docker-compose.yml'
if ($Pull) {
    docker compose -f $composeFile pull --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Service image download failed.' }
    foreach ($image in @('vexaai/v012-agent-worker:v012','vexaai/vexa-bot:v012')) {
        docker pull --quiet $image
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $image" }
    }
}
docker compose -f $composeFile up -d --no-build --wait --wait-timeout 300
if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Inspect Docker Compose logs.' }
Write-Host 'Vexa: http://localhost:13000 | API: http://localhost:18056'
Write-Host 'Test login: local-test@example.com'
