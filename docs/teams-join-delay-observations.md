# Teams join delay investigation

Expected: identify the slow stage, reproduce without a meeting, then prove the correction with the same browser fixture.

Plan: correlate timestamps; reproduce an AV confirmation covering Join now in Chromium; dismiss the confirmation before clicking Join now; run module checks and record proof limits.

Actual, original meeting (2026-10-29 UTC): request 15:00:01.522; navigation 15:00:20.227; pre-join ready 15:01:00.789; join click attempted 15:01:06.008; blocked click timed out 15:01:36.122; confirmation dismissed and join re-clicked by 15:01:39.502; awaiting admission 15:01:42.240; active 15:02:17.900. Request to active: 136.378 seconds.

Sources: timestamped Docker logs for vexa-mtg-3-b1e34d18 and vexa-v012-meeting-api-1. No meeting passcode or transcript content is included here.

Verdict: the 30-second blocked click is avoidable in the Teams join adapter. Startup, Teams loading and admission time are separate observations. The logs do not establish what controlled the final admission wait. P19 requires proof at the altitude of the claim: a local browser fixture proves actionability behavior, not live Teams latency.
