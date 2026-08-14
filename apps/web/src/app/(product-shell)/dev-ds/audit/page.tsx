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
        status: 'conditional',
        title: 'New room credentials are strong; legacy links retain 30-bit tails',
        summary:
            'New rooms keep a readable stem and add a 128-bit base64url capability. Existing three-word and six-character room links still resolve so issued links do not break.',
        impact: 'New rooms have an appropriate possession-of-link credential. Any existing weak link keeps its original guessing risk until it is retired; no transparent migration can fix that without revealing the replacement to a guesser.',
        action: 'Treat new-room generation as fixed. Keep legacy compatibility as explicit residual risk while usage is near zero; rotate only through an intentional link-breaking migration. Proxy-header hardening remains separate from the capability fix.',
        evidence: [
            'apps/web/src/server/slug.ts:10 — new tail uses 16 random bytes / 128 bits',
            'apps/web/src/server/slug.ts:21 — readable stem remains in the link',
            'apps/web/src/lib/recent-rooms.ts:18 — legacy shapes remain accepted',
            'apps/web/src/server/rateLimit.ts:95 — courtesy rate identity still trusts the first forwarding hop',
        ],
    },
    {
        id: 'SEC-03',
        severity: 'high',
        area: 'Security',
        effort: 'M',
        horizon: 'Now',
        status: 'resolved',
        title: 'Anonymous import amplification now has lean hard stops',
        summary:
            'The route now enforces the documented 20-member, 500-expense and 10,000-share envelope before validation, limits imports to five per hour per process-derived client key, and supports a configuration kill switch. Audit snapshot construction indexes shares once.',
        impact: 'One request can still create a large room by design, but it cannot exceed the explicit product envelope. Operators can stop imports without a deploy. The IP limit is a courtesy layer until the production edge proves its forwarding-header policy.',
        action: 'No distributed quota or retention project. Keep the caps and kill switch; revisit only on real abuse, proxy evidence or measured database pressure.',
        evidence: [
            'apps/web/src/app/api/import/route.ts:18 — aggregate hard ceiling',
            'apps/web/src/app/api/import/route.ts:24 — runtime kill switch',
            'apps/web/src/server/rateLimit.ts — five-import process-local budget',
            'apps/web/src/server/splitwiseImport.ts:233 — O(1) share lookup per expense',
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
            'The root builds a Fastify/Prisma API in the app schema while the live Next application owns 23 route handlers, a direct Prisma client and a different split schema. The README still describes the older topology, and its compiled Node start target currently fails on an extensionless ESM import even though the watch-mode development server works.',
        impact: 'There are two places to change money rules, API contracts, migrations and deployment assumptions. An engineer can test or patch the wrong system successfully.',
        action: 'Mark Next as authoritative and freeze Fastify. Do not schedule an XL retirement project; delete legacy pieces opportunistically when real product work touches them. Reopen on an actual wrong-tree change, repeated duplicated work, or around 1,000 rooms.',
        evidence: [
            'pnpm-workspace.yaml:2 — only apps/api is a workspace member; collapse is marked pending',
            'apps/web/src/server/db.ts:7 — Next owns a Prisma client',
            'apps/web/src/server/roomState.ts:10 — Next owns the room domain read model',
            'README.md:24 — documentation still describes Fastify as the backend',
            'apps/api/src/index.ts + tsconfig.json — bundler-style extensionless imports compile but node dist/index.js cannot resolve dist/app',
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
        status: 'resolved',
        title: 'Keyboard focus is now central and contrast-safe',
        summary:
            'Every interactive control inherits one 2px focus-visible outline with a 2px offset. Light surfaces use ink; explicitly dark surfaces use its white inverse so the outline never becomes ink-on-ink.',
        impact: 'Keyboard and switch users can keep their position without any change to resting borders, shadows or control geometry.',
        action: 'Resolved. Keep focus styling central; mark any future dark interactive container with the semantic focus-surface attribute.',
        evidence: [
            'apps/web/src/styles/globals.css — central light/dark focus-visible recipes',
            'apps/web/scripts/tailwind-class-audit.mjs — local focus ring/border drift is rejected',
            'apps/web/src/components/marketing/SiteFooter.tsx — dark surface is explicitly marked',
        ],
    },
    {
        id: 'A11Y-02',
        severity: 'high',
        area: 'Accessibility',
        effort: 'M',
        horizon: 'Now',
        status: 'accepted risk',
        title: 'Compact tap targets are intentionally unchanged',
        summary:
            'Button small/medium/large are 32/36/40px. A temporary override exists, but several live callers still use the undersized props; reaction pills and options are 28–32px.',
        impact: 'Frequent social actions are harder to hit on a moving phone and violate the project’s documented floor.',
        action: 'Leadership chose Keep current. Do not migrate sizes or add an IconButton now; reopen for a concrete usability problem or a reviewed density pass.',
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
        status: 'resolved',
        title: 'Meaningful placeholders use readable muted ink',
        summary:
            'All live composer placeholders now use n-3. The approved wording and current composer hierarchy are unchanged; the pale before-state remains only in the review specimen.',
        impact: 'Room name, expense amount and calculator hints remain readable in glare without changing copy or flow.',
        action: 'Resolved to the reviewed boundary: contrast only. The class audit rejects grey-2 placeholders in live product code.',
        evidence: [
            'apps/web/src/components/ui/composer-style.ts — shared placeholder:text-n-3 recipe',
            'apps/web/scripts/tailwind-class-audit.mjs — below-contrast live placeholder guard',
        ],
    },
    {
        id: 'A11Y-04',
        severity: 'high',
        area: 'Accessibility',
        effort: 'M',
        horizon: 'Now',
        status: 'resolved',
        title: 'Visual radio groups share the native keyboard model',
        summary:
            'Doodle, avatar, payer and split-mode choices now use one headless roving helper: one tab stop, wrapped Arrow movement, Home and End. Custom drawing and avatar shuffle remain ordinary actions.',
        impact: 'Keyboard users enter each choice group once and receive the behavior promised by its radio semantics, while touch visuals and click-close behavior stay unchanged.',
        action: 'Resolved. Keep action tiles outside the radio option set and serialize persistence while keyboard focus remains in a picker.',
        evidence: [
            'apps/web/src/components/ui/use-roving-radio-group.ts — shared keyboard behavior',
            'apps/web/src/components/ui/use-roving-radio-group.test.ts — direction, wrap and edge tests',
            'apps/web/src/components/room/DoodlePicker.tsx — custom drawing remains a separate button',
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
        status: 'resolved',
        title: 'Private JSON now fails closed against HTTP caching',
        summary:
            'The generic API JSON helper now defaults to Cache-Control: private, no-store. Room and history reads also request no-store on the client, while genuinely public routes can override the response policy.',
        impact: 'Bearer-protected ledgers no longer depend on browser or intermediary cache defaults, and stale cache replay is explicitly prohibited.',
        action: 'Resolved. Keep route and client assertions when adding new room-state reads.',
        evidence: [
            'apps/web/src/server/http.ts:27 — private, no-store is the JSON default',
            'apps/web/src/lib/api.ts — room and history reads request no-store',
            'apps/web/src/server/http.test.ts — default and public override are asserted',
            'apps/web/src/server/test/api.test.ts — RoomState response header is asserted',
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
            'Audit rows store before/after/detail snapshots, use a RESTRICT room foreign key and are protected from update/delete by a trigger. Every existing room receives a marker, while the product exposes no deletion or retention lifecycle.',
        impact: 'Abandoned, imported and user-requested data can accumulate indefinitely; ordinary hard deletion is structurally blocked. This is both an operational growth risk and a privacy/compliance design gap.',
        action: 'Document the anonymous-managed direction, but do not build retention, partitioning, expiry or deletion flows yet. Reopen around 1,000 rooms, on the first real erasure request, a concrete legal obligation, or measured audit-table growth.',
        evidence: [
            'apps/web/prisma/migrations/20260803150000_room_audit_history/migration.sql:27 — room foreign key restricts deletion',
            'apps/web/prisma/migrations/20260803150000_room_audit_history/migration.sql:32 — append-only trigger',
            'apps/web/src/server/history.ts:218 — catch-up/audit reads have no lifecycle boundary',
        ],
    },
    {
        id: 'QUAL-01',
        severity: 'high',
        area: 'Quality',
        effort: 'M',
        horizon: 'Now',
        status: 'conditional',
        title: 'Lint now validates class names; hook and landmark lint remain open',
        summary:
            'Formatting and lint now have separate commands. Lint runs formatting plus a source-aware Tailwind audit that validates radius, shadow and z-index names and prohibits test IDs as CSS hooks. React Hooks and landmark rules are not installed.',
        impact: 'The two known silent no-op classes are fixed and future scale-name mistakes now fail locally. Hook and broader accessibility mistakes still rely on TypeScript, tests and browser QA.',
        action: 'Keep the lightweight class gate now. Add React Hooks and accessibility lint only with a ratcheted baseline when the next real defect justifies the dependency and cleanup surface.',
        evidence: [
            'apps/web/package.json — format:check and classes:audit are separate',
            'apps/web/scripts/tailwind-class-audit.mjs — validates named scales and styling-hook policy',
            'apps/web/src/components/ui/PullToRefresh.tsx — uses the existing shadow-2 token',
            'apps/web/src/components/marketing/YourRooms.tsx — uses rounded-sm',
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
        impact: 'Focus traps, service-worker behavior, responsive overflow and the create/share/settle funnel can fail while 1,836 tests stay green.',
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
            'apps/web/src/app/(product-shell)/layout.tsx — product stylesheet root',
        ],
    },
    {
        id: 'ARCH-02',
        severity: 'medium',
        area: 'Architecture',
        effort: 'XL',
        horizon: 'Next',
        status: 'conditional',
        title: 'ExpenseDrawer has coherent view seams but remains a large controller',
        summary:
            'The composer, date editor and stable action zone now live in typed view components, while one tested reducer owns the ephemeral workflow state and reset. The controller fell from 1,962 to 1,742 lines, but payer/split orchestration and save behavior still share one file.',
        impact: 'The most stable rendered sections can change independently, but the split editor remains a high-conflict workflow. A full rewrite would still be riskier than incremental extraction.',
        action: 'Continue only in bounded passes when touching payer or split behavior. Extract state or sections with focused tests and screenshot parity; intentional visual changes still require mockups.',
        evidence: [
            'apps/web/src/components/room/ExpenseDrawer.tsx — controller reduced to 1,742 lines',
            'apps/web/src/components/room/expense-drawer/workflow-state.ts — one explicit ephemeral-state transition model',
            'apps/web/src/components/room/expense-drawer/ExpenseComposer.tsx — typed presentation-only composer',
            'apps/web/src/components/room/expense-drawer/ExpenseDateEditor.tsx — isolated date section',
            'apps/web/src/components/room/expense-drawer/ExpenseDrawerActions.tsx — isolated write action zone',
        ],
    },
    {
        id: 'ARCH-03',
        severity: 'medium',
        area: 'Architecture',
        effort: 'L',
        horizon: 'Next',
        status: 'resolved',
        title: 'Query behavior now has explicit domain modules',
        summary:
            'The former 830-line module is now a 47-line compatibility barrel over core, reads, offline, expenses, settlements, members/settings, reactions and import modules. Existing callers and exports did not change.',
        impact: 'Unrelated features no longer collide in one file, while cache keys, optimistic behavior, idempotent retry and polling/SSE policy keep their existing contracts.',
        action: 'Resolved. Keep domain modules independent and preserve the compatibility barrel until caller-level imports provide a measured bundle or ownership benefit.',
        evidence: [
            'apps/web/src/lib/queries.ts — 47-line public compatibility barrel',
            'apps/web/src/lib/queries/core.ts — cache and state-seeding contract',
            'apps/web/src/lib/queries/reads.ts — read, polling and SSE policy',
            'apps/web/src/lib/queries/expenses.ts — optimistic and offline expense behavior',
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
            'apps/web/src/app/(product-shell)/layout.tsx — product routes receive the same providers',
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
        status: 'conditional',
        title: 'The first dead token aliases are removed; semantic overlap remains',
        summary:
            'Unused gray, yellow, black and duplicate four-pixel shadow aliases are gone, and live callers use primary, n-1 and shadow-4. The grey and n semantic overlap remains because both have broad live use.',
        impact: 'The obvious dead choices no longer invite new use. A full color-ontology rewrite would still cause broad churn without a product payoff.',
        action: 'Stop here until real visual work touches the remaining overlap. Remove an alias only with mechanical caller migration and rendered parity.',
        evidence: [
            'apps/web/tailwind.config.js — unused gray/yellow/black aliases removed',
            'apps/web/tailwind.config.js — shadow-4 is the sole generic four-pixel surface shadow',
            'apps/web/src/components/import/SplitwiseImport.tsx — uses primary-1 instead of yellow-1',
            'apps/web/src/components/ui/Drawer.tsx — uses n-1 instead of black',
        ],
    },
    {
        id: 'DS-03',
        severity: 'medium',
        area: 'Design system',
        effort: 'L',
        horizon: 'Next',
        title: 'The proven composer recipe now has one typed style source',
        summary:
            'Room creation, expense composition and tool calculators now share the same composer surface, row, bare-input, boxed-input and currency-slot recipes. Generic white cards remain local when their semantics differ.',
        impact: 'The three equivalent workflows can no longer drift on their core receipt geometry, without forcing dozens of unrelated cards through a universal abstraction.',
        action: 'Resolved for the proven composer family. Add new recipes only after three live call sites demonstrate the same role.',
        evidence: [
            'apps/web/src/components/ui/composer-style.ts — stable composer recipes',
            'apps/web/src/components/room/CreateRoomForm.tsx — migrated live room composer',
            'apps/web/src/components/room/expense-drawer/ExpenseComposer.tsx — migrated expense composer',
            'apps/web/src/components/tools/ToolCalculator.tsx — local duplicated constants removed',
        ],
        status: 'resolved',
    },
    {
        id: 'DS-04',
        severity: 'medium',
        area: 'Design system',
        effort: 'M',
        horizon: 'Now',
        status: 'conditional',
        title: 'Drawer shims are gone; button-size correction awaits visual approval',
        summary:
            'Drawer border and header geometry now live in DrawerContent and DrawerHeader, and all caller class shims were removed with parity. control.ts still corrects named button sizes at selected callers because folding it changes live target geometry.',
        impact: 'New drawers inherit correct geometry automatically. Button size still has a temporary second source until the 44px target proposal is reviewed.',
        action: 'Resolved for drawers. Review TARGETS in the UX picker before changing Button sizes and deleting control.ts.',
        evidence: [
            'apps/web/src/components/ui/Drawer.tsx — default border and left header geometry',
            'apps/web/src/components/ui/DrawerLayout.tsx — only body/action layout remains',
            'apps/web/src/components/ui/control.ts — button-size shim remains pending review',
            'apps/web/src/app/(product-shell)/dev-ds/review — TARGETS mockup and decision field',
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
        status: 'resolved',
        title: 'Buttons and button-like links now share one style contract',
        summary:
            'A server-safe buttonClassName recipe now serves Button and real anchors/spans without invalid nested controls. Button exposes typed full/auto width, and live Button callers use it instead of class overrides.',
        impact: 'Visual changes have one source while anchors preserve navigation semantics. Decorative inner spans can opt out of duplicate press transforms.',
        action: 'Resolved. Keep button appearance in button-style.ts and interaction behavior explicit for nested decorative artwork.',
        evidence: [
            'apps/web/src/components/ui/button-style.ts — shared variant, shadow, width and press recipe',
            'apps/web/src/components/ui/Button.tsx — typed width API',
            'apps/web/scripts/tailwind-class-audit.mjs — nested anchor/button controls are rejected',
            'apps/web/src/components/marketing/FinalCta.tsx — nested artwork disables duplicate press motion',
        ],
    },
    {
        id: 'DS-07',
        severity: 'medium',
        area: 'Design system',
        effort: 'S',
        horizon: 'Now',
        status: 'resolved',
        title: 'Named Tailwind scale classes are now checked',
        summary:
            'The two no-op classes were replaced with shadow-2 and rounded-sm. A source-aware audit now checks radius, shadow and z-index names against the resolved Tailwind theme and the small component-shadow catalog.',
        impact: 'The intended depth and radius now render, and future misspelt scale names fail the lint command.',
        action: 'Resolved. Extend the focused validator only when another silent utility family proves necessary.',
        evidence: [
            'apps/web/src/components/ui/PullToRefresh.tsx — uses shadow-2',
            'apps/web/src/components/marketing/YourRooms.tsx — uses rounded-sm',
            'apps/web/scripts/tailwind-class-audit.mjs — resolved-scale validation',
            'apps/web/package.json — classes:audit runs through lint',
        ],
    },
    {
        id: 'I18N-02',
        severity: 'medium',
        area: 'Internationalization',
        effort: 'M',
        horizon: 'Now',
        status: 'resolved',
        title: 'Every literal server error code has a translated client contract',
        summary:
            'The missing history, catch-up, edit, request-size, push and import-switch codes now exist in English, Spanish and Portuguese. A TypeScript-AST contract test discovers literal codes emitted by server/API code and checks the typed client catalog.',
        impact: 'Known failures stay localized. Unknown future codes use safe localized/surface fallback copy rather than exposing a raw server message.',
        action: 'Resolved. Add a translated entry in the same change as each new literal server code.',
        evidence: [
            'apps/web/src/lib/error-messages.ts — typed known-code catalog',
            'apps/web/src/lib/error-messages.test.ts — emitted-code contract scan',
            'apps/web/src/lib/error-messages.test.ts — unknown-code credential canary',
            'apps/web/src/i18n/messages/*.json — all three locale entries',
            'apps/web/src/app/api/import/route.ts — IMPORT_UNAVAILABLE is covered',
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
            'apps/web/src/app/(product-shell)/layout.tsx — dynamic consequence documented',
            'apps/web/src/app/(product-shell)/layout.tsx — awaits getLocale at root',
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
            'Next config and the request proxy define no CSP, frame-ancestors, Referrer-Policy or Permissions-Policy. The app persists member tokens and the room URL is a credential.',
        impact: 'An XSS or hostile embed has a larger blast radius and broader browser capabilities than needed.',
        action: 'Check the live edge and add only cheap non-breaking defaults opportunistically. Defer CSP reporting, nonces and enforcement until roughly 1,000 rooms, before user-authored HTML, or when a privileged third-party script is added.',
        evidence: [
            'apps/web/next.config.js:11 — no headers() policy',
            'apps/web/src/proxy.ts:20 — only locale injection',
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
        status: 'resolved',
        title: 'Routes have restrained translated fallback states',
        summary:
            'Root error and not-found boundaries plus a room loading boundary now share one small product state family. Boundaries pass only catalog translations and never pass error objects, request paths or room credentials into the presentation component.',
        impact: 'Ordinary route failures offer retry or a safe exit instead of framework copy, without introducing a recovery framework.',
        action: 'Resolved for the current app. A root-layout global-error remains deliberately deferred because it cannot reuse the locale/provider shell safely.',
        evidence: [
            'apps/web/src/app/error.tsx — reset plus safe /app exit; error object is never rendered',
            'apps/web/src/app/not-found.tsx — translated 404 family',
            'apps/web/src/app/(product-shell)/r/[slug]/loading.tsx — localized room loading status',
            'apps/web/src/components/ui/RouteState.tsx — safe presentation contract',
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
        status: 'resolved',
        title: 'Test IDs are no longer production styling hooks',
        summary:
            'Reduced-motion styling uses data-motion attributes, and stale hero selectors tied to deleted test IDs are gone. The Tailwind audit fails any data-testid selector in production CSS.',
        impact: 'Automation names can change without altering appearance, and dead tests cannot keep styling alive.',
        action: 'Resolved. Use component classes or explicit data-state/data-motion attributes for visual behavior.',
        evidence: [
            'apps/web/src/styles/globals.css — no data-testid selectors remain',
            'apps/web/scripts/tailwind-class-audit.mjs — styling-hook policy is enforced',
        ],
    },
    {
        id: 'DS-10',
        severity: 'medium',
        area: 'Design system',
        effort: 'S',
        horizon: 'Next',
        status: 'resolved',
        title: 'Muted room-theme ink is constrained to display artwork',
        summary:
            'All palette colors are unchanged. fieldInk is explicitly large/decorative OG-only; ordinary room text uses shared black ink, which every field clears at 4.5:1.',
        impact: 'Future UI code cannot mistake the three sub-4.5:1 pairs for body-text tokens, while current room themes and generated cards remain visually identical.',
        action: 'Resolved through documentation, contrast tests and a source audit. Any palette retune returns for visual review.',
        evidence: [
            'apps/web/src/lib/themes.ts — fieldInk usage contract',
            'apps/web/src/lib/themes.test.ts — 4.5:1 ordinary ink and 3:1 display ink floors',
            'apps/web/scripts/tailwind-class-audit.mjs — product UI cannot consume fieldInk',
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
        evidence: ['apps/web/src/app/(product-shell)/layout.tsx — translate=no at product document root'],
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
            'apps/web/src/lib/fonts.ts — all families configured once',
            'apps/web/src/app/(product-shell)/layout.tsx — all variables on every product body',
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
    ['441', 'TypeScript source files'],
    ['106', 'React components'],
    ['1,836', 'Local tests passed'],
    ['23', 'Next API routes'],
    ['1,742', 'Lines in ExpenseDrawer'],
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
    '115 test files',
    '1,836 local tests passed',
    '924 i18n keys × 3 locales',
    'UI icon audit',
    'Marketing copy audit',
]

export default function AuditPage() {
    return (
        <DocChrome page="audit">
            <div data-focus-surface="dark" className="border-b border-n-1 bg-n-1 text-white">
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
                        <Link href="#executive-decisions" className="btn btn-primary shadow-4 w-auto">
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
                                '2 · UX, SEO and deliberate simplification',
                                'Next engineering pass',
                                'Correct focus, taps, placeholders and radio keyboards; improve localized acquisition; fix the measured doodle payload. Run bounded ExpenseDrawer, query-layer, token and proven component-recipe refactors with behavior and screenshot parity.',
                            ],
                            [
                                '3 · Production machinery waits',
                                'At ~1,000 rooms or measured pressure',
                                'Defer anonymous room-management flows, retention systems, CSP programs, browser CI, database hardening, telemetry, multi-replica work and large architecture rewrites. Reopen management around 1,000 rooms, PMF or real demand; RoomState pagination waits for an actual payload or latency bottleneck.',
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
