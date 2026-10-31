# Vexa hosting on this PC

Public URL: https://meeting.everydayai.work

This PC is selected by the meeting DNS record and uses the dedicated Cloudflare tunnel vexa-meeting (76f8620e-f2f5-44d3-8777-fa8d2fe824cb). The other PC retains the shared training-everydayai tunnel (ad538c6c-a8d4-4c51-9901-d70edbaf7d35), which serves the training app and keeps its previous Vexa route for switching back.

## Sign in

The public password prompt is retained on this PC. The new username and generated password are in .env.cloudflare/public-login.json. Open that local file to view them; do not share the file. After passing the password prompt, use local-test@example.com for the local Vexa test login.

Vexa data is separate on each PC. Login sessions, meeting history, and recordings do not synchronize. Transcription and AI chat remain unconfigured on this PC.

## Start and stop here

From this directory:

```powershell
.\start-tunnel.ps1
.\stop-tunnel.ps1
```

Docker Desktop must be running. The connector is a hidden Windows process started manually; it does not automatically start after reboot. The start command starts Vexa and the password-protected local proxy, checks their readiness, then connects cloudflared over HTTP/2. The stop command stops this connector and proxy and restores local-only UI settings. Local UI: http://localhost:13000.

The public hostname is selected by DNS. Starting a connector does not move DNS. Stopping the selected connector makes the public meeting site unavailable until it is restarted or DNS is switched to the other PC. The training hostname is unaffected.

## Switch PCs

Open Cloudflare, everydayai.work, DNS Records, and search for meeting. Edit only that CNAME record and keep Proxy enabled and TTL Auto.

- This PC: 76f8620e-f2f5-44d3-8777-fa8d2fe824cb.cfargotunnel.com (vexa-meeting). Start this PC with start-tunnel.ps1 before selecting it.
- Other PC: ad538c6c-a8d4-4c51-9901-d70edbaf7d35.cfargotunnel.com (training-everydayai). Its existing connector and Vexa app must be running. Once selected, stop this PC connector if no longer needed.

Do not stop the other PC shared training connector just to switch Vexa. Separate tunnels avoid distributing requests across independent databases. DNS changes take a short time to propagate; finish active meetings and sign in again after switching. No existing route was deleted from the shared tunnel.

## Local implementation

The public flow is Cloudflare TLS -> dedicated tunnel -> http://localhost:13001 -> password-protected Nginx proxy -> terminal:3000 -> Vexa gateway. Terminal NEXTAUTH_URL is https://meeting.everydayai.work while public serving is enabled. The proxy supports streaming and WebSocket upgrades and strips the outer Basic Authorization header before forwarding to Vexa.

The official cloudflared 2026.10.3 executable was checked against its published SHA256. Nginx uses a pinned image digest. Connector credentials, public login, password hash, proxy config and logs live under .env.cloudflare, which Git ignores. Avoid posting these files or their contents.

## Verification

Expected: the public hostname serves this PC with password protection, supports Vexa sign-in and authenticated meeting reads, and leaves training available.

Actual: connector readiness and Cloudflare status healthy; protected local proxy returns 401 for anonymous and wrong-password requests, 200 with the generated login; public URL returns 200 with that login and matches this PC UI build; anonymous public requests return 401; public Vexa login, /api/auth/me and /api/meetings return 200; session cookies are Secure. The training URL continues returning its login redirect (302 /login?redirect-to=/coach).

Verdict: public UI and authenticated API flow verified. Live meetings, transcription, AI chat, and execution on the other PC were not tested.

The stop/start commands were exercised successfully; the connector is left running and the public site returned HTTP 200 after restart.
