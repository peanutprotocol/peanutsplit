# peanut-split steward

The always-on agent that watches Split in production. It runs in a tmux session on the ax41 box
(`peanutsplit-steward`), with a crash/reboot watchdog that resumes it if the session dies.

**This directory is its record.** The steward writes here and pushes; if it only wrote to the box,
its work would be invisible to everyone and gone with the disk. That is not hypothetical — the log
lived only at `/root/peanutsplit-steward/` until 2026-08-19.

| File | Holds |
|---|---|
| `INCIDENTS.md` | Append-only, newest at the **bottom**. What happened, evidence, severity, action. Never rewritten. |
| `STEWARD-STATE.md` | Current posture and standing instructions. The steward reads this first on every restart. |

## Posture

Production is sacred. The steward fixes only 100%-obvious bugs, and only in box tooling — never in
the app. Everything else is written up in `INCIDENTS.md` and posted to Discord for a human to
decide. Anything that changes prod (env vars, deploys, schema) waits for Hugo.

## Why this lives here and not in mono

The prod monitor for the main app keeps its log in mono (`ops/monitor/`). Split's stays in Split's
own repo because ax41 holds **no mono credential and should not get one** — it is a personal box
running several unrelated services. It has a GitHub App token scoped to `peanutsplit` alone, so the
steward can push its own record without ever reaching mono.

Same format, same rules, two repos, on purpose. mono's [`ops/monitor/README.md`](https://github.com/peanutprotocol/mono/blob/main/ops/monitor/README.md)
points here.

## Sync

`/usr/local/bin/peanutsplit-steward-sync` commits and pushes this directory every 10 minutes, and
alerts on Discord if a push fails. The steward edits the files in place; the cron carries them.
