$ErrorActionPreference = 'Stop'
docker compose -f (Join-Path $PSScriptRoot 'deploy/compose/docker-compose.yml') down
if ($LASTEXITCODE -ne 0) { throw 'Could not stop Vexa.' }
