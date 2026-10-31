param(
    [ValidatePattern('^http://(localhost|127\.0\.0\.1):[0-9]+/?$')]
    [string]$OriginUrl = 'http://localhost:13001'
)
$ErrorActionPreference = 'Stop'
$stateDir = Join-Path $PSScriptRoot '.env.cloudflare'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$secret = Read-Host 'Paste the dedicated Vexa Cloudflare tunnel token (input is hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    try {
        $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($token)) | ConvertFrom-Json
        if (-not $decoded.t -or -not $decoded.s -or -not $decoded.a) { throw 'Missing tunnel fields' }
    } catch { throw 'Paste only the dedicated Vexa tunnel token, not the install command.' }
    if ($decoded.t -eq 'ad538c6c-a8d4-4c51-9901-d70edbaf7d35') { throw 'This token belongs to the shared training tunnel. Use the dedicated vexa-meeting tunnel token.' }
    $tokenPath = Join-Path $stateDir 'tunnel-token'
    [IO.File]::WriteAllText($tokenPath, $token, (New-Object Text.UTF8Encoding($false)))
    @{ Hostname = 'meeting.everydayai.work'; OriginUrl = $OriginUrl; TunnelId = $decoded.t } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'tunnel.json') -Encoding UTF8
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $token = $null
    $decoded = $null
    $secret.Dispose()
}
Write-Host 'Existing tunnel credentials saved locally. The connector has NOT been started.'
Write-Host 'Run .\start-tunnel.ps1 here; select vexa-meeting in the meeting DNS record to serve this PC.'



