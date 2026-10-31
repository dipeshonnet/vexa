$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $PSScriptRoot '.env.cloudflare'
$processPath = Join-Path $stateDir 'process.json'
$exePath = Join-Path $stateDir 'cloudflared.exe'
if (Test-Path -LiteralPath $processPath) {
    $record = Get-Content -LiteralPath $processPath -Raw | ConvertFrom-Json
    $connector = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
    if ($connector) {
        if ($connector.Path -ne $exePath -or $connector.StartTime.ToUniversalTime().Ticks.ToString() -ne $record.StartTicks) {
            throw 'Saved process identity does not match this connector; no process was stopped.'
        }
        Stop-Process -Id $connector.Id
        $connector.WaitForExit(10000) | Out-Null
        if (-not $connector.HasExited) { throw 'The connector has not stopped yet. Do not start the other PC tunnel.' }
    }
}
$baseCompose = Join-Path $PSScriptRoot 'deploy/compose/docker-compose.yml'
$publicCompose = Join-Path $stateDir 'compose-public.yml'
if (Test-Path -LiteralPath $publicCompose) {
    & docker compose -f $baseCompose -f $publicCompose stop meeting-proxy
    if ($LASTEXITCODE -ne 0) { throw 'Tunnel is stopped, but the local public proxy did not stop.' }
}
& docker compose -f $baseCompose up -d --no-build --wait --wait-timeout 300 terminal
if ($LASTEXITCODE -ne 0) { throw 'Tunnel is stopped, but restoring the local-only UI configuration failed.' }
Write-Host 'This PC tunnel is stopped. Vexa remains available locally at http://localhost:13000.'
Write-Host 'To use the other PC, point the meeting DNS record to training-everydayai. Keep its shared connector running.'


