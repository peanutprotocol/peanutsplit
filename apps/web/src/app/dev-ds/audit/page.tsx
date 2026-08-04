import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { DocChrome } from '../_components/DocChrome'
import { AuditPicker } from './_components/AuditPicker'
import { ExecutiveQuestions } from './_components/ExecutiveQuestions'
import { severityOrder, severityStyle, type Finding, type Severity } from './_components/audit-model'

export const metadata: Metadata = {
    title: 'Implementation audit — Peanut Split',
    description: 'Interactive decision workspace for the evidence-backed Peanut Split implementation audit.',
}

const findings: Finding[] = [
    {
        id: 'OPS-01',
        severity: 'low',
        area: 'Operations',
        effort: 'M',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Direct-to-main deploys are an intentional pre-scale tradeoff',
        summary:
            'Dokploy polls main independently, so pushing to main deploys immediately while CI remains advisory. Leadership has explicitly chosen to keep that fast path before meaningful scale.',
        impact: 'A faulty push can reach production before automated checks finish. With no users yet, that blast radius is accepted in exchange for a simpler and faster shipping loop.',
        action: 'No roadmap work now. Keep direct-to-main deployment and revisit a CI deployment gate only once Peanut Split has tens of thousands of users.',
        evidence: [
            '.github/workflows/ci.yml:1 — workflow documents that it does not block deployment',
            '.github/workflows/ci.yml:7 — checks run after push to main',
            'README.md:105 — pushing main deploys in about five minutes',
        ],
    },
    {
        id: 'SEC-02',
        severity: 'critical',
        area: 'Security',
        effort: 'M',
        horizon: 'Now',
        title: 'The room bearer credential has only 30 random bits',
        summary:
            'A room slug is the only read/write credential. Its secret portion is three words selected from a frozen 1,024-word list: exactly 2³⁰ possibilities. The readable, user-derived prefix is not secret entropy.',
        impact: 'Discovering a slug grants access to a private financial ledger and its mutations. The lookup throttle is not a sufficient compensating control, especially until production handling of X-Forwarded-For is verified.',
        action: 'Keep the readable slug and append 96–128 bits of independently generated, non-human-friendly randomness. Verify that the edge replaces rather than trusts client-supplied forwarding headers. Treat rotation, revocation and ownership UI as separate product work.',
        evidence: [
            'apps/web/src/server/slug.ts:2 — explicitly declares the slug to be the credential',
            'apps/web/src/server/slug.ts:9 — three words from a 1,024-word list',
            'apps/web/src/server/slug.ts:22 — randomTail selects only those three words',
            'apps/web/src/server/rateLimit.ts:86 — client identity trusts the first X-Forwarded-For entry',
        ],
    },
    {
        id: 'SEC-03',
        severity: 'high',
        area: 'Security',
        effort: 'M',
        horizon: 'Now',
        title: 'Anonymous imports amplify one request into roughly 10,522 durable rows',
        summary:
            'The public import accepts up to 500 expenses, 20 members and 20 shares per expense. One request can persist about 10,000 shares plus expenses, members, a room and audit snapshots; the current limit permits 20 imports per hour per derived IP.',
        impact: 'A small anonymous request stream can create hundreds of thousands of durable rows per hour. The append-only audit model prevents ordinary cleanup, while audit construction can perform up to five million in-memory share comparisons per import.',
        action: 'Keep protection lightweight: lower hard cardinality/rate caps, index shares by expense before audit construction, and add a simple kill switch or circuit breaker. Do not build distributed quota or retention machinery before usage exists.',
        evidence: [
            'apps/web/src/app/api/import/route.ts:11 — public import limit and request path',
            'apps/web/src/server/validation.ts:498 — import cardinality constraints',
            'apps/web/src/server/rateLimit.ts:24 — 20 imports/hour allowance',
            'apps/web/src/server/splitwiseImport.ts:205 — audit snapshot maps expenses and filters share rows',
        ],
    },
    {
        id: 'ARCH-01',
        severity: 'medium',
        area: 'Architecture',
        effort: 'XL',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Two incompatible backend architectures coexist',
        summary:
            'The root builds a Fastify/Prisma API in the app schema while the live Next application owns 23 route handlers, a direct Prisma client and a different split schema. The README still describes the older topology and a rewrite that next.config does not contain.',
        impact: 'There are two places to change money rules, API contracts, migrations and deployment assumptions. An engineer can test or patch the wrong system successfully.',
        action: 'Mark Next as authoritative and freeze Fastify. Do not schedule an XL retirement project; delete legacy pieces opportunistically when real product work touches them. Reopen on an actual wrong-tree change, repeated duplicated work, or around 1,000 rooms.',
        evidence: [
            'pnpm-workspace.yaml:2 — only apps/api is a workspace member; collapse is marked pending',
            'apps/web/src/server/db.ts:7 — Next owns a Prisma client',
            'apps/web/src/server/roomState.ts:10 — Next owns the room domain read model',
            'README.md:24 — documentation still describes Fastify as the backend',
        ],
    },
    {
        id: 'OPS-02',
        severity: 'low',
        area: 'Operations',
        effort: 'S',
        horizon: 'Later',
        status: 'conditional',
        title: 'The claimed fresh-CI database failure is not reproduced',
        summary:
            'The workflow names peanut_split_dev while web setup targets peanut_split_test, but the latest clean main run completed all 1,852 tests and the build successfully. The original predicted failure does not occur in current CI.',
        impact: 'The configuration and comment are confusing, but there is no demonstrated broken check to place on the roadmap. The remaining risk is that database-backed tests might be silently bypassed, which needs proof before remediation.',
        action: 'No roadmap work. Reopen only if a clean run fails or a focused check proves the database-backed handler suite is being skipped.',
        evidence: [
            '.github/workflows/ci.yml:16 — says web tests do not use the database',
            '.github/workflows/ci.yml:24 — creates only peanut_split_dev',
            'apps/web/src/server/test/env.ts:4 — defaults to peanut_split_test',
            'apps/web/src/server/test/globalSetup.ts:7 — applies migrations there',
            'GitHub Actions run 30898139682 — clean main run passed 1,852 tests and the build on 2026-08-04',
        ],
    },
    {
        id: 'A11Y-01',
        severity: 'high',
        area: 'Accessibility',
        effort: 'M',
        horizon: 'Now',
        title: 'Focus visibility is absent or below contrast requirements',
        summary:
            'The canonical input removes the browser outline and substitutes a #FFC900 border with roughly 1.54:1 contrast on white. Nine-plus hand-rolled controls also use outline-none without a consistent replacement.',
        impact: 'Keyboard and switch users lose their position in the most important forms. Copying the shared input copies the defect.',
        action: 'Create one ink-based 2–3px focus-visible outline/ring with offset and ≥3:1 adjacent contrast. Apply it centrally, remove unpaired outline-none, and add keyboard-focus screenshots.',
        evidence: [
            'apps/web/tailwind.config.js:358 — shared input uses outline-none + yellow focus border',
            'apps/web/src/components/tools/ToolCalculator.tsx:48 — bare fields suppress outline',
            'apps/web/src/components/marketing/ReadMore.tsx:28 — focus treatment is effectively unchanged ink',
            'apps/web/src/components/room/ExpenseDrawer.tsx:954 — primary amount field suppresses outline',
        ],
    },
    {
        id: 'A11Y-02',
        severity: 'high',
        area: 'Accessibility',
        effort: 'M',
        horizon: 'Now',
        title: 'Named button sizes and live controls miss the 44px tap floor',
        summary:
            'Button small/medium/large are 32/36/40px. A temporary override exists, but several live callers still use the undersized props; reaction pills and options are 28–32px.',
        impact: 'Frequent social actions are harder to hit on a moving phone and violate the project’s documented floor.',
        action: 'Correct Button at its source, add a shared IconButton, delete control.ts, and audit native buttons by computed target size.',
        evidence: [
            'apps/web/tailwind.config.js:233 — small/medium/large are 32/36/40px',
            'apps/web/src/components/ui/control.ts:1 — temporary 44/48px patch layer',
            'apps/web/src/components/room/RoomScreen.tsx:244 — retry uses small without correction',
            'apps/web/src/components/room/ReactionBar.tsx:195 — 28px reaction pill',
            'apps/web/src/components/room/ReactionBar.tsx:280 — 32px reaction option',
        ],
    },
    {
        id: 'A11Y-03',
        severity: 'high',
        area: 'Accessibility',
        effort: 'S',
        horizon: 'Now',
        title: 'Meaningful placeholders are almost invisible',
        summary:
            'Local composer fields override the canonical placeholder color with grey-2 (#E7E8E9), about 1.23:1 on white. Some of those placeholders effectively carry the visible label.',
        impact: 'Room name, expense amount and calculator purpose can disappear for low-vision users and in glare.',
        action: 'Use n-3/grey-1 and persistent visible labels. Prevent local placeholder colors below the contrast floor.',
        evidence: [
            'apps/web/tailwind.config.js:39 — grey-2 is #E7E8E9',
            'apps/web/src/components/room/CreateRoomForm.tsx:116 — room-name placeholder uses grey-2',
            'apps/web/src/components/room/ExpenseDrawer.tsx:954 — amount placeholder uses grey-2',
            'apps/web/src/components/tools/ToolCalculator.tsx:48 — shared bare recipe uses grey-2',
        ],
    },
    {
        id: 'A11Y-04',
        severity: 'high',
        area: 'Accessibility',
        effort: 'M',
        horizon: 'Now',
        title: 'ARIA radio groups omit radio-group keyboard behavior',
        summary:
            'Doodle, avatar and payer pickers expose every option as a tab stop without Arrow/Home/End handling. A selected temporary payer can be focusable with no click handler. The split-mode picker already contains a correct roving-tabindex example.',
        impact: 'Keyboard users traverse dozens of tabs and receive a widget role whose expected interaction does not work.',
        action: 'Extract a radio-group primitive using native radios or roving tabindex, including Arrow keys, Home and End; migrate from the working split-mode implementation.',
        evidence: [
            'apps/web/src/components/room/DoodlePicker.tsx:39 — all options are focusable radios',
            'apps/web/src/components/room/AvatarPicker.tsx:180 — repeats the pattern',
            'apps/web/src/components/room/ExpenseDrawer.tsx:1168 — payer radios lack group navigation',
            'apps/web/src/components/room/ExpenseDrawer.tsx:1296 — split modes show the correct pattern',
        ],
    },
    {
        id: 'I18N-01',
        severity: 'high',
        area: 'Internationalization',
        effort: 'L',
        horizon: 'Now',
        title: 'Visual catalogs leak English into localized product screens',
        summary:
            'Avatar labels and “vibe” sentences are stored as English values and rendered directly. Doodle picker names are raw enum keys; Loading is hard-coded English. The catalog-parity audit cannot see these strings.',
        impact: 'Spanish and Portuguese flows become partially English, including names announced to assistive technology.',
        action: 'Store stable translation keys in visual catalogs, localize doodle names and Loading status, and extend the literal audit to catalog values and accessibility attributes.',
        evidence: [
            'apps/web/src/lib/avatars.ts:20 — catalog stores English label/vibe strings',
            'apps/web/src/components/room/AvatarPicker.tsx:193 — renders catalog labels directly',
            'apps/web/src/components/room/DoodlePicker.tsx:52 — raw doodle key is the accessible label',
            'apps/web/src/components/ui/Loading.tsx:10 — hard-coded Loading status',
        ],
        status: 'confirmed',
    },
    {
        id: 'PERF-01',
        severity: 'high',
        area: 'Performance',
        effort: 'L',
        horizon: 'Now',
        title: 'The doodle registry produces an 816KB broadly loaded PWA chunk',
        summary:
            'Doodle dynamically indexes one 855,970-byte object containing 454 SVG paths. A local production build emitted an 816KB raw / 264KB gzip chunk used across marketing, room, recap and share-target routes and included it in the service-worker precache.',
        impact: 'Phones parse and transfer hundreds of drawings to render a handful, competing with the room payload on poor networks. Precaching makes the cost part of installation even before most art is needed.',
        action: 'Generate semantic/domain chunks or individual modules, lazy-load picker/full catalogs, restrict precaching to the minimal shell, and enforce route-level JS and precache budgets in CI.',
        evidence: [
            'apps/web/src/components/ui/doodles.ts:11 — complete generated path object',
            'apps/web/src/components/ui/Doodle.tsx:57 — runtime name lookup blocks per-call-site shaking',
            'apps/web/src/app/sw.ts:23 — broad precache construction',
            'apps/web/src/components/room/MemberAvatar.tsx:1 — primary client UI imports Doodle',
        ],
    },
    {
        id: 'PERF-02',
        severity: 'high',
        area: 'Performance',
        effort: 'XL',
        horizon: 'Next',
        title: 'Room reads and writes repeatedly serialize the entire ledger',
        summary:
            'Every mutation reloads all members, expenses, shares, reactions and settlements, computes balances, and returns RoomState. Clients poll that whole state every 8s without SSE or every 45s with SSE; imports support 500 expenses.',
        impact: 'Database work and payload size grow with full history and multiply by every phone. A reaction or theme edit becomes as expensive as loading the ledger.',
        action: 'Introduce versioned compact snapshots plus paginated ledger and mutation deltas. Keep balance derivation authoritative server-side and force a full refresh on version conflict.',
        evidence: [
            'apps/web/src/server/roomState.ts:10 — query includes every live relation',
            'apps/web/src/server/roomState.ts:118 — rebuilds full wire state',
            'apps/web/src/lib/queries.ts:89 — every mutation returns RoomState',
            'apps/web/src/lib/queries.ts:110 — 45s/8s polling remains with SSE',
            'apps/web/src/server/roomState.ts:25 — explicitly supports 500-row imports',
        ],
    },
    {
        id: 'SEC-04',
        severity: 'high',
        area: 'Security',
        effort: 'S',
        horizon: 'Now',
        title: 'Private RoomState responses do not explicitly prohibit caching',
        summary:
            'The room GET returns financial data through the generic JSON helper without private/no-store response headers, and the client fetch omits cache: no-store. NetworkOnly service-worker routing prevents SW cache entries, not browser or intermediary HTTP caching.',
        impact: 'Bearer-protected ledgers can be retained or replayed by browser/proxy caches under environment-dependent defaults. A stale response can also misrepresent money state.',
        action: 'Make private, no-store the default for authenticated/bearer JSON responses, explicitly opt truly public routes into caching, add client fetch no-store, and assert the header in route tests.',
        evidence: [
            'apps/web/src/server/http.ts:27 — generic success response sets no cache policy',
            'apps/web/src/app/api/rooms/[slug]/route.ts:14 — RoomState GET uses that helper',
            'apps/web/src/lib/api.ts:76 — client fetch omits cache mode',
            'apps/web/src/app/api/rooms/[slug]/history/route.ts:9 — history route provides the correct no-store precedent',
        ],
    },
    {
        id: 'DATA-01',
        severity: 'low',
        area: 'Data lifecycle',
        effort: 'L',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Append-only financial history has no erasure or retention path',
        summary:
            'Audit rows store before/after/detail snapshots, use a RESTRICT room foreign key and are protected from update/delete by a trigger. Every existing room receives a marker, while the product exposes no complete archive/delete/retention lifecycle.',
        impact: 'Abandoned, imported and user-requested data can accumulate indefinitely; ordinary hard deletion is structurally blocked. This is both an operational growth risk and a privacy/compliance design gap.',
        action: 'Document the anonymous-managed direction, but do not build retention, partitioning, expiry or deletion flows yet. Reopen around 1,000 rooms, on the first real erasure request, a concrete legal obligation, or measured audit-table growth.',
        evidence: [
            'apps/web/prisma/migrations/20260803150000_room_audit_history/migration.sql:27 — room foreign key restricts deletion',
            'apps/web/prisma/migrations/20260803150000_room_audit_history/migration.sql:32 — append-only trigger',
            'apps/web/src/server/history.ts:218 — catch-up/audit reads have no lifecycle boundary',
            'apps/web/prisma/schema.prisma:62 — archivedAt exists without a complete product flow',
        ],
    },
    {
        id: 'QUAL-01',
        severity: 'high',
        area: 'Quality',
        effort: 'M',
        horizon: 'Now',
        title: 'The lint command only checks formatting',
        summary:
            'apps/web calls prettier --check “lint” and has no semantic lint or class validator. TypeScript cannot catch invalid Tailwind classes, hook misuse, landmark errors or many async mistakes.',
        impact: 'The repository reports clean lint while shipping silent no-op classes such as shadow-3 and rounded-xs.',
        action: 'Rename the current script format:check; add React Hooks, accessibility and Tailwind/class validation with a ratcheted legacy baseline.',
        evidence: [
            'apps/web/package.json:11 — lint maps to prettier --check',
            'apps/web/src/components/ui/PullToRefresh.tsx:181 — nonexistent shadow-3',
            'apps/web/src/components/marketing/YourRooms.tsx:267 — nonexistent rounded-xs',
        ],
    },
    {
        id: 'QUAL-02',
        severity: 'low',
        area: 'Quality',
        effort: 'M',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'End-to-end suites are not part of CI',
        summary:
            'Two Playwright configurations and real product journeys exist, but CI runs typecheck, formatting, audits, tests and build only. No browser or visual path runs before/after deployment.',
        impact: 'Focus traps, service-worker behavior, responsive overflow and the create/share/settle funnel can fail while 1,719 tests stay green.',
        action: 'Keep Playwright journeys runnable for manual checks, but do not create a browser CI program now. Reopen after an escaped browser-only critical-flow regression, recurring manual-test pain, or around 1,000 rooms.',
        evidence: [
            '.github/workflows/ci.yml:51 — no Playwright command',
            'apps/web/package.json:19 — e2e scripts are opt-in',
            'apps/web/playwright.config.ts:1 — suite exists',
        ],
    },
    {
        id: 'DS-01',
        severity: 'medium',
        area: 'Design system',
        effort: 'L',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Landing CSS occupies 84% of the global stylesheet',
        summary:
            'globals.css is 1,561 lines; roughly 1,306 lines from the pass-the-link section onward are route-specific composition, keyframes and breakpoints delivered globally.',
        impact: 'Rooms, forms, tools and docs carry landing CSS. Global selectors create collision risk and make deletion and responsive tracing difficult.',
        action: 'Do not schedule a wholesale CSS-module migration. Move affected rules opportunistically during the next substantial landing experiment, or reopen on a real selector collision or measured CSS/CWV cost.',
        evidence: [
            'apps/web/src/styles/globals.css:256 — landing-specific block begins',
            'apps/web/src/styles/globals.css:1477 — late selectors still target landing elements',
            'apps/web/src/app/layout.tsx:13 — stylesheet loads for every route',
        ],
    },
    {
        id: 'ARCH-02',
        severity: 'medium',
        area: 'Architecture',
        effort: 'XL',
        horizon: 'Next',
        title: 'ExpenseDrawer is a 1,962-line workflow controller and view',
        summary:
            'One client file owns create/edit/catch-up modes, validation, split math, scanning, quick add, payer creation, all sections and rendering. CurrencySelect (787), ToolCalculator (711), SettleDrawer (685) and ExpenseList (603) show similar concentration.',
        impact: 'Small domain or visual changes touch high-conflict files with huge state spaces; orchestration remains difficult to test adversarially.',
        action: 'Do not schedule a big-bang decomposition. When a real experiment touches the drawer, extract only the pure reducer/state or money seam that makes that product change smaller and safer.',
        evidence: [
            'apps/web/src/components/room/ExpenseDrawer.tsx:1 — 1,962 lines / 109.7KB',
            'apps/web/src/components/room/CurrencySelect.tsx:1 — 787 lines',
            'apps/web/src/components/room/SettleDrawer.tsx:1 — 685 lines',
        ],
    },
    {
        id: 'ARCH-03',
        severity: 'medium',
        area: 'Architecture',
        effort: 'L',
        horizon: 'Next',
        title: 'One 830-line query module owns every room mutation',
        summary:
            'queries.ts combines read/poll/SSE policy, offline draining, identity persistence, optimistic creation and every room/member/theme/reaction/import mutation.',
        impact: 'Unrelated features collide in one cache-policy file and subtle idempotency/token invariants are easy to disturb.',
        action: 'Split responsibilities opportunistically when a real mutation/cache change touches the module or repeated conflicts justify the seam. Preserve current hooks and cache contracts; do not reorganize it wholesale.',
        evidence: [
            'apps/web/src/lib/queries.ts:49 — keys/reads begin',
            'apps/web/src/lib/queries.ts:209 — offline engine',
            'apps/web/src/lib/queries.ts:427 — optimistic expense mutation',
            'apps/web/src/lib/queries.ts:822 — import mutation',
        ],
    },
    {
        id: 'PERF-03',
        severity: 'medium',
        area: 'Performance',
        effort: 'L',
        horizon: 'Next',
        title: 'Every route mounts the full application provider stack',
        summary:
            'Marketing, tools, forms, rooms and docs all mount React Query, nuqs, Motion, offline runner, push navigation, analytics, device identity, cache sweeping, toasts and the active 897-key message catalog.',
        impact: 'Editorial visits pay app-runtime JavaScript and persistence/analytics side effects they do not need.',
        action: 'Treat this as conditional SEO work, not a provider-stack cleanup project. Use the smallest coarse route split needed for static indexed pages, or reopen on measured public-route JS/TTFB harm.',
        evidence: [
            'apps/web/src/app/layout.tsx:135 — all routes receive the same providers',
            'apps/web/src/lib/providers.tsx:45 — global application boot effects',
            'apps/web/src/lib/providers.tsx:120 — Query, offline, push and toast hosts',
        ],
    },
    {
        id: 'DS-02',
        severity: 'medium',
        area: 'Design system',
        effort: 'M',
        horizon: 'Next',
        title: 'Core tokens contain aliases, dead APIs and duplicate shadows',
        summary:
            'grey/gray, n/grey, yellow/primary, black/n-1 and multiple shadow families overlap. Several palette/component families have no live consumers; z-index usage bypasses the configured 1–5 scale.',
        impact: 'Call sites choose by memory, searches miss equivalent usage and tuning one alias leaves another behind.',
        action: 'Treat the documented design system as canonical. Remove dead aliases in touched files and avoid a wholesale token migration or a larger speculative ontology.',
        evidence: [
            'apps/web/tailwind.config.js:39 — grey and gray coexist',
            'apps/web/tailwind.config.js:57 — n duplicates ink/muted values',
            'apps/web/tailwind.config.js:307 — shadow-4 equals shadow-primary-4',
            'apps/web/tailwind.config.js:331 — button shadows duplicate elevation',
        ],
    },
    {
        id: 'DS-03',
        severity: 'medium',
        area: 'Design system',
        effort: 'L',
        horizon: 'Next',
        title: 'Common surface and composer recipes bypass primitives',
        summary:
            'Before this documentation route, 69 components repeated the white/ink-border/rounded surface recipe. CreateRoom, ExpenseDrawer and ToolCalculator repeat composer cards, rows, dashed headers, collapse controls and a 7.25rem currency slot.',
        impact: 'Focus, padding, responsive and border fixes require dozens of edits and equivalent flows already drift.',
        action: 'Apply a rule-of-three threshold in new or touched flows. Extract only stable repeated recipes that make the current product change smaller; do not create the whole proposed primitive catalog upfront.',
        evidence: [
            'apps/web/src/components/ui/Card.tsx:24 — a bounded surface primitive exists',
            'apps/web/src/components/room/CreateRoomForm.tsx:98 — composer recipe',
            'apps/web/src/components/room/ExpenseDrawer.tsx:923 — repeated composer recipe',
            'apps/web/src/components/tools/ToolCalculator.tsx:43 — local CARD/ROW/BARE/BOXED constants',
        ],
        status: 'confirmed',
    },
    {
        id: 'DS-04',
        severity: 'medium',
        area: 'Design system',
        effort: 'M',
        horizon: 'Now',
        title: 'Compatibility shims form a second component layer',
        summary:
            'control.ts overrides broken Button sizes at call sites. DrawerLayout exports classes every caller must remember until Drawer defaults are fixed. Both explicitly ask to be folded into their owners.',
        impact: 'Correct behavior depends on tribal knowledge; new callers naturally use public props and regress.',
        action: 'Fold each temporary shim into its owner only where computed dimensions and drawer geometry stay identical, then delete the duplicate. Any visible geometry change requires representative mockup review.',
        evidence: [
            'apps/web/src/components/ui/control.ts:1 — temporary correction/FOLD-IN plan',
            'apps/web/src/components/ui/DrawerLayout.tsx:5 — temporary separation',
            'apps/web/src/components/ui/Button.tsx:64 — public prop still maps to broken classes',
        ],
    },
    {
        id: 'DS-05',
        severity: 'low',
        area: 'Design system',
        effort: 'L',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Drawer standardization is half-migrated and contradicted',
        summary:
            'DrawerLayout says actions should be a body sibling, yet seven of eight implementations nest them inside the scroll body. Callers also must remember border/header classes; ExpenseDrawer hand-authors most geometry.',
        impact: 'Long sheets have inconsistent scroll, safe-area and stable-action behavior.',
        action: 'Do not standardize every drawer without a concrete product reason. Reopen for an observed scroll/safe-area defect or a deliberate drawer UX initiative; representative mockups are required before changing the shared flow.',
        evidence: [
            'apps/web/src/components/ui/DrawerLayout.tsx:48 — documents sibling action zone',
            'apps/web/src/components/room/SettleDrawer.tsx:664 — actions nested in body',
            'apps/web/src/components/room/LatecomerBanner.tsx:340 — one-off sticky actions',
            'apps/web/src/components/room/ExpenseDrawer.tsx:923 — lone sibling-style implementation',
        ],
    },
    {
        id: 'DS-06',
        severity: 'medium',
        area: 'Design system',
        effort: 'M',
        horizon: 'Next',
        title: 'Button defaults create caller noise and a second link-button system',
        summary:
            'Button always applies w-full and duplicate centering, forcing w-auto/justify-center overrides. CTA links independently copy button classes across app and marketing routes.',
        impact: 'Width intent is obscured and visual changes require editing both the component and raw link recipes.',
        action: 'Create a shared ButtonLink/style recipe the next time CTA or Button behavior changes, then migrate only proven duplicates while preserving anchor semantics and rendered layouts.',
        evidence: [
            'apps/web/src/components/ui/Button.tsx:133 — w-full and repeated centering',
            'apps/web/src/app/app/page.tsx:24 — link duplicates button styling',
            'apps/web/src/components/marketing/LandingAppLink.tsx:20 — another link-button recipe',
            'apps/web/src/components/marketing/FinalCta.tsx:38 — another CTA recipe',
        ],
    },
    {
        id: 'DS-07',
        severity: 'medium',
        area: 'Design system',
        effort: 'S',
        horizon: 'Now',
        title: 'Two written Tailwind classes do not exist',
        summary:
            'shadow-3 and rounded-xs are not generated by the current configuration. They are silent visual no-ops that typecheck, formatting and existing audits all accept.',
        impact: 'Pull-to-refresh lacks its intended depth; the room-list disclosure lacks its intended radius, and similar mistakes can ship undetected.',
        action: 'Replace them with reviewed tokens and add a compiled-class validator or semantic lint rule.',
        evidence: [
            'apps/web/src/components/ui/PullToRefresh.tsx:181 — shadow-3',
            'apps/web/src/components/marketing/YourRooms.tsx:267 — rounded-xs',
            'apps/web/tailwind.config.js:135 — radius scale has no xs',
        ],
    },
    {
        id: 'I18N-02',
        severity: 'medium',
        area: 'Internationalization',
        effort: 'M',
        horizon: 'Now',
        title: 'Server error codes and translated client codes drift',
        summary:
            'KNOWN_ERROR_CODES is manual. Emitted codes including HISTORY_CURSOR_INVALID, CATCH_UP_REVIEW_CONFLICT, NEW_PAYER_ON_EDIT, REQUEST_TOO_LARGE, UNSUPPORTED_PUSH_HOST and PUSH_SUBSCRIPTION_LIMIT are absent; unknown codes surface English.',
        impact: 'Localized flows regress to English precisely on failures. The current i18n audit checks catalog parity, not the server/client contract.',
        action: 'Add the missing translated error codes and one contract test covering every emitted ApiError code. Keep English only for rolling-deploy forward compatibility; do not require a generator or new catalog framework.',
        evidence: [
            'apps/web/src/lib/error-messages.ts:31 — manual code list',
            'apps/web/src/lib/error-messages.ts:101 — unknown code falls back to English',
            'apps/web/src/server/history.ts:389 — missing code emitted',
            'apps/web/src/app/api/rooms/[slug]/push-subscriptions/route.ts:40 — missing push codes',
        ],
    },
    {
        id: 'PERF-04',
        severity: 'medium',
        area: 'Performance',
        effort: 'L',
        horizon: 'Later',
        title: 'The root locale choice forces every route to render per request',
        summary:
            'RootLayout reads a dynamic locale API and its own comment notes every descendant becomes request-rendered, including path-localized editorial pages.',
        impact: 'Indexed content and internal docs give up static HTML/CDN caching to satisfy cookie-localized room URLs.',
        action: 'If the recorded SEO strategy requires it, make indexed paths static with the smallest route/layout change possible. Do not redesign locale architecture without static-output or measured TTFB evidence.',
        evidence: [
            'apps/web/src/app/layout.tsx:99 — dynamic consequence documented',
            'apps/web/src/app/layout.tsx:112 — awaits getLocale at root',
        ],
        status: 'accepted risk',
    },
    {
        id: 'SEC-01',
        severity: 'low',
        area: 'Security',
        effort: 'M',
        horizon: 'Later',
        title: 'No security-header policy is defined in the repository',
        summary:
            'Next config and middleware define no CSP, frame-ancestors, Referrer-Policy or Permissions-Policy. The app persists member tokens and the room URL is a credential.',
        impact: 'An XSS or hostile embed has a larger blast radius and broader browser capabilities than needed.',
        action: 'Check the live edge and add only cheap non-breaking defaults opportunistically. Defer CSP reporting, nonces and enforcement until roughly 1,000 rooms, before user-authored HTML, or when a privileged third-party script is added.',
        evidence: [
            'apps/web/next.config.js:11 — no headers() policy',
            'apps/web/src/middleware.ts:20 — only locale injection',
            'apps/web/src/lib/identity.ts:41 — token stored locally',
        ],
        status: 'conditional',
    },
    {
        id: 'RES-01',
        severity: 'medium',
        area: 'Resilience',
        effort: 'M',
        horizon: 'Next',
        title: 'No route-level error, loading or not-found boundaries exist',
        summary:
            'The App Router contains no error.tsx, global-error.tsx, loading.tsx or not-found.tsx. Query states cover many room cases; server-render, metadata, content and provider failures fall to framework defaults.',
        impact: 'Transient database/content errors can replace the product with a generic response and no safe retry or diagnostic path.',
        action: 'Add minimal global and route-group boundaries with redacted correlation ids, retry/navigation, translated copy and no credential leakage.',
        evidence: [
            'apps/web/src/app/layout.tsx:104 — root has no global-error sibling',
            'apps/web/src/app/r/[slug]/page.tsx:1 — room metadata/server page has no route boundary',
        ],
    },
    {
        id: 'DOMAIN-01',
        severity: 'medium',
        area: 'Domain integrity',
        effort: 'M',
        horizon: 'Now',
        title: 'Room-write invariants are repeated and already have omissions',
        summary:
            'Writable-room checks, idempotency, locking, auditing, state reload, event publication and notification are assembled independently in route handlers. Expense restore and settlement deletion omit the archived-room assertion.',
        impact: 'A future archive flow can still accept these writes, and every new command must rediscover the same ordering and post-commit rules. The repetition creates correctness—not merely style—risk.',
        action: 'Fix the two known archived-room omissions and add focused regression tests. Do not build the generic room-command pipeline until repeated omissions or real product work justify the abstraction.',
        evidence: [
            'apps/web/src/server/rooms.ts:179 — central assertWritable exists',
            'apps/web/src/app/api/expenses/[id]/restore/route.ts:13 — restore path omits it',
            'apps/web/src/app/api/rooms/[slug]/settlements/[id]/route.ts:14 — settlement delete path omits it',
            'apps/web/src/app/api/rooms/[slug]/expenses/route.ts:58 — route hand-assembles write/idempotency behavior',
        ],
    },
    {
        id: 'DOMAIN-02',
        severity: 'low',
        area: 'Domain integrity',
        effort: 'M',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Idempotency and cross-room integrity stop at application conventions',
        summary:
            'Reusing an expense or settlement idempotency key with a changed body silently returns the old object. Independent foreign keys also do not prove that payer, share member and settlement members belong to the referenced room.',
        impact: 'Client retries can receive a success for a payload the server never applied, and a missed route validation can create cross-room references the database accepts.',
        action: 'Keep application validation for the experiment. Reopen request hashing and room-scoped database constraints around 1,000 rooms, on the first replay/cross-room defect, or during an adjacent schema migration that makes the work nearly free.',
        evidence: [
            'apps/web/src/app/api/rooms/[slug]/expenses/route.ts:58 — idempotency lookup is key-only',
            'apps/web/src/app/api/rooms/[slug]/settlements/route.ts:47 — same key-only replay',
            'apps/web/prisma/schema.prisma:99 — expense payer and room are separately constrained',
            'apps/web/prisma/schema.prisma:132 — share member and expense are separately constrained',
        ],
    },
    {
        id: 'DS-08',
        severity: 'low',
        area: 'Design system',
        effort: 'M',
        horizon: 'Later',
        status: 'accepted risk',
        title: 'Motion and press feedback are catalogs in prose, not code',
        summary:
            'At least 34 call sites hand-enter press transforms. Equivalent raised controls move by 1/2/3px, x-only, x+y or scale; springs repeat near-identical stiffness/damping values. Generic Button haptics can also stack with semantic feedback.',
        impact: 'Equivalent controls feel mechanically different and feedback ownership is unclear.',
        action: 'Do not build a global motion-token system for its own sake. Reopen during a deliberate delight pass or for a concrete feedback defect; representative prototypes are required before a broad migration.',
        evidence: [
            'apps/web/src/components/ui/Button.tsx:135 — x-only 3px press',
            'apps/web/src/components/room/JoinGate.tsx:206 — x+y raised press',
            'apps/web/src/components/room/ReactionBar.tsx:280 — scale .9 press',
            'apps/web/src/components/ui/Button.tsx:119 — generic tap haptic on every Button',
        ],
    },
    {
        id: 'DS-09',
        severity: 'medium',
        area: 'Design system',
        effort: 'S',
        horizon: 'Now',
        title: 'Test IDs are styling hooks',
        summary:
            'Global reduced-motion and landing rules select data-testid values such as read-more and final-cta, coupling automation names to appearance.',
        impact: 'Renaming a test selector can cause a visual regression; keeping one alive can preserve dead CSS.',
        action: 'Style through component classes or explicit data-motion/data-state attributes. Ban data-testid in production CSS.',
        evidence: [
            'apps/web/src/styles/globals.css:228 — reduced-motion styles test IDs',
            'apps/web/src/styles/globals.css:349 — landing composition styles a test ID',
        ],
    },
    {
        id: 'DS-10',
        severity: 'medium',
        area: 'Design system',
        effort: 'S',
        horizon: 'Next',
        title: 'Room-theme contrast documentation overclaims legibility',
        summary:
            'themes.ts says fieldInk stays legible on field, but classic (3.97:1), bubblegum (3.80:1) and coral (4.17:1) miss the 4.5:1 text threshold. They currently render as large OG tagline text.',
        impact: 'A later call site can trust the catalog comment and use those pairs at normal text size.',
        action: 'Retune muted inks to 4.5:1 or encode/document a large/decorative-only constraint and test the actual intended threshold.',
        evidence: [
            'apps/web/src/lib/themes.ts:33 — fieldInk claimed legible',
            'apps/web/src/server/og/frame.tsx:223 — field ink used for OG text',
            'apps/web/src/server/og/card.tsx:110 — theme color reaches tagline',
        ],
    },
    {
        id: 'I18N-03',
        severity: 'low',
        area: 'Internationalization',
        effort: 'S',
        horizon: 'Later',
        title: 'Browser translation is disabled for the entire site',
        summary:
            'The root html element carries translate=no, including public guides. Three locales ship, but readers of other languages cannot normally request browser translation.',
        impact: 'Unsupported-language accessibility and discovery are narrowed without a documented route-wide rationale.',
        action: 'Remove the root prohibition or scope it to brand marks, names, money and controls that must remain exact.',
        evidence: ['apps/web/src/app/layout.tsx:115 — translate=no at document root'],
        status: 'conditional',
    },
    {
        id: 'PERF-05',
        severity: 'low',
        area: 'Performance',
        effort: 'M',
        horizon: 'Later',
        title: 'Four font families are attached at root scope',
        summary:
            'Roboto Flex, Sniglet and two Knerd faces are configured globally. Knerd files alone are about 210KB uncompressed and serve a rare wordmark treatment.',
        impact: 'Product routes may preload display assets they rarely render.',
        action: 'Inspect the production waterfall; move display/wordmark fonts to layouts/components that use them or disable unnecessary preload.',
        evidence: [
            'apps/web/src/app/layout.tsx:48 — all families configured at root',
            'apps/web/src/app/layout.tsx:125 — all variables on every body',
        ],
        status: 'conditional',
    },
    {
        id: 'OPS-03',
        severity: 'low',
        area: 'Operations',
        effort: 'M',
        horizon: 'Later',
        title: 'Runtime image carries the complete development dependency tree',
        summary:
            'The Docker runtime copies all node_modules so boot-time Prisma migration can use the CLI. The Dockerfile already records pruning as follow-up work.',
        impact: 'Images pull more bytes and production contains build/test tooling it does not need to serve.',
        action: 'Run migrations as a release job or minimal init image and copy only standalone traced production dependencies.',
        evidence: [
            'apps/web/Dockerfile:47 — rationale and follow-up documented',
            'apps/web/Dockerfile:50 — all node_modules copied',
        ],
    },
    {
        id: 'OBS-01',
        severity: 'low',
        area: 'Operations',
        effort: 'L',
        horizon: 'Later',
        title: 'Server failures have logs but no durable telemetry contract',
        summary:
            'Sentry is intentionally browser-only because the container has no egress. Server failures go to stdout; no repository-owned aggregation, alerting or correlation policy is documented.',
        impact: 'Migration, database, proxy and server-only failures may require manual log inspection.',
        action: 'Keep platform stdout for the experiment. Reopen durable collection, request correlation and alerts around 1,000 rooms, after repeated undiagnosable server failures, or with a real on-call obligation.',
        evidence: [
            'apps/web/src/instrumentation-client.ts:6 — server SDK deliberately absent',
            'apps/web/src/server/http.ts:56 — unhandled errors go to console',
            'apps/web/docker-entrypoint.sh:15 — migration failure goes to process logs',
        ],
        status: 'accepted risk',
    },
    {
        id: 'SCALE-01',
        severity: 'low',
        area: 'Resilience',
        effort: 'L',
        horizon: 'Later',
        title: 'Realtime and abuse controls are intentionally single-container',
        summary:
            'SSE subscriptions and token buckets live in process memory. A second replica doubles allowances and misses cross-replica pokes; polling remains the correctness fallback.',
        impact: 'Horizontal scaling changes freshness and abuse behavior even when the app remains eventually correct.',
        action: 'Make the one-replica invariant visible in deployment config. Before scaling, use Postgres LISTEN/NOTIFY and choose shared/edge rate enforcement.',
        evidence: [
            'apps/web/src/server/events.ts:8 — cross-replica limitation documented',
            'apps/web/src/server/rateLimit.ts:9 — limiter is per-container',
        ],
        status: 'accepted risk',
    },
    {
        id: 'QUAL-03',
        severity: 'low',
        area: 'Quality',
        effort: 'S',
        horizon: 'Later',
        title: 'History creates a formatter for every event row',
        summary:
            'HistorySheet constructs Intl.DateTimeFormat inside events.map even though the shared date module already documents cached formatter reuse for long lists.',
        impact: 'Long audit histories pay avoidable locale setup cost during each render.',
        action: 'Add a cached localized date-time helper beside the existing date cache and reuse it.',
        evidence: [
            'apps/web/src/components/room/HistorySheet.tsx:47 — formatter allocated inside row rendering',
            'apps/web/src/lib/dates.ts:133 — existing cached formatter pattern',
        ],
    },
]

const counts = Object.fromEntries(
    severityOrder.map((severity) => [severity, findings.filter((item) => item.severity === severity).length])
) as Record<Severity, number>

const metrics = [
    ['409', 'TypeScript source files'],
    ['100', 'React components'],
    ['1,719', 'Passing tests'],
    ['23', 'Next API routes'],
    ['1,962', 'Lines in ExpenseDrawer'],
    ['856KB', 'Doodle source module'],
    ['69', 'Repeated surface recipes'],
    ['101', 'Raw UI hex uses*'],
] as const

const strengths = [
    'Money stays in minor-unit strings across the client/server boundary; float use is isolated to animation display.',
    'Room writes use transactions, explicit locks, idempotency keys and extensive database-backed tests.',
    'Service-worker API traffic is NetworkOnly, preventing cached balances from masquerading as current money.',
    'Motion has both OS-level and in-product reduced-motion policy before hydration.',
    'Drawer focus restoration and inert background behavior are unusually well documented and tested by construction.',
    'Room themes and avatar palettes store allowlisted keys; arbitrary colors never enter persistent state.',
    'Catalog parity, icon provenance and marketing claims already have dedicated static audits.',
]

const verification = [
    'TypeScript strict/noEmit',
    '106 test files',
    '1,719 tests passed',
    '897 i18n keys × 3 locales',
    'UI icon audit',
    'Marketing copy audit',
]

export default function AuditPage() {
    return (
        <DocChrome page="audit">
            <div className="border-b border-n-1 bg-n-1 text-white">
                <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-h9 uppercase tracking-[0.18em] text-primary-1">
                        Deep implementation audit · 4 August 2026
                    </p>
                    <h1 className="mt-4 max-w-5xl font-display text-5xl font-extrabold leading-[0.96] tracking-[-0.04em] sm:text-7xl">
                        The system is good. Its seams are expensive.
                    </h1>
                    <p className="mt-6 max-w-3xl text-lg leading-8 text-grey-2">
                        A code-level audit of the live Next app, the legacy Fastify tree, visual primitives,
                        accessibility, runtime behavior, data paths, PWA, localization, tests and deployment. Findings
                        separate confirmed defects from conditional risks and deliberately accepted boundaries.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href="#executive-decisions" className="btn btn-primary shadow-primary-4 w-auto">
                            Review 3 leadership calls
                        </Link>
                        <Link
                            href="/dev-ds"
                            className="btn btn-stroke w-auto border-white text-white hover:bg-white hover:text-n-1"
                        >
                            Design system
                        </Link>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:px-8">
                <section aria-labelledby="scope-title">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {metrics.map(([value, label]) => (
                            <div key={label} className="shadow-2 rounded-sm border border-n-1 bg-white p-4">
                                <p className="font-display text-4xl font-extrabold text-primary-2">{value}</p>
                                <p className="mt-1 text-sm font-bold">{label}</p>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-xs text-grey-1">
                        * Excludes reviewed palette/art catalogs, OG art, tests and this documentation route.
                    </p>
                    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
                        <div className="rounded-sm border border-n-1 bg-white p-6">
                            <h2 id="scope-title" className="text-h5">
                                Method and confidence
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-grey-1">
                                Three independent specialist passes covered design-system archaeology, adversarial
                                UI/DRY consistency, and architecture/domain gaps. The integrator then verified claims
                                with repository-wide search, compiled configuration, route graphs and the complete local
                                test suite. Severity measures user/operational consequence, not code ugliness.
                            </p>
                            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {severityOrder.map((severity) => (
                                    <div key={severity} className={`rounded-sm border p-3 ${severityStyle[severity]}`}>
                                        <p className="text-2xl font-extrabold">{counts[severity]}</p>
                                        <p className="text-xs font-bold uppercase">{severity}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-sm border border-n-1 bg-primary-3 p-6">
                            <h2 className="text-h6">Verification snapshot</h2>
                            <ul className="mt-4 space-y-2 text-sm leading-6">
                                {verification.map((item) => (
                                    <li key={item} className="flex items-center gap-2">
                                        <Icon name="check" size={14} />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </section>

                <section id="priority" className="scroll-mt-24 py-14">
                    <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Recommended sequence</p>
                    <h2 className="mt-2 font-display text-4xl font-extrabold">
                        Protect the experiment. Polish the product. Defer scale.
                    </h2>
                    <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        {[
                            [
                                '1 · Cheap first-room correctness',
                                'Now · small only',
                                'Add real entropy to room links; keep import protection deliberately lightweight; prohibit RoomState caching; fix the two known write-invariant omissions. Pushing main continues to deploy.',
                            ],
                            [
                                '2 · UX, SEO and useful simplification',
                                'When it helps an experiment',
                                'Correct focus, taps, placeholders and radio keyboards; improve localized acquisition; fix the measured doodle payload. Simplify components and spaghetti only in touched product areas.',
                            ],
                            [
                                '3 · Production machinery waits',
                                'At ~1,000 rooms or measured pressure',
                                'Defer retention systems, CSP programs, browser CI, database hardening, telemetry, multi-replica work and large architecture rewrites. RoomState pagination waits for an actual payload or latency bottleneck; deploy gating waits for much larger scale.',
                            ],
                        ].map(([title, timing, body]) => (
                            <article key={title} className="shadow-4 rounded-sm border border-n-1 bg-white p-5">
                                <p className="text-h7">{title}</p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-primary-2">
                                    {timing}
                                </p>
                                <p className="mt-4 text-sm leading-6 text-grey-1">{body}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <ExecutiveQuestions />
                <AuditPicker findings={findings} />

                <section className="border-t border-n-1 py-14">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="shadow-2 rounded-sm border border-n-1 bg-primary-3 p-6">
                            <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">
                                Do not flatten the good work
                            </p>
                            <h2 className="mt-2 text-h5">Verified strengths to preserve</h2>
                            <ul className="mt-5 space-y-3 text-sm leading-6">
                                {strengths.map((item) => (
                                    <li key={item} className="flex gap-3">
                                        <Icon name="check" size={16} className="mt-1 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="shadow-2 rounded-sm border border-n-1 bg-white p-6">
                            <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Audit boundaries</p>
                            <h2 className="mt-2 text-h5">What this report does not pretend</h2>
                            <ul className="mt-5 space-y-3 text-sm leading-6 text-grey-1">
                                <li>
                                    • Duplicate utilities are evidence only when they encode stable semantics; bespoke
                                    illustration geometry should remain bespoke.
                                </li>
                                <li>
                                    • Theme inline styles are intentional runtime catalog data, not arbitrary color
                                    escape hatches.
                                </li>
                                <li>
                                    • Single-container SSE/rate limiting is documented and has fallbacks; it is a
                                    scaling condition, not a present ledger defect.
                                </li>
                                <li>
                                    • Doodle bundle measurements came from a local production build; exact transfer and
                                    cache cost can vary with the deployment build and compression layer.
                                </li>
                                <li>
                                    • External proxy configuration may supply security headers and log drains not
                                    visible in this repository; verify live responses before remediation.
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
            </div>
        </DocChrome>
    )
}
