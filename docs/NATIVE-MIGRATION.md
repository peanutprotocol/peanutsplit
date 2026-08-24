# Native migration — contingency plan

**Status: not approved. Nothing here authorizes implementation.** `ROADMAP.md`
lists native apps under "Deliberately not building"; this document exists so
that if that decision is ever reopened, the shape of the work is already known
and nobody re-derives it from the source under time pressure. Per `CLAUDE.md`,
a deferred idea does not license schema fields, routes, states or abstractions —
this file stays prose until a ROADMAP item reopens it.

Written 2026-08-24 from the state of `apps/web` on that date.

## The short version

The server is not the problem. Identity is, and only one half of identity is
actually at risk.

## What costs nothing

**Schema migrations.** A native client is another HTTP caller. The Prisma
migrations under [`../apps/web/prisma/`](../apps/web/prisma/schema.prisma) and
the `split` Postgres schema are untouched by any of this.

**The HTTP surface.** `apps/web` exposes plain JSON route handlers and **zero
server actions** — see [`current/API.md`](current/API.md) and the generated
[route inventory](current/generated/API-ROUTES.md). Authentication is one
header, `X-Member-Token`, plus the slug in the path. There is no session, no
cookie credential, no OAuth handshake to reimplement. This is the single
largest reason a native client would be cheap: most web-to-native ports die on
server actions and cookie sessions, and Split has neither.

## What actually breaks: device-local state

[`../apps/web/src/lib/identity.ts`](../apps/web/src/lib/identity.ts) states the
model: there are no accounts, identity is a localStorage record and the room
slug is the credential. A native app is a fresh storage container that can read
neither localStorage nor cookies from the browser. On first launch every user is
a stranger in every room.

Two distinct things are lost, and they are not equally serious.

**The member token is recoverable and always was.**
The claim handler behind `POST /api/rooms/:slug/members/:memberId/claim` takes no credential beyond knowing the slug: any link-holder selects any roster
entry and receives that member's existing token, unrotated. That is deliberate —
it is the same trusted-circle act described in
[`ROSTER-IDENTITY.md`](ROSTER-IDENTITY.md). So "I am Bea in this room" is
restored on a fresh install by opening the link and tapping a name. No transfer
mechanism is required for it.

**The room list is not recoverable.** `ps:recent` holds up to
`RECENT_ROOMS_LIMIT` rooms in localStorage
([`../apps/web/src/lib/recent-rooms.ts`](../apps/web/src/lib/recent-rooms.ts)),
and the slug _is_ the credential. A room whose link exists nowhere else is gone
permanently. This is the only thing a migration mechanism must carry.

Frame any future feature as **"transfer my room list"**, not "sync my identity".
The wrong framing leads to building the wrong thing.

## Precedent already in the tree

[`../apps/web/src/server/installHandoff.ts`](../apps/web/src/server/installHandoff.ts)
already solves a narrower version of this problem: WebKit gives a newly added
Home Screen app a fresh container and copies only cookies, so an explicit
install intent is bridged by a short-lived opaque token, stored as a
domain-separated SHA-256 digest, scoped to one room and an optional member
proven at preparation time. See [`PWA-INSTALL-FUNNEL.md`](PWA-INSTALL-FUNNEL.md)
for the surrounding funnel.

Its header carries the constraint that governs everything below: _there is
deliberately no device or user key — this must not grow into a cross-room
anonymous account by accident._

Native cannot use the cookie bridge, but the server half of that flow ports
almost verbatim: mint the same kind of row, deliver the token through a
universal/app link instead of a cookie.

## The transfer-code proposal, and its four problems

The obvious mechanism is a QR or short code that moves rooms to a new install.
It works, and it should be understood with these limits stated up front.

1. **The dominant case is same-device and a code is the wrong tool for it.**
   PWA on a phone to native app on the _same_ phone cannot scan its own screen,
   and a typed code is friction for no benefit. Same-device wants a universal
   link — one tap, and `installHandoff.ts` is most of the server side already.
   A code is the cross-device fallback, not the primary path.
2. **One code is a bearer credential for every room on the device.** Today a
   leaked link exposes one room. A bundle of a dozen slugs, screenshotted into
   a group chat or read off a screen, exposes a dozen rooms of money with full
   write access. Non-negotiable if built: the code is an opaque lookup key,
   never the payload; the bundle lives server-side; short TTL; redeem-once;
   rate-limited. That is the shape `InstallHandoff` already has — see
   [`current/SECURITY-MODEL.md`](current/SECURITY-MODEL.md).
3. **It is a copy, not a sync.** After redemption the two devices diverge; a
   room joined on the new device never appears on the old one. Users hear
   "sync" and expect continuous. The honest UX is a re-transfer per new room.
4. **There is no recovery story.** Generating the code requires a working old
   device. A lost, stolen or wiped phone leaves no code, no room list and
   nothing to redeem — which is the failure people actually care about.

## The product decision underneath

A multi-room transfer bundle _is_ the cross-room anonymous account that
`installHandoff.ts` refuses to become — with no recovery and a wider blast
radius. `User`, `AuthAccount` and `Member.userId` already exist unused in
[`../apps/web/prisma/schema.prisma`](../apps/web/prisma/schema.prisma) as a
future account-linking hook.

That is not a licence to use them. `CLAUDE.md` freezes the accountless surface:
no email login, passwords, OAuth, profiles or room ownership, and `ROADMAP.md`
lists mandatory accounts under "Deliberately not building". The point here is
only that **native forces the question**: the cheap transfer code and real
accounts solve overlapping problems, and picking the code first is a decision
about recovery, not a smaller version of the same feature.

## If it is reopened — the work, in order

Nothing below is authorized. It is a cost map.

1. **Pick the shell.** A WebView shell (Capacitor/Expo) reuses the whole
   product and is on the order of one to two weeks; a React Native rewrite
   keeps the server untouched but reimplements ~131 `'use client'` components
   and the Tailwind surface, and is a multi-month job. `apps/ui` is an empty
   stub — there is no shared design system to lean on.
2. **Same-device handoff.** Extend the `installHandoff` flow to deliver its
   token over a universal/app link. Reuses the existing hashed-token row and
   TTL. Smallest useful unit of work; ships alone.
3. **Cross-device transfer, only if step 2 proves insufficient.** Server-held
   room-list bundle behind a one-time opaque token, presented as a QR or short
   code, labelled _transfer_ rather than _sync_. Requires an explicit product
   ruling against constraint 2 above before any schema work.
4. **Native notification transport.** `web-push`/VAPID in
   [`../apps/web/src/server/push.ts`](../apps/web/src/server/push.ts) becomes
   APNs/FCM. Note the standing rule: never rotate the VAPID pair in place, and
   stored subscriptions are bound to it. The SSE poke stream behind
   `GET /api/rooms/:slug/events` needs no change — it works natively as plain HTTP.
5. **Remaining web-isms.** The localStorage offline queue
   ([`../apps/web/src/lib/offline-queue.ts`](../apps/web/src/lib/offline-queue.ts)),
   the share-target route, clipboard, and the install funnel itself all need
   native equivalents or deliberate removal.

**Reopen when:** native is removed from "Deliberately not building" in
`ROADMAP.md` by a product decision, or PWA deprecation is actually scheduled.
**Done when:** a real device migrates its room list to a fresh install and the
old install still works, with no room reachable by anything but its own link.
