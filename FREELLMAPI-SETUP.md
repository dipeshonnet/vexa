# Vexa with FreeLLMAPI

Start FreeLLMAPI on this PC, then Docker Desktop in Linux container mode.
From this folder, run `./start-local.ps1`.

- Vexa: http://localhost:13000
- API: http://localhost:18056
- Local test login: local-test@example.com
- Stop: `./stop-local.ps1` (preserves named volumes).

This checkout uses the existing `vexa-v012` Compose project and named volumes.
Its configuration is `deploy/compose/.env`, ignored by Git. It contains private
credentials copied from the existing local installation and the FreeLLMAPI
unified key. Do not share or commit that file.

The completion provider is `openai-compat`, with model `auto` and base URL
`http://host.docker.internal:31415/v1`. Vexa's agent uses the available
`claude-code` runner with FreeLLMAPI's Messages endpoint, configured through
`ANTHROPIC_BASE_URL=http://host.docker.internal:31415` and
`ANTHROPIC_AUTH_TOKEN`. Both API formats use the same unified key.

Use the startup script in this folder when restarting. The active configuration
is `deploy/compose/.env`; the original per-worktree configurations are preserved
in `.local/worktree-consolidation-20261031/` backup archives.
FreeLLMAPI must remain running while Vexa makes model requests. If you regenerate
its unified key, update both `VEXA_LLM_API_KEY` and `ANTHROPIC_AUTH_TOKEN` in the
ignored environment file, then run `./start-local.ps1` again.

This configures LLM inference. Speech transcription has its own configuration.

## Verification

Expected: the proxy authenticates model discovery and completion calls, Docker
services become healthy, and Vexa chat returns a reply through FreeLLMAPI.

Actual (2026-10-29):

- Authenticated `/v1/models` returned HTTP 200 and advertised `auto`.
- `/v1/chat/completions` returned HTTP 200 with `VEXA_OK`;
  `/v1/messages` returned HTTP 200.
- Compose configuration validation passed; Git confirms the secrets file is ignored.
- `./start-local.ps1` completed successfully with Compose health checks passing.
- Model discovery from inside `vexa-v012-agent-api-1` returned HTTP 200 through
  `host.docker.internal` and confirmed `auto` is available.
- Local UI returned HTTP 200; authenticated test login succeeded.
- The authenticated Vexa `/api/models/test` returned `ok: true`, HTTP 200,
  and `mode: custom` against the FreeLLMAPI endpoint.
- Authenticated `/api/chat` returned HTTP 200 and streamed `VEXA_OK`, followed by
  `done` with `ok: true` and `turn-complete`. Verification conversation:
  `freellmapi-setup-verification`.

Verdict: Vexa agent chat works through FreeLLMAPI. Live meeting capture and speech
transcription have not been tested.

Docker startup initially failed on an inaccessible stale temporary socket.
The socket directory was preserved at
`C:/Users/dipeshd/AppData/Local/Docker/run-before-vexa-20261029194322`, and Docker
recreated its runtime directory successfully. Persistent Docker volumes were retained.
