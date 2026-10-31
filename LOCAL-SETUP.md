# Local Windows setup

Run Docker Desktop with Linux containers. From this folder run `./start-local.ps1`.
Use `./start-local.ps1 -Pull` to refresh published images, or `./stop-local.ps1` to stop while preserving data.

UI: http://localhost:13000
API: http://localhost:18056
Direct test login: local-test@example.com (direct login requires an email containing test).

Configuration: deploy/compose/.env (ignored by Git; contains generated secrets, do not share).
Capture-only mode is enabled. For transcripts, configure TRANSCRIPTION_SERVICE_URL and TRANSCRIPTION_SERVICE_TOKEN, set TRANSCRIBE_ENABLED=true, then restart. Host services are reachable from containers via host.docker.internal.
Agent chat needs model provider credentials; see deploy/compose/.env.example. OAuth needs provider credentials.

This installation uses published v012 images. Source development uses make dev under Linux/WSL.
Data persists in Docker named volumes.

Status: docker compose -f deploy/compose/docker-compose.yml ps
Logs: docker compose -f deploy/compose/docker-compose.yml logs --tail 80

Verified: Compose configuration and startup readiness pass; UI and gateway health return HTTP 200; test login creates an authenticated session. Live meeting capture, transcription and AI chat have not been tested.
Repository revision: f1a62fbb (v0.12.28). Checkout: `C:\Users\dipeshd\Downloads\VSCode\vexa`, branch `main`. Run setup scripts from this folder.

Setup verification record:
- Expected: the documented Compose install serves the UI and supports authenticated API requests locally.
- Actual: compose config exited 0; compose up --wait exited 0; UI and gateway /health returned 200; test login succeeded; /api/auth/me confirmed authentication; authenticated /api/meetings returned 200.
- Verdict: local control plane works. Transcription and model credentials are intentionally unconfigured; live meeting behavior was not exercised.

All service images plus vexaai/v012-agent-worker:v012 and vexaai/vexa-bot:v012 downloaded successfully.

For public hosting and PC switching, see CLOUDFLARE-SETUP.md. Use start-tunnel.ps1 and stop-tunnel.ps1 for public serving; start-local.ps1 is for local-only operation. Public credentials are in the ignored .env.cloudflare/public-login.json file.
