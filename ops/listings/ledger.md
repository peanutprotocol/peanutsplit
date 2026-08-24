# Split directory listings — ledger

Scope: **free directories only** (decided 24 Aug 2026). Paid placements and a Product Hunt launch are out of scope for this pass.

Blocker: needs a mailbox I can read for verification links.

- `konrad@peanut.me` OAuth token is `gmail.send` scope only (probed 24 Aug, `messages.list` -> 403 insufficient scopes). Deliberate, per founder-email SECURITY.md.
- `intern@peanut.me` (Squirrel Labs Ltd runs both peanut.me and peanutsplit.com, so it is a valid same-entity address for ownership claims). Two paths tried and failed:
  - Web sign-in via Playwright -> **CAPTCHA** at the identifier step. Google detects the automated browser. Not defeating a bot-check.
  - IMAP with the account password -> `[AUTHENTICATIONFAILED] Invalid credentials`. Expected: Workspace has disabled password-based IMAP since 2024.
- **Minimal unblock: an App Password** for intern@peanut.me (needs 2SV on the account, then myaccount.google.com/apppasswords). 16 chars, works over IMAP immediately, single-purpose, revocable. No GCP project, no service account, no domain-wide delegation.
- Second blocker: the Playwright profile `~/.claude-playwright-profile` is held by another concurrent Claude Code session. Not killing it mid-work; needs that session closed or the MCP server run with `--isolated`.

Confirmed 24 Aug: AlternativeTo and SaaSHub both require a verified account before any submission, so the mailbox gates the whole campaign, not just a few targets. SaaSHub's own free tool then fans out to ~108 further sites.

## Bot-wall scan — 24 Aug 2026 (live, via Playwright)

Every target probed with a real browser. This is the deciding constraint, not copy or assets.

| Directory            | Result                                                                                     | Automatable?                       |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| AlternativeTo        | Cloudflare 403 on every page, incl. public ones                                            | No — hard block                    |
| Peerlist             | Cloudflare 403 + Turnstile                                                                 | No                                 |
| MicroLaunch          | Cloudflare 403 + Turnstile                                                                 | No                                 |
| Launching Next       | Cloudflare 403 + Turnstile                                                                 | No                                 |
| SaaSHub              | Loads, but registration form carries interactive hCaptcha (sitekey 4db4023c…, size normal) | No                                 |
| Fazier               | 200, no wall on landing                                                                    | Maybe — submit form not yet probed |
| DevHunt              | 200, no wall on landing                                                                    | Maybe — submit form not yet probed |
| pwa.directory        | 200, no wall on landing                                                                    | Maybe — submit form not yet probed |
| Indie Hackers        | 200, no wall on landing                                                                    | Maybe — submit form not yet probed |
| awesome-pwa (GitHub) | PR-based, no bot wall                                                                      | Yes — gh CLI                       |

**Read:** 5 of 9 are defended specifically against automated bulk submission, which is exactly the shape of this campaign. The Cloudflare 403s are browser-fingerprint blocks, so a human reading a challenge aloud does not help — those need a genuine human browser session.

**Consequence:** the high-value half of this list is manual by construction. Best division of labour is Konrad doing ~4 walled targets in his own browser (~30 min, all copy and assets pre-staged in listing-kit.json), while automation covers the open targets and GitHub list PRs.

## Google account notes

`intern@peanut.me` sign-in works but costs a human-read CAPTCHA each time, and the domain enforces 2SV from **25 Aug 2026**. Browser-based mail access is therefore a one-day asset. Domain-wide delegation with `gmail.readonly` remains the durable fix and is unaffected by 2SV.

## Submissions

| Directory     | Date       | Tier            | Status                          | Confirmation                                                                                                                    |
| ------------- | ---------- | --------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| pwa.directory | 2026-08-24 | Standard (free) | **Submitted — in review queue** | Email to intern@peanut.me 15:34, "We received Peanut Split — here's what happens next". Human review, stated SLA under 4 weeks. |

Canary details: category `Finance & Business`, description 294/300 chars, screenshot `https://peanutsplit.com/og-default.png`, honeypot `website` left empty, `tier=standard` verified before submit (Fast-Track is EUR 49 — not used).

**Pipeline proven end-to-end:** form fill -> submit -> confirmation received in the intern mailbox. This is the loop to repeat.

Note: Konrad enrolled a **passkey** as the 2SV factor (Google alert 15:07). Passkeys are device-bound, so future sign-ins from this browser need him present. Current session stays valid until it expires — treat it as one-shot.
| pwa.com | 2026-08-24 | Free | **Failed — their bug** | Account created, full submission filled and both images attached. Submit fails on their own backend: `POST original-respect-767425b39e.strapiapp.com/api/upload` -> 403 ForbiddenError. Dashboard confirms nothing saved. Their Strapi upload permissions are misconfigured; not fixable from our side. |

pwa.com quality note: `/about`, `/contact`, `/terms`, `/privacy`, `/guidelines`, `/newest`, `/featured`, `/api-docs` all return 404. It is a shell site with a broken submission pipeline — low value even if the bug were fixed. Recommend dropping unless they fix it.

## Motion split (revised 24 Aug)

Directory _submission_ is a thin seam: most good directories are walled, and the open ones are often half-built. The higher-value motion for Split is **editorial inclusion** — the "best Splitwise alternatives" comparison posts that already rank:

- getsplitease.com/blog/best-splitwise-alternatives-compare-top-bill-splitting-apps
- areweeven.com/blog/best-splitwise-alternatives
- spliit.pro/blog/best-splitwise-alternative-2026
- expensessplit.com/splitwise-alternatives.html
- goodshare.app/blog/goodshare-vs-splitwise

These are human-edited lists reached by _asking_, not by submitting. No bot walls, real referral traffic, and the outreach is genuinely automatable through the existing mail persona stack.

## Per-target notes (24 Aug recon)

- **pwa.directory** — open form, no account. Fields: URL, name, category, contact email, description <=300 chars; screenshots optional. Free standard review, reply 2-3 days. (EUR49 fast-track — skip, out of scope.) Gate criteria: valid manifest.json, registered service worker, HTTPS, no broken core flow. Split passes all four.
- **Uneed** — no account to start; it scrapes the URL, then asks for signup to save. Fields at entry: product name + URL.
- **SaaSHub** — free, but requires a verified product. Once verified, its own free tool fans out to ~108 further sites — highest leverage single target.
- **AlternativeTo** — account required before the add-item form. Position as a Splitwise alternative; highest-intent target on the list.

## Social card

Replaced 24 Aug (peanutsplit `59d0297`). The old `og-default.png` painted Knerd solid black (forbidden by the brand book and `Title.tsx`), had a silent system-font fallback in its body line, and sat on a yellow ground when the hero band is pink.

New card is built from `globals.css` values, not guesses: Roboto Flex 950 / `-0.065em` headline, the `.pass-link-chat-frame` panel treatment, real generated avatars captured from the live hero. Line is Split's own hero subtitle — "better accounting makes better friends".

**Action:** the pwa.directory submission (24 Aug) references `https://peanutsplit.com/og-default.png`. Same URL, new bytes, so their reviewer sees the new card automatically — no resubmission needed.
