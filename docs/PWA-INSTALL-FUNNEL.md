# Notifications, PWA installation, and return visits

An active shared room offers notifications in its existing inline guidance slot.
The offer uses the same room notification control and copy as Settings. Installation
remains available in Device settings and becomes a later step when notifications
are already enabled. Neither action blocks joining, sharing, or recording an expense.

## Connected setup

- After joining an active room or reaching its first shared balance, a proven member
  can enable notifications in the room. Share and other active tasks retain priority.
- Supported Android and desktop browsers request permission only when the person
  taps the notification switch. Success requires a saved server subscription for
  this room; browser permission or another room's subscription is not sufficient.
- An iPhone or iPad browser offers the existing Home Screen instructions first,
  including when that browser does not expose the push APIs. The temporary install
  handoff carries only a non-secret notification-intent marker alongside its existing
  credential cookies. After room and identity restoration, the installed app resumes
  the notification control. A separate tap is still required to grant permission.
- Starting installation from the notification control in Settings preserves the same
  intent. Ordinary installation does not imply notification intent or consent.
- Successful opt-in confirms the switch briefly, then retires the offer for that visit.
  Installation can be offered on a later visit, at least 30 minutes after subscription.
  A backgrounded app can resume after 30 minutes away without needing a reload.
- Notification and install refusals share the existing exponential backoff across
  surfaces and rooms. A browser denial does not lead to another automatic offer.
  Manually disabling a room's notifications prevents further automatic offers there;
  Settings remains available for a later explicit opt-in.
- The inline control and Settings share pending mutation state and refresh their
  server subscription status after changes. Only one control changes the device's
  shared browser endpoint at a time.

Progress stays on the device, scoped to the room. Pending notification intent expires
after 24 hours. Forget removes it with the room's other local state. This introduces
no account, cross-device profile, scheduled reminders, or new notification templates.

## One guidance slot

The room chooses one optional guidance owner in this order: identity, recovery,
post-activation Share, an active form or drawer, empty-room activation, latecomer review,
a newly reached All settled moment, an achievement, then notification/install setup. Persistent utilities
such as Add expense, Settle up, header Share and Settings do not consume the slot.

An empty room keeps its Share/Add actions. An active room offers notifications first;
an unsupported browser or an eligible later visit keeps the existing install path.
Every offer waits for 1.5 seconds without typing or other active interaction.

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

- A loaded room with a resolved active device identity uses the fallback slot for
  notifications when it has an active shared balance. Other eligible states retain
  the existing install offer. Installation itself is never required to use a room.
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
  Only an initial standalone document navigation to the exact manifest start URL `/app` records a
  versioned local marker; a client transition from a room cannot certify an old shortcut. An
  unmarked standalone room gets a one-time, conditional **Replace the old room icon** card. Device settings keeps the
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
