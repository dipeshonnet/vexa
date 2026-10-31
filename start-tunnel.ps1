param()
$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $PSScriptRoot '.env.cloudflare'
$exePath = Join-Path $stateDir 'cloudflared.exe'
$tokenPath = Join-Path $stateDir 'tunnel-token'
$configPath = Join-Path $stateDir 'tunnel.json'
$processPath = Join-Path $stateDir 'process.json'
if (-not (Test-Path -LiteralPath $exePath)) { throw 'The local cloudflared executable is missing.' }
if (-not (Test-Path -LiteralPath $tokenPath) -or -not (Test-Path -LiteralPath $configPath)) {
    throw 'Tunnel credentials are missing. Run .\configure-tunnel.ps1 using the dedicated Vexa Cloudflare tunnel token and service URL.'
}
if (Test-Path -LiteralPath $processPath) {
    $record = Get-Content -LiteralPath $processPath -Raw | ConvertFrom-Json
    $existing = Get-Process -Id $record.Id -ErrorAction SilentlyContinue
    if ($existing -and $existing.Path -eq $exePath -and $existing.StartTime.ToUniversalTime().Ticks.ToString() -eq $record.StartTicks) {
        Write-Host 'This PC tunnel connector is already running.'
        return
    }
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if ($config.OriginUrl -notmatch '^http://(localhost|127\.0\.0\.1):[0-9]+/?$') {
    throw 'This Windows connector requires a loopback HTTP service URL. Inspect the existing Cloudflare route before proceeding.'
}
if ($config.TunnelId -eq 'ad538c6c-a8d4-4c51-9901-d70edbaf7d35') { throw 'The shared training tunnel must not be used by this connector.' }
if (Get-NetTCPConnection -LocalPort 20241 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 20241 is already in use. No connector was started.' }
$origin = [uri]$config.OriginUrl
if ($origin.Port -lt 1 -or $origin.Port -gt 65535) { throw 'Invalid origin port.' }
$baseCompose = Join-Path $PSScriptRoot 'deploy/compose/docker-compose.yml'
$overridePath = Join-Path $stateDir 'compose-public.yml'
if (-not (Test-Path -LiteralPath $overridePath)) { throw 'Public proxy Compose configuration is missing.' }
$composeArgs = @('compose', '-f', $baseCompose, '-f', $overridePath)
& docker @composeArgs up -d --no-build --wait --wait-timeout 300
if ($LASTEXITCODE -ne 0) { throw 'Vexa failed its startup checks; the tunnel was not started.' }
$login = Get-Content -LiteralPath (Join-Path $stateDir 'public-login.json') -Raw | ConvertFrom-Json
$basicHeader = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($login.username + ':' + $login.password))
$health = Invoke-WebRequest -Uri $origin.AbsoluteUri -Headers @{ Authorization = ('Basic ' + $basicHeader) } -UseBasicParsing -TimeoutSec 20
$login = $null; $basicHeader = $null
if ($health.StatusCode -ne 200) { throw 'Vexa is not responding at the configured origin.' }
$stdoutPath = Join-Path $stateDir 'stdout.log'
$stderrPath = Join-Path $stateDir 'stderr.log'
$arguments = @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--metrics', '127.0.0.1:20241', 'run', '--token-file', ('"' + $tokenPath + '"'))
$connector = Start-Process -FilePath $exePath -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
@{ Id = $connector.Id; StartTicks = $connector.StartTime.ToUniversalTime().Ticks.ToString() } |
    ConvertTo-Json | Set-Content -LiteralPath $processPath -Encoding UTF8
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if ($connector.HasExited) { break }
    try {
        $response = Invoke-WebRequest 'http://127.0.0.1:20241/ready' -UseBasicParsing -TimeoutSec 1
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    if (-not $connector.HasExited) { Stop-Process -Id $connector.Id }
    throw 'Cloudflare did not connect. This connector was stopped; inspect .env.cloudflare/stderr.log.'
}
Write-Host 'This PC connector is connected to Cloudflare. Public URL: https://meeting.everydayai.work'
Write-Host 'The meeting DNS record selects which PC serves the hostname. See CLOUDFLARE-SETUP.md to switch PCs.'




