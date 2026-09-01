# PEANUT-SPLIT INCIDENTS — append-only, newest at the BOTTOM. Never rewrite history.
Format: date/time UTC · WHAT · EVIDENCE · SEVERITY · ACTION/PROPOSAL.

---

## 2026-08-18 03:10Z — day-one bootstrap findings

**1. Sentry OFF in prod (blind spot).** Code wires @sentry/nextjs + @sentry/node but no
DSN in Dokploy env/build args; sentry-hugo org has no split project. SEV: medium
(errors invisible except docker logs). PROPOSAL: create Sentry project, set
NEXT_PUBLIC_SENTRY_DSN build arg (web) + SENTRY_DSN env (api). Not actioned — needs
Hugo (env change = prod mutation).

**2. PostHog analytics OFF in prod (blind spot).** NEXT_PUBLIC_POSTHOG_KEY absent at
build → all analytics no-ops. SEV: low/medium (product decisions blind). Not actioned
— may be intentional (privacy stance in analytics.ts is deliberate). Question to Hugo.

**3. split-org-api idle/vestigial.** No Traefik router, zero requests in 7d of logs;
web app has its own Prisma+DB and serves everything. It still rebuilds+redeploys on
every push. SEV: low (waste, not breakage). PROPOSAL: retire or consciously keep.
Not actioned.

**4. Web deploy error 2026-08-17 14:28 (self-recovered).** Deployment "Merge
remote-tracking branch 'origin/main'" status=error on split-org-web; next push 14:36
green; site never down (kept previous image). Deploy-alert fired. SEV: info. Closed.

**5. FIXED (100%-obvious lane): shell injection + mangled message in
/root/split-org-deploy-alert.sh.** The commit title was interpolated into a bash
double-quoted python heredoc; backticks/$() in a commit message would EXECUTE AS ROOT
from cron (proven benignly: its own log shows `{title}: command not found` from the
Discord markdown backticks — the 08-17 alert posted with the title dropped). Fix:
untrusted fields now passed via environment variables; backticks in titles neutralized.
Original preserved at /root/peanutsplit-steward/split-org-deploy-alert.sh.orig-2026-08-18.
Tested: syntax, injection attempt (no execution), live no-op run. SEV of bug: high
(root exec from a git commit message — repo write access required, so realistically an
insider/compromised-account path). This is box tooling, not the sacred app.

**6. Steward process slip: two secrets echoed into the AI session transcript.**
(a) peanut-split web DB password (a regex meant to redact matched DATABASE_URL);
(b) the telegram bot token (selected Kuma's notification.config column wholesale).
Exposure: Anthropic-processed transcript only; neither secret is publicly reachable
(DB is docker-network-internal; telegram token already stored on-box). SEV: low
practical / rule breach per SECURITY-AUTHORIZATION.md. PROPOSAL: rotate the split DB
password at Hugo's convenience (Dokploy postgres env + both DATABASE_URLs, brief web
restart); telegram token rotation would touch openclaw — Hugo's call. Steward rule
adopted: never cat env/config blobs — always select named non-secret fields.

**7. Monitoring added (steward lane, reversible).** Kuma monitor 18
`peanutsplit.com (edge)` 60s → Discord (`discord-split`, new notification id 2) +
Telegram; verified beating. Detector cron /usr/local/bin/split-steward-alertd (*/5):
SVC-GONE/SVC-DOWN/CRASHLOOP/DISK → bus /var/log/split-steward-alerts.log + Discord
(60min/type rate limit). All branches synthetically tested. Kuma restart ~20s
(2026-08-18 03:31Z) — all 16 monitors resumed.

## 2026-08-18 04:15Z — RETRACTION of day-one findings #1 and #2 (Sentry/PostHog "OFF")

**Both were WRONG.** Dokploy stores build-time values in a separate `buildArgs` field;
I only inspected `env`. `buildArgs` on split-org-web carries NEXT_PUBLIC_SENTRY_DSN,
NEXT_PUBLIC_POSTHOG_KEY (+host), and verified in the RUNNING container's served bundle:
the DSN (org o4505827429187584) and the PostHog key are baked into .next chunks. Both
client-side telemetry systems are LIVE. ROADMAP.md confirms: PostHog project "Peanut
Split" (Squirrel Labs, id 234225), Sentry project `peanut-split`, keys as Dokploy build
args. Why the error was possible: `application.one` returns env and buildArgs as
separate fields and I generalized from env alone; the "no DSN in runtime env" check
was doubly misleading because NEXT_PUBLIC_* values are baked at build, never runtime.
Rule adopted: for Dokploy dockerfile builds, always read BOTH `env` AND `buildArgs`.

**What remains true:** (a) the steward has NO ACCESS to that Sentry org — it is not
hugo-personal (id 4511589139283968), likely Peanut's company org; error triage is
blocked on a read token or MCP access. (b) Server-side errors are deliberately
unreported (client-only Sentry by design — prod container relies on squid for egress;
comment in instrumentation-client.ts). (c) The idle api's SENTRY_DSN is unset — moot
while it serves nothing. STEWARD-STATE.md inventory items 4/5 corrected in place
(marked as corrected, not silently).

## 2026-08-18 12:05Z — POSTURE CHANGE: steward → SUPERVISOR (Hugo, permanent)

No direct fixes anymore, not even obvious ones; only write action is a PR to
peanutprotocol/peanutsplit for super-obvious zero-regression issues. All incidents →
this file + Discord one-liner. Discord route confirmed: /root/.split-discord-webhook
(on-box file; the app's own config/env has no Discord route — checked, names only).
NOTE: PR lane blocked — no gh CLI / GitHub API token on box; deploy key is read-capable
only for sure. Flagged in STEWARD-STATE.md for Hugo.

## 2026-08-18 16:20Z — PR lane OPEN (Hugo)

gh CLI installed + authed as chip-peanut-bot[bot] (contents+pull_requests on
peanutprotocol/peanutsplit); verified with `gh pr list`. Posture unchanged otherwise:
PRs only for clearly-obvious zero-regression fixes, never direct push to main.

## 2026-08-18 17:05Z — PR lane mechanism updated (Hugo)

`split-gh` wrapper replaces plain gh (which is now de-authed): fresh peanutsplit-scoped
chip-peanut-bot token per call, contents+pull_requests only. Verified: split-gh pr list
OK, plain gh logged out. Branch pushes stay on the deploy key. Posture unchanged.

## 2026-08-19 08:00Z — daily deep sweep: CLEAN

Edge 200 ×3 (84–115ms); 5/5 services 1/1, zero Failed tasks 24h; Kuma 18 green, 0 down
events; all 4 crons armed, watchdog no-op, bus empty (only the day-one synthetic line).
Deploys: 1 push (15:38Z "Give the app home a way back to the landing"), green both apps;
deploy-alert silent since fix. Web logs: 0 errors 24h (deploy-skew noise absent). API idle
as expected. Volumes vs baseline: rooms 4/24h (7d 16→20), expenses 5/24h (23→28),
settlements 1, members 38/7d, notif sends 1, audit events 14 — healthy, slightly up.
Feedback: still 1 (test row). Backups: both split DBs dumped+uploaded to R2 03:30
(peanut-split-db 316K, split-org-db 20K; 4 consecutive nights verified in R2). Disk back
to 64% — build cache pruned by someone else (28.8GB→2.7GB), not this supervisor.
Still blind: Sentry org token pending Hugo. No incidents; nothing posted to Discord.

## 2026-09-01 00:30Z — catch-up sweep covering the 2026-08-19 → 09-01 supervision gap

Supervisor was absent 13 days (no session); crons ran unattended throughout. Production
was NEVER down: Kuma monitor 18 recorded 0 down events across the gap, edge 200 now
(76–106ms), all 5 services 1/1, box uptime 9 weeks (no reboot). 11 deploys since 08-19,
**all green, zero errors**; last push 08-27 10:56Z, quiet since. Web logs across 14 days:
44 lines total, 1 deploy-skew "Server Action" line (known noise). API still idle.
Volumes healthy and growing: rooms 138→198 (27 last-7d vs 33 prior-7d), expenses
852→950 (56 vs 42 prior — up), settlements 9/14d, members 56/7d, push subs 9→11,
notification sends 35/14d. Backups verified nightly to R2 (peanut-split-db 390K on
08-31, retention pruning locals only after confirming the R2 copy).

**USER REPORT (real, unactioned — SEV: medium/UX).** 2026-08-23 16:35Z, feedback id
628e3cf3: *"Loading screen flickers, do proper loading animations instead"*.
Diagnostics: installed PWA in standalone display-mode, Android 10 Chrome 151 (armv81),
viewport 448×923 @ DPR 2.25, 4g/100ms RTT, Europe/Berlin — so not a slow-network
artifact. Second report 08-25 is praise, no action ("very cool product…"). PROPOSAL:
treat as a loading-state design fix (skeletons/persistent shell rather than a
remount-flash) — NOT taken as a PR: it changes what users see and needs design
judgement, which fails the "zero regression risk" bar. Hugo's call.

**Detector noise found (unactioned).** The gap's bus lines are almost all
`SVC-DOWN … replicas=2/1` — that is a *rolling deploy in progress* (new task up while
old drains), not an outage; every one coincided with a successful deploy. My detector
treats anything ≠1/1 as down. PROPOSAL: only alert when the running count is <desired
(e.g. 0/1), leave n>desired alone. Not applied — monitoring changes now route through
Hugo under supervisor posture.

**Disk (box-level, already known to Hugo).** Bus shows root fs climbing 92→96% on
08-26/27 then relieved; now 76% and rising again. Per /root/CLAUDE.md this alert
"names the victim, not the cause" — flife/build-cache churn fills the disk and pages
the payments app. No peanut-split impact observed in the window. No action by me.

**Record relocation noted.** INCIDENTS.md/STEWARD-STATE.md moved into
repo/ops/steward/ on 08-19 (MOVED.md + peanutsplit-steward-sync cron */10, last push
08-19, no failure sentinel). This entry written to the new location.
Still BLIND: no Sentry read token for the Peanut org (`/root/.split-sentry-read-token`
absent) — 13 days of client-side errors unreviewed.

## 2026-09-01 00:45Z — peanutsplit-steward-sync reports a FALSE GREEN while the log is stranded

**SEV: medium (supervision integrity — the mechanism that guarantees my record reaches
the repo lies about success). Not a production issue; peanut-split itself is unaffected.**

Sequence, all observed tonight:
1. 02:30:05 the cron staged + committed my catch-up entry, then `git push` FAILED
   (transient — cause unidentified; a `--dry-run` push from the same repo/credentials
   succeeded ~2 min earlier AND again after). It correctly wrote the sentinel and posted
   the red "log is not reaching the repo" alert to Discord.
2. 02:40:02 the next run found **nothing left to stage** (the change was already
   committed at 02:30), took the `git diff --cached --quiet` branch, cleared the
   sentinel, logged `RECOVERED (no changes to push)` and posted the **green**
   "reaching the repo again" to Discord.
3. Truth at that moment, and still: `main...origin/main [ahead 2]`; GitHub's copy of
   ops/steward/INCIDENTS.md is 6967 bytes (the 08-19 version) vs 9622 locally. The
   entry is stranded and no further push will ever be attempted for it, because that
   branch only retries when there is something NEW to stage.

**Root cause.** The recovery test asks "did I have anything to stage?" when the
invariant that matters is "am I in sync with origin?". A committed-but-unpushed state is
invisible to it, so a transient push failure converts into a permanent silent gap that
self-heals only by luck (the next unrelated log edit carries the old commits along).

**PROPOSED FIX (not applied — this is box tooling, `/usr/local/bin/peanutsplit-steward-sync`,
outside the repo, so it is not PR-able and monitoring changes route through Hugo):**
in the "nothing staged" branch, before clearing the sentinel, verify sync and push if
behind — e.g.
    if [ -n "$(git log --oneline origin/main..HEAD)" ]; then
        git push -q origin HEAD:main || fail "push failed (retry of stranded commits)"
    fi
and only then treat it as RECOVERED. Equivalently: gate the green on
`git rev-parse HEAD` == `git rev-parse origin/main` after a fetch.

**Status of the stranded entry:** this very append gives the cron a legitimate staged
change, so its next run should push commits 0a36aec + c0a90d5 along with it. Verified
after the fact below.
