# PWA install and retention funnel

Installation is not Peanut Split's activation event. A URL already delivers the
product; adding it to a device only reduces the cost of coming back. Install is therefore
always discoverable in Device settings and becomes the room's promoted fallback CTA only
when no temporary product journey needs that space. iOS has its Home Screen steps,
browsers without a live one-tap event move to Split's canonical, slug-free install page,
and Chromium uses its native prompt as soon as that prompt is available.

## One guidance slot

The room chooses one optional guidance owner in this order: identity, recovery,
post-activation Share, an active form or drawer, empty-room activation, latecomer review,
a newly reached All settled moment, an achievement, then Install. Persistent utilities
such as Add expense, Settle up, header Share and Settings do not consume the slot.

This protects activation directly without making a particular local history event a hard
install prerequisite. A browser opening an already-useful room should not have to share
again, contribute a second expense, or leave for 30 minutes merely to discover that Split
can live on the device. Conversely, an empty room keeps its Share/Add actions and never
replaces them with Install.

The promoted card is inline above the ledger rather than fixed over the primary room
controls. A temporary owner hides it; after that owner closes and the interaction is quiet,
the same card returns without recording a second exposure. A dismissal or browser decline
is different: it applies the global backoff while Device settings remains available.

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

## Device-local promotion rules

No server-side creator/invitee role is introduced. Roster members are ledger
participants, not accounts, and install analytics never contain a member, room slug,
name, amount, or currency.

- A loaded room with a resolved active device identity promotes Install whenever the
  guidance resolver reaches its fallback slot. A first visit to an existing room is enough;
  there is no balance/share/contribution/return eligibility gate.
- Empty-room Share/Add, identity recovery, stale or pending writes, open sheets/forms,
  latecomer correction, achievements, and the fresh All settled transition take priority.
- Reaching All settled suppresses Install for the rest of that mounted celebration. A later
  visit may show it with next-trip copy because the transition is over.
- Skipping post-activation Share, saying Not now to latecomer review, or dismissing an
  achievement defers the fallback for 30 minutes. A completed meaningful action may clear
  that defer.
- A native or clipboard share plus durable balance, a later mature contribution, and a
  deliberate mature return remain local attribution signals. They can explain the context
  of an exposure, but the non-persisted `quiet_slot` reason covers the ordinary fallback.
- Chromium uses its native prompt when available. Otherwise the room CTA and Device row
  navigate to the canonical `/app?install=1` surface. That page is titled `Split`, contains
  no room slug, and distinguishes Chrome's manifest-backed **Install app** action from
  **Create shortcut**, which must not be used as an equivalent. The original room URL is
  retained only in this tab's sessionStorage so it can be copied and reopened once if a
  browser switch does not carry the room.
- Rendering an automatic offer alone does not suppress a later quiet slot. Explicit dismissal or
  a browser decline uses the exponential backoff. A healthy canonical standalone app stays
  installed even if an unusual late Chromium prompt appears; an unmarked standalone room stays on
  the separate repair path so Split never leaves a room-named icon behind or counts it as ordinary
  acquisition. Outside standalone display, a live Chromium prompt uses the native install action.
- Reading or leaving install help is not a dismissal and creates no backoff. The retired
  manual-help snooze and any dismissal state it contaminated are cleared once on upgrade;
  only the explicit **Not now** action or a native browser decline suppresses promotion.
- A PR11-era room shortcut can also launch standalone while carrying the room's title and URL.
  A canonical standalone `/app` launch records a versioned local marker; an unmarked standalone
  room gets a one-time, conditional **Replace the old room icon** card. Device settings keeps the
  same check reachable even after dismissal or marker ambiguity. Repair never claims it can
  uninstall or force-open a browser: it copies the original room link locally and tells the person
  to remove only a room-named icon, reopen that link in a supported browser, and continue only when
  the install sheet says **Split**.

The journey state is localStorage-only and room-scoped. It describes what this browser
did; it is not synchronized or mapped to a server device. Raw origin/timestamps never
leave the device. Prompt exposure measures only closed `trigger` and `delivery`
categories; dismissal also measures a closed `reason`. Opening manual browser instructions
measures only the closed `auto`, `settings`, or direct `app` surface, never the browser,
room, or member.
The conditional legacy-shortcut check is excluded from these install-promotion events so an
already-standalone visit cannot inflate the acquisition funnel.
Explicit Forget removes the identity and journey record;
passive recent-list eviction prunes the journey record without revoking member proof.

## iOS installation handoff

[WebKit 17.2+ copies cookies, but no other local storage, into a newly installed iOS or
iPadOS web app](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/). Earlier
versions and any failed handoff fall back to reopening the room link once. Copying all
room state to the server would turn an accountless product into an implicit account and
increase the credential blast radius. Instead, choosing the room's iOS install action
prepares a narrow, expiring bridge and then opens the canonical `/app?install=1` steps:

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

Automation also cannot remove or inspect an Android launcher icon. A physical regression must
cover a pre-fix room-named shortcut: it receives the conditional check, preserves/copies the
original room link, can be replaced from Chrome only when the sheet says **Split**, and the new
icon launches `/app` rather than the room URL.
