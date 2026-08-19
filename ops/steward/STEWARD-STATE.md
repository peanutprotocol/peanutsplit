# PEANUTSPLIT SUPERVISOR — STATE

Maintained by the box-resident SUPERVISOR session. Started 2026-08-18 (as steward;
re-titled SUPERVISOR same day, permanent). Peer: /root/wordle/STEWARD-STATE.md ·
playbook: /root/STEWARD-HANDOFF.md (§1 authority table DOES NOT apply here).

## Posture (Hugo, 2026-08-18 — SUPERVISOR, permanent, overrides charter)
- **No direct fixes, ever — not even the obvious.** The ONLY write action against the
  app is a PULL REQUEST to peanutprotocol/peanutsplit, and only for clearly
  super-obvious issues with ZERO regression risk. Everything else: observation only.
- Every incident/error: append to INCIDENTS.md AND post to Discord — concise one-liner
  + link to the file/log with detail (per Hugo's earlier style rule; no status posts).
  Route: webhook file `/root/.split-discord-webhook` ("Supervisor🔥", verified live;
  found on-box — the app's own env has no Discord route). Already wired through
  split-steward-alertd, split-org-deploy-alert.sh, and Kuma notification id 2.
- **PR lane OPEN (Hugo, 2026-08-18, updated same day):** use **`split-gh`** exactly like
  gh — it runs as `chip-peanut-bot` minting a fresh peanutsplit-scoped token per call
  (contents+pull_requests write, peanutsplit ONLY). **Plain `gh` is NOT authed** — always
  `split-gh`. Branch pushes use the existing deploy key remote
  (/root/.ssh/split_org_deploy). Verified: `split-gh pr list` works, plain gh logged out.
  Rules: PR only for a clearly-obvious, FULLY-VERIFIED fix; NEVER push main; everything
  else stays an incident note + Discord one-liner.
- Supervisor's OWN files (this file, INCIDENTS.md, memory, session file) stay
  maintainable — they are the mandate, not the app. Existing monitoring crons keep
  running; changes to them now go through Hugo too.
- Never /clear; use /compact.

## Inventory (verified 2026-08-18)
1. **Serving path** — Dokploy project `peanut-split` (fsB-rHiZqdFMrUAHsBXFJ), env production
   (JVQQq6cbwdLXtoYJ16mEK). Swarm services, 1 replica each:
   - `split-org-web-mrlxer` (Next.js, port 3000) = THE product. Traefik domains:
     **peanutsplit.com** (200), www.peanutsplit.com + split.peanut.me (308 → apex).
     applicationId `EG8vfsELFgnHoJQ05bIeK`.
   - `split-org-api-uuwwxp` (Fastify, port 5051) — **internal-only, no Traefik router,
     ZERO request traffic in 7 days of logs. Vestigial but running.** applicationId
     `MdcQ9UG95Pv_bI84rcLcL`. Has /health.
   - `split-egress` (squid proxy) — outbound proxy for web's push/email/scan calls.
   - No container healthchecks defined on web/api (health=none).
2. **Deploy path** — `/root/split-org-autodeploy.sh` cron */2 polls GitHub
   `peanutprotocol/peanutsplit` main (ssh key /root/.ssh/split_org_deploy), triggers
   Dokploy deploy of BOTH apps on any push. NO docs-only filter (every commit rebuilds
   both apps — noted, not actioned). Red-build alert: `/root/split-org-deploy-alert.sh`
   cron */2 → Discord. Deploy logs: /etc/dokploy/logs/<app>/. Rollback: Dokploy
   application.redeploy of a previous deployment (untested — open question).
3. **Data** — web: Postgres `peanut-split-db-r5jnwf` db `peanut_split` schema `split`
   (16 tables: Room, Expense, ExpenseShare, Settlement, Member, FeedbackReport,
   RoomAuditEvent, …). api: `split-org-db-fzqxge` db `peanut_split` schema `app`.
   Read-only access: `docker exec <db> sh -c 'psql -U "$POSTGRES_USER" -d peanut_split ...'`
   — SELECT only, per posture. Backups: nightly /root/backup-dbs.sh (03:30) dumps every
   Postgres container → R2 `hetzner-db-backups/ax41/`; split DBs included (they are
   containers). **Restore never drilled for split specifically.**
4. **Error reporting** *(corrected 2026-08-18, see INCIDENTS retraction)* — client-side
   Sentry IS LIVE: NEXT_PUBLIC_SENTRY_DSN in Dokploy buildArgs, verified baked into the
   served bundle. Project `peanut-split` in org o4505827429187584 (NOT hugo-personal —
   likely Peanut's org). **Steward ACCESS is blind** — no token for that org. Server-side
   errors deliberately unreported (client-only by design). Fallback: docker logs.
5. **Analytics** *(corrected 2026-08-18)* — PostHog IS LIVE: key + eu.i.posthog.com host
   in buildArgs, verified in bundle. Project "Peanut Split" (Squirrel Labs, id 234225).
   **Steward has no PostHog access** — product metrics via read-only DB queries for now.
6. **User voice** — `split.FeedbackReport` table (1 row total, a test). Check each sweep.
7. **Uptime** — Kuma monitor id 18 `peanutsplit.com (edge)`, 60s, notifies Discord
   (notification id 2 `discord-split`) + Telegram (id 1). Verified beating 2026-08-18.
8. **Resources** — shared box (see /root/CLAUDE.md): wordle prod, flife, Dokploy apps.
   Disk 64%, RAM 27G available at survey. Steward may not run heavy jobs un-safeboxed.
9. **Secrets** — Dokploy env (VAPID keys, SPLIT_AUTH_SECRET, OneSignal, OpenRouter,
   PEANUT_WEBHOOK_SECRET), /root/.split-discord-webhook (0600), deploy ssh key.
   Never print. (Two transcript slips on day one — see INCIDENTS 2026-08-18.)

## Detection layer
- **Kuma** (edge http, 60s) → Discord + Telegram on down.
- **`/usr/local/bin/split-steward-alertd`** cron */5: SVC-GONE / SVC-DOWN (replicas≠1/1
  on web, api, both DBs), CRASHLOOP (>2 Failed tasks/hour — Shutdown from clean deploys
  deliberately not counted), DISK (≥92%). Bus: /var/log/split-steward-alerts.log
  (append-only). Discord rate limit 60min/type, state /var/lib/split-steward/.
  All branches synthetically tested 2026-08-18.
- **`/root/split-org-deploy-alert.sh`** cron */2: red Dokploy build → Discord ping.
  (Steward-fixed 2026-08-18: shell-injection via commit title, see INCIDENTS.)
- **Dead-man switch: none for this steward yet** (wordle steward's covers box-level).
  Open question below.

## Baselines (2026-08-18, read-only DB)
rooms 138 total / 16 last-7d · expenses 852 total / 23 last-7d / 1 last-24h ·
settlements 4 last-7d · members 235 · push subs 9 · feedback 1 (test row).
Edge latency ~60-110ms, 200. Small but genuinely active product.

## Known noise
- Web logs: `Failed to find Server Action "x"... older or newer deployment` — Next.js
  deploy skew (stale client tab posts to new server). ~4/24h. Benign at this volume.
- One web deploy error 2026-08-17 14:28 (Merge commit) — next push 14:36 built fine;
  alerter caught it. Resolved.

## Open questions for Hugo
1. Sentry access: a read token (or MCP) for the org holding project `peanut-split`
   (o4505827429187584) so the steward can triage errors. Suggested drop:
   /root/.split-sentry-read-token (0600).
2. PostHog access: read key for project 234225 if steward should watch product
   metrics; otherwise DB-derived volumes remain the only analytics channel.
3. The idle `split-org-api` + its DB: keep running, or retire? (Costs little; but it
   autodeploys on every push and is dead weight. Peanut webhooks can't reach it anyway
   — no public router.)
4. Rollback path untested; OK to dry-run a redeploy-previous on a quiet moment, or
   leave until needed?
5. Dead-man switch for THIS steward wanted, or is Discord/Kuma independence enough?

## Cadence
6-hourly shallow sweep (bus, logs, feedback, Kuma, deploy log) · daily deeper look
(DB volumes vs baseline, Dokploy deploy history, disk/RAM, this file refreshed).
Log entries → INCIDENTS.md (append-only).
