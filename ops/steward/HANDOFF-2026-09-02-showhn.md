# Handoff from Hugo (via his local Claude session), 2026-09-02 ~12:30Z

Hugo is preparing a Show HN for peanutsplit.com, target today 13:00-14:00 UTC or Tue 2026-09-08.
HN readers will try to break the money math in the first hour (JPY, 3-decimal currencies,
huge amounts, 0.01 three-way splits) and will try the self-host path. This handoff opens a
bounded fix lane for that. It is ordered by Hugo, so it widens the "observation only" posture
for the four tasks below and nothing else. PR only, never push main. No prod env changes.

## Task 1 — JPY / 0-decimal hero balance (validate, then fix if real)

peanutsplit CLAUDE.md "Known-open issues" says: "`formatMoney` assumes 2 decimals until
`/split/currencies` loads, so a JPY room can flash a hero balance 100x off." That note was
written against the old apps/api path. apps/web now has a bundled `src/lib/currency-catalog.ts`
with per-currency `decimals`, and `money.ts` is BigInt-based. Determine whether ANY live
apps/web surface (room hero balance, expense list, recap, share image, push text) can render a
0- or 3-decimal amount with the wrong scale, even briefly, before `useCurrencies()` resolves or
when the catalog entry is missing. Read the code; run the web unit tests; add a failing test
first if you find it. If real: fix, test, PR. If not real: say so with evidence.

## Task 2 — 2^53 precision note

Same list says `convertToBaseMinor` (apps/api) loses precision past 2^53. Confirm apps/api is
vestigial (Dokploy `split-org-api-uuwwxp`, no Traefik router, zero traffic — your own
inventory says so). Do NOT fix vestigial code. Confirm apps/web has no equivalent Number
round-trip on the money path (`money.ts` looks BigInt-only; `minorToExactNumber` guards).

## Task 3 — make CLAUDE.md truthful

Whatever Tasks 1 and 2 find, update the "Known-open issues" list in peanutsplit CLAUDE.md so
it describes the live product (remove or re-word the two lines, note apps/api is off-path).
Same PR as Task 1 if there is a fix, otherwise its own small PR.

## Task 4 — clean-machine self-host smoke (report only, no fix)

docs/current/SELF-HOSTING.md and the rights register both say the clean-machine
`docker compose up --build` smoke test is still an open publication-gate item. Run it:
fresh clone of the PUBLIC repo at main into a throwaway dir (not the deploy checkout), follow
the "Baseline" steps in SELF-HOSTING.md literally, on a random high port, `nice`d. Report:
does it come up, does http://localhost:<port> create a room, exact error text if not. Tear
everything down after (containers, images you built, the dir). Skip and say so if disk is
above 85% or the box is under load. Do not fix anything here; a doc PR for a wrong step is
fine.

## Task 5 — HN tester scenarios

Check whether the web unit tests already cover: JPY equal split, BHD (3 decimals), a
1,000,000,000 amount, 0.01 split three ways, percentage split that does not sum to 100. Do not
add speculative code. Add a test only where it exposes a real defect, and report the gaps
otherwise.

## PR mechanics

`split-gh` as usual. Every commit ends with:
    Ordered-By: Hugo0
    Order: https://github.com/peanutprotocol/peanutsplit/blob/main/ops/steward/HANDOFF-2026-09-02-showhn.md
(this file; copy it into ops/steward/ in the same PR so the link resolves). Keep each PR
minimal and independently mergeable. Do not touch Konrad's surfaces beyond the fix line.

## Reporting

Append one INCIDENTS.md entry per task outcome, post the usual Discord one-liner, and leave a
short status summary in this session so Hugo can read it when he checks in. If you can finish
Task 1 and 3 before 13:00Z today, say so loudly on Discord; that decides whether he posts
today or next Tuesday.
