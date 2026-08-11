# PWA install and retention funnel

Installation is not Peanut Split's activation event. A URL already delivers the
product; adding it to a device only reduces the cost of coming back. The automatic
offer therefore follows demonstrated value. The Device settings action remains available
from first use: iOS has its Home Screen steps, browsers without a live one-tap event get
portable menu guidance, and Chromium upgrades that same row when its prompt arrives.

## Why the automatic offer waits

Before a useful balance exists, installation asks for attention and trust in exchange
for an abstract future benefit. On iOS it also asks somebody to complete a manual
browser workflow. That interruption competes with the jobs that create value: adding a
real expense and putting the room link in the group chat.

After a room has a durable shared balance and the link has actually been shared, the
same offer has a concrete promise: keep this live split one tap away. An invitee who
returns to an active mature room has independently demonstrated the same repeat-use
need. Installation can reduce return friction for either journey; it cannot create that
need before activation.

This is why install count is diagnostic, not the objective. A future causal experiment
should use incremental D7 return to a meaningful active-room action, with first-balance
completion, successful sharing, bounce, and prompt dismissal as guardrails. It must
randomly assign policies by intent to treat; comparing installers with non-installers
would mostly measure self-selection.

That experiment assignment/linkage is not implemented today. Current events are
aggregate diagnostics without product, room, or member identifiers. In particular,
WebKit does not copy PostHog's
localStorage identity into the Home Screen container, so the Safari exposure and the
standalone `pwa_ios_install_handoff_completed` event cannot be joined into a person-level
funnel or D7 cohort. A future implementation may carry a low-cardinality policy arm
through the transient handoff, but must not add a unique device or room identifier.

## Device-local journey rules

No server-side creator/invitee role is introduced. Roster members are ledger
participants, not accounts, and install analytics never contain a member, room slug,
name, amount, or currency.

- A device that created the room qualifies after both a durable shared balance and a
  completed native/package clipboard share or direct room-link copy, in either order.
- A device that opened an existing room can qualify the same way, by completing a new
  server-confirmed contribution after the room was already mature, or by returning to an
  active mature room after at least 30 minutes. The expense that first creates a balance and
  an offline-queued write do not count as a later contribution.
- A passive first visit, an empty/no-debt room, and a settled room never receive an
  automatic offer. The settings action stays available throughout: it uses a native
  prompt when exposed and otherwise explains the browser-menu route.
- The post-activation share owns the first ask. Installation waits until that drawer and
  every other blocking surface are closed, then waits for a short quiet interaction
  window.
- Skipping the post-activation share defers installation; a successful share changes the
  footer to Done and allows the offer after close.
- Showing an automatic offer starts a global 24-hour cooldown. Explicit dismissal or a
  browser decline uses the longer exponential backoff. Installed/standalone state wins
  over every trigger.
- Closing the manual iOS instructions quiets automatic offers for 30 days because Safari
  exposes no install-result event; the settings action remains available throughout.

The journey state is localStorage-only and room-scoped. It describes what this browser
did; it is not synchronized or mapped to a server device. Raw origin/timestamps never
leave the device. Prompt exposure measures only closed `trigger` and `delivery`
categories; dismissal also measures a closed `reason`. Opening the manual browser
instructions measures only the closed `settings` surface, never the browser, room, or
member. Explicit Forget removes the identity and journey record;
passive recent-list eviction prunes the journey record without revoking member proof.

## iOS installation handoff

[WebKit 17.2+ copies cookies, but no other local storage, into a newly installed iOS or
iPadOS web app](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/). Earlier
versions and any failed handoff fall back to reopening the room link once. Copying all
room state to the server would turn an accountless product into an implicit account and
increase the credential blast radius. Instead, opening the iOS instructions prepares a
narrow, expiring bridge:

1. The browser creates a 24-hour handoff for the current room and, when available, its
   active member proof. The raw random capability exists only in a Secure, Strict,
   host-only HttpOnly cookie; the database stores domain-separated hashes of the handoff
   and the exact member proof. A removed-and-restored member's rotated proof therefore
   cannot be granted by an older handoff.
2. A non-secret ready cookie tells an installed `/app` launch to try restoration. An
   ordinary browser tab never redeems it.
3. Redeem returns only current room display fields and an active member identity. It is
   idempotent so a process kill or storage failure cannot consume the bridge too early.
4. The installed context writes and reads back its recent room and identity, then enters
   the room immediately. Acknowledgement deletes the transient row and clears the cookies
   in the background; a lost ACK is safe to retry on the next launch.

The bridge stores no device ID, settings, analytics ID, room ledger, or cross-room map.
It creates no durable server identity. Access always expires after 24 hours. Physical rows
are removed on ACK, expired redemption, preparation/boot sweeps, or the hourly runtime
sweep, bounding quiet-deployment retention to the TTL plus one hour. Room deletion
cascades immediately, and a removed or proof-rotated member degrades to a room-only
restore.

Rollback to an image predating this feature must first purge the additive table with
`DELETE FROM "split"."InstallHandoff";`. The older image safely ignores the empty table;
skipping that step would also skip its cleanup worker.

## Release evidence

Automated gates cover the pure eligibility matrix, prompt/drawer ordering, share success
versus abort/failure, install-state precedence, storage denial, cookie flags, origin
checks, expiry, idempotent redeem/ack, member removal, replay, and a two-browser-context
restore where only cookies cross contexts.

Automation cannot prove the operating system's install-time cookie copy. A physical
iPhone Safari → Add to Home Screen → first launcher open remains the final evidence for
calling the iOS handoff production-verified.
