# Teams join latency correction

Scope: local join adapter changes on codex/teams-fast-join. Live timing and meeting admission validation belong to the user. No release, commit, or push is included.

## Plan and expectations
1. Reproduce with a real Chromium DOM fixture (no meeting): direct pre-join, browser choice, AV overlay before/during/after click, missing optional controls, delayed readiness, and a disabled Join button. Expected before correction: direct pre-join burns the 10-second browser-choice wait; overlays can stall the Join click.
2. Correct the Teams adapter: one readiness loop for both landing screens, visible optional controls only, bounded join clicks with modal recovery, observable transitions instead of fixed sleeps. Expected: all local fixtures enter with the configured name/camera and correct click counts without long actionability stalls. The local regression guard is ten seconds after DOMContentLoaded; the live target remains five seconds end to end.
3. Run module build and its existing tests. Expected: redirect classification, passcode redaction, admission, and other platforms retain their behavior.
4. Hand off the worktree for live Teams measurement. Expected: user compares request, navigation, pre-join readiness, Join click, admission, and first audio times. Local fixture timing does not establish live request-to-admitted latency.

Critical path is sequential: reproduce, patch, local validation, live user validation. No parallel agents or changes to startup/runtime capacity.

## Actual and verdict
Base: f1a62fbb; Windows, Node v24.21.0; Playwright 1.56.0 using the installed Chromium 1187 through PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. No live meeting or external HTTP destination was used by the fixtures.

Before correction: direct pre-join took 12,547ms; AV confirmation before the click took 42,193ms (including the observed 30-second blocked click). Both entered the fixture meeting but failed the five-second timing target.

During validation: one navigation took about 17.8s before the joining callback. Another overlay run took 6,435ms after navigation. These are observed delays, not evidence that live Teams meets five seconds. The browser fixture now reports navigation separately and uses a ten-second post-navigation regression ceiling to catch the reproduced long stalls without treating a shared-machine wall clock as a five-second SLA.

Commands (from core/meetings/modules/join):
- npm test: exit 0 for the complete module regression suite.
- npm run build: exit 0. After the final enabled-button guard, TypeScript build and auth-redirect.test.ts were also executed directly: exit 0, redirect checks 38 passed / 0 failed.
- npm run test:browser:teams: exit 0 for all seven original fixtures with the final ten-second regression budget. Disabled-button coverage was added afterward and checked separately: exit 0.

Latest seven-case browser run (milliseconds):

| Fixture | Navigation | Join handling | Total |
| --- | ---: | ---: | ---: |

| direct | 913 | 1309 | 2222 |
| browser-choice | 5493 | 1126 | 6619 |
| before-click | 103 | 1143 | 1246 |
| during-click | 94 | 1694 | 1788 |
| after-click | 90 | 820 | 910 |
| optional-absent | 72 | 337 | 409 |
| slow-ready | 52 | 1576 | 1628 |
| disabled-join (separate final check) | 130 | 1314 | 1444 |

All cases observed the Leave control, expected Join/dismiss click counts, configured name and camera-off state where those optional controls exist. The disabled-button check retains an allowance for Teams to enable the Join button, separate from the short overlay-blocked click.

Verdict: the demonstrated long waits are corrected in the adapter; browser fixtures prove local actionability and configuration, not live admission or audio. Live Teams, first audio, full stack, and full repository gates were not checked. No push or commit was made.

## Live handoff
Use this worktree: C:/Users/dipeshd/Downloads/VSCode/vexa-teams-fast-join (branch codex/teams-fast-join). Build/deploy the bot from this tree using your existing deployment workflow; the original checkout was not modified.

Record API request accepted, navigation started, pre-join ready, Join click, admitted/active, and first audio. Exercise both direct admission and host-controlled lobby, and verify the bot name, camera off, microphone muted, and received audio. Report host waiting time separately while retaining request-to-admitted as the end-to-end measurement. Startup and browser capacity were not changed.

## Local deployment for user testing

The Vexa runtime was recreated with BROWSER_IMAGE=codex/vexa-bot:teams-fast-join. This local image derives from the previously configured codex/vexa-bot:transcript-retention and replaces only dist/msteams/join.js and dist/msteams/modals.js. Both deployed file SHA-256 hashes matched this worktree's compiled files.

Image digest: sha256:2d8fd7dd7c4a1ce967d99c4f4841538ad219101a378bc730008dab502f6fe09b

Terminal: http://localhost:13000
Gateway health: http://localhost:18056/health (200)
Runtime health: http://localhost:18090/health (200; container healthy)

The existing runtime Compose files were retained in their original order. The additional runtime-only image override is C:/Users/dipeshd/AppData/Local/Temp/vexa-teams-fast-join-2796b8a821fe4dc299e1c6078013a9d3/compose.override.yml. To revert, recreate runtime with the original five Compose files and omit this final override; the prior image is codex/vexa-bot:transcript-retention. No live meeting was started.

Docker Desktop required recovery before deployment: its run socket directory and docker-secrets-engine socket directory held inaccessible stale sockets. They were moved to backup directories beside their original locations and recreated; no images or data volumes were reset.

## Live retest: vexa-mtg-8-6dfdb3a2
Expected: confirm patched image and locate remaining delay. Actual: patched image digest verified. UTC timestamps: API join-request log 17:26:31.225; navigation 17:26:42.467; pre-join ready 17:27:05.257; Join click 17:27:05.703; confirmed admitted 17:27:20.058; API active 17:27:20.104.
Durations: request log to navigation 11.242s; navigation to ready 22.790s; ready to click 0.446s; click to active 14.401s; total 48.879s. The request event is a completion log, not HTTP-ingress time.
Entrypoint launched Node at 17:26:33.174; first worker breadcrumb at 17:26:38.436. Teams permission gate appeared at 17:27:03.994; media warm-up failed with Requested device not found at 17:27:04.036.
Verdict: the 30-second blocked-click stall did not recur. Cold startup and live Teams readiness dominate. Permission-gate impact on the earlier loading interval is not established. Admission checks accept lobby text or a lingering Join button, so the entire click-to-active interval cannot be attributed to host action. Five-second end-to-end remains unmet. No code or deployment changes were made during this check; no agent-started live meeting.

## Next optimization plan
1. Reproduce media permission failure with actual image/browser/audio graph: expected audio+video fails without a camera and audio-only succeeds. Actual: audio+video NotFoundError (172ms), audio-only success (31ms), video-only NotFoundError (2ms); only audio input/output devices enumerated. Verdict: remove camera requirement from Teams media warm-up.
2. Replace startup fixed sleeps with bounded readiness checks while retaining signal forwarding. Expected: ready X11/audio do not wait an extra fixed second; missing dependencies remain observable.
3. Benchmark an image-resident Node 22 compile cache against a disabled-cache negative control. Add only if useful; preserve original worker code and per-meeting process/profile isolation.
4. Use the user-authorized last Teams meeting for short sequential probes. Expected: record navigation, readiness, Join click and browser startup separately; no claim of five seconds without live evidence. Close each probe browser/container afterward.
5. Run targeted build/regression checks and update the local test image only after its probes pass. Warm runtime/browser pooling remains separate architecture work if cold loading still dominates.


## Second optimization results

Implemented: audio-only Teams warm-up; X11 socket polling at 50ms (same three-second poll allowance); PulseAudio readiness polling instead of a fixed one-second sleep; LF enforcement for the Linux entrypoint in Windows build contexts. Original worker modules, transcription fixes, per-meeting process/profile isolation, lifecycle callbacks and signal forwarding remain in place.

Checks:
- TypeScript join module build: exit 0.
- Chromium audio-permission fixture: success, one Join click, no modal dismissal, exactly one request for audio without video; 1,061ms post-navigation handling.
- Chromium missing-microphone fixture: success via the AV confirmation fallback, one Join click, one dismissal, audio-only request; 1,362ms post-navigation handling.
- Eight Linux entrypoint checks: pass, including delayed audio readiness, bounded missing-readiness warning, SIGTERM forwarding, graceful exit 0 and normal exit-code propagation. The expanded tests mounted this branch's test source into the candidate and exercised the identical candidate script at its package path. An earlier test used the image's packaged script copy; that was corrected before the final test.

Experiments (not release promises):
- Node compile cache: disabled import times 1,657 / 3,032 / 2,896ms, enabled 3,155 / 2,610 / 4,373ms on this shared host. No measured benefit; removed from the candidate and source Dockerfile.
- Initial candidate failed before Node because Windows file writes produced a CRLF shebang. Corrected the file to LF, added the narrow .gitattributes rule and rebuilt before live probing or deployment.
- Authorized live baseline probe: browser import 588ms, browser launch 1,164ms, navigation/join routine 19,134ms; warm-up failed because no camera was present. Browser closed immediately after the join routine; admission not confirmed.
- Corrected candidate live probe: entrypoint X11/audio-to-worker span 255ms; import 874ms; browser launch 1,595ms; navigation/join routine 27,795ms; audio-only warm-up succeeded. Shared memory was 2GiB, matching the real bot. Admission not confirmed. This result does not establish an end-to-end improvement over baseline.
- Same-container, same-browser sequential experiment: cold navigation/join routine 23,030ms; second navigation/join routine 14,422ms. Browser navigated to about:blank between attempts and closed afterward. No cross-user reuse or pooling was deployed.
- Pre-granted media permissions experiment: navigation/join routine 24,322ms. Failed requests in that sample were net::ERR_ABORTED, not evidence of DNS/connectivity failure. No demonstrated speed improvement; pre-granting was not added to source.

Verdict: camera dependence and fixed startup waiting are corrected. Five-second live request-to-admitted is still unmet. Keeping a browser running alone did not bring the observed navigation/join routine under five seconds. The next architectural question is whether one-use, per-meeting workers can prepare the Teams page before the join deadline while preserving invocation.v1, per-user isolation, observable readiness and guaranteed teardown. That pool/preparation mechanism has not been implemented or claimed as working.

### Second-iteration local deployment
Selected image: codex/vexa-bot:teams-startup-v2, digest sha256:c09436983b5ab182831a41a2da23b2c5ad31b41ba2da58b68e5b98340c1b1145. Its entrypoint and Teams join.js SHA-256 hashes matched this worktree. Runtime is running/healthy and confirms BROWSER_IMAGE=codex/vexa-bot:teams-startup-v2. UI 13000, gateway health 18056, and runtime health 18090 returned 200. No probe containers remain running; the temporary meeting-URL environment file was removed.
The additional final runtime-only Compose file is C:/Users/dipeshd/AppData/Local/Temp/vexa-teams-startup-0f85c189f34d43edb8b552a1348f1f80/compose.override.yml. To revert this iteration, recreate runtime using the prior Compose file chain and omit that last override; it selects codex/vexa-bot:teams-fast-join. This deployment does not claim faster Teams loading or confirmed admission from the short probes.


## Scheduled auto-join failure investigation
Expected: configured schedule dispatches at lead time using the same resolved backend as manual joins. Actual: row 9 scheduled for 18:00 UTC had auto_join=true; scheduler attempted 17:58:05 UTC and 18:03:05 UTC, both refused by the environment-only STT gate. Manual join at 18:03:22 UTC succeeded through the Settings-aware spawn path. Row 10 is scheduled for 18:15 UTC with auto_join=true. Plan: reproduce without a meeting; remove duplicate environment-only production validation in the scheduler; retain the shared request_bot validation and stamp per-row errors/backoff for missing configuration; run auto-join regressions; patch only the local meeting-api module and observe the next due sweep. No direct DB updates or schedule changes.

### Scheduled-join correction and live witness
Root cause: the scheduler's production STT guard inspected only environment capability state and rejected Settings-configured transcription before shared request_bot resolution. Corrected auto_join.py to delegate production transcription validation to request_bot and to record TranscriptionNotConfigured as a per-row failure with backoff. The injectable scheduler veto remains optional. Shared request_bot validation is still enforced.
Red: three new offline regressions failed before the patch. Green: 175 scheduler/recording/occurrence/wiring checks passed; broader manual-spawn/env-flag coverage passed 280 checks with one FastAPI/httpx deprecation warning.
Deployment: codex/vexa-meeting-api:auto-join-settings, digest sha256:6a34cd7bb5e663f97cc0f159059e141dbdcb6b45202d9265ca545beb545d7b67, based on the previously running meeting-api image. Only auto_join.py replaced. Additional Compose override: C:/Users/dipeshd/AppData/Local/Temp/vexa-auto-join-settings-d1d24a11d4f24703b73f20aadfa0d98e/compose.override.yml. Original schedule/data/configuration was not edited. Service healthy after restart.
Live scheduler witness: row 10 retained scheduled_at=2026-10-30T18:15:00Z and auto_join=true. Attempt stamped at 18:13:13.888 UTC and auto_join_spawned at 18:13:20.548 UTC (23:43:20 IST, before its 23:45 start). Bot vexa-mtg-10-e353ce6a used teams-startup-v2 and the row had no auto_join_error. This proves automatic dispatch, not admission.
Subsequent Teams failure: bot launched Node 18:13:20.916 UTC, first worker breadcrumb 18:13:37.561, navigation 18:14:07.248. Pre-join readiness timed out after 45 seconds at 18:14:55.381 on /light-meetings/launch; no Join button appeared; bot failed at 18:15:45.636 with join_failure. The scheduled invocation had exactly the same meeting URL and authentication mode as the earlier successful manual bot (credential values not logged). The expanded regression suite overlapped this run, so startup timing is not a clean performance comparison; resource contention was not measured. No successful live scheduled admission is claimed.
The follow-up was initially blocked because automatic approval review reported exhausted workspace credits. On user-requested continuation, approval succeeded. Isolated follow-up: import 546ms, browser launch 1,059ms; pre-join became ready around 13 seconds after navigation; join routine returned at 15,564ms with UI showing Connecting and a disabled Join now button. Thus the earlier pre-join timeout did not recur in that sample; admission had not yet been confirmed at teardown.

### Final isolated lobby observation after continuation
With regression tests no longer running, the same authorized test link reached pre-join in roughly 11 seconds. The final short probe imported in 421ms and launched its browser in 679ms. After Join, the page explicitly showed: Someone will let you in when the meeting starts. The Leave control was absent. A temporary probe matcher labelled this connecting because it did not include that exact Teams wording; the visible page text is the stronger evidence and indicates waiting for the host/meeting start. Total navigation plus join routine and the extra 20-second observation was 33,459ms. Browser closed and probe container removed afterward; no diagnostic probe containers remain running and the temporary URL environment file was removed.
Final scope: scheduled dispatch defect fixed and deployed; 280 relevant Python checks passed. Live automatic dispatch observed at 23:43:20 IST for the 23:45 IST meeting. Fresh isolated Teams lobby arrival observed. The previously scheduled bot itself failed during Teams loading, and a complete scheduled-to-admitted run is not claimed. The health of the local scheduler image was verified after the probes. No DB schedule modifications, commits or pushes were made.
