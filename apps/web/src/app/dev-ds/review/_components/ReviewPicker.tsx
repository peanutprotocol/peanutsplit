'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Doodle } from '@/components/ui/Doodle'
import { Icon } from '@/components/ui/Icon'
import { downloadMarkdown } from '../../audit/_components/audit-browser'

type ReviewDecision = 'unreviewed' | 'approve' | 'revise' | 'keep-current' | 'defer'

interface ReviewRecord {
    decision: ReviewDecision
    note: string
    updatedAt?: string
}

interface ReviewItem {
    id: string
    auditIds: string[]
    title: string
    question: string
    recommendation: string
    implementationBoundary: string
}

type ReviewRecords = Record<string, ReviewRecord>

const STORAGE_KEY = 'peanutsplit:dev-ds:ux-review:v1'
const NOTE_LIMIT = 2_000

const reviewItems: ReviewItem[] = [
    {
        id: 'FOCUS',
        auditIds: ['A11Y-01'],
        title: 'Keyboard focus treatment',
        question: 'Should every interactive control use one high-contrast ink outline with a small offset?',
        recommendation:
            'Approve the ink outline. It is obvious on yellow, white and warm canvas, and appears only during keyboard navigation.',
        implementationBoundary:
            'Central focus-visible recipe only. Do not redesign resting borders, shadows, or control geometry.',
    },
    {
        id: 'TARGETS',
        auditIds: ['A11Y-02', 'DS-04'],
        title: '44px targets and IconButton',
        question:
            'Should compact-looking actions keep a 44px hit area, with a shared IconButton for icon-only commands?',
        recommendation:
            'Approve the 44px floor. Compact artwork can remain 16–20px while the invisible and visible control box stays reliably tappable.',
        implementationBoundary:
            'Review representative room and reaction rows before migration; preserve density through spacing, not undersized targets.',
    },
    {
        id: 'LABELS',
        auditIds: ['A11Y-03', 'DS-03'],
        title: 'Persistent labels and readable placeholders',
        question: 'Should purpose remain visible after a field contains a value?',
        recommendation:
            'Approve persistent labels and darker hint text. Placeholder copy can demonstrate format, but should never carry the field’s only name.',
        implementationBoundary:
            'Keep the current composer hierarchy and amount prominence; add clarity without adding a new step.',
    },
    {
        id: 'RADIOS',
        auditIds: ['A11Y-04'],
        title: 'Picker keyboard model',
        question: 'Should visual pickers behave as one radio-group tab stop with Arrow, Home and End movement?',
        recommendation:
            'Approve the native/roving radio model. Keep the current tile visuals; correct only selection semantics, focus, and keyboard movement.',
        implementationBoundary:
            'Extract from the working split-mode implementation. Do not introduce a new visual picker style.',
    },
    {
        id: 'THEMES',
        auditIds: ['DS-10'],
        title: 'Muted room-theme text',
        question:
            'Should the three sub-4.5:1 theme pairs be explicitly decorative-only, with ink used for ordinary text?',
        recommendation:
            'Approve the constraint now. It preserves the palettes and OG art; any future palette retune returns for visual review.',
        implementationBoundary:
            'Documentation and contrast tests only. Do not recolor current room themes in this pass.',
    },
    {
        id: 'DRAWER',
        auditIds: ['DS-05'],
        title: 'Drawer action placement',
        question:
            'When actions must stay visible, should the drawer use a fixed sibling action zone instead of placing buttons inside scrolling content?',
        recommendation:
            'Defer global standardization. Approve this layout direction only for a proven long-flow problem, after testing the real content at 390px.',
        implementationBoundary:
            'This is the only drawer change that warrants mockups. Header class consolidation and parity-only cleanup do not.',
    },
    {
        id: 'BOUNDARIES',
        auditIds: ['RES-01'],
        title: 'Error, loading and not-found states',
        question: 'Should failures keep Peanut Split’s visual language and always offer one safe next action?',
        recommendation:
            'Approve a restrained family: plain-language title, redacted detail, one recovery action, and a route-safe exit. Avoid an elaborate recovery framework.',
        implementationBoundary:
            'One translated public/app family. Never echo a room credential, stack trace, or raw server message.',
    },
]

const decisionOptions = [
    { id: 'approve', label: 'Approve', description: 'Use this proposed direction.' },
    { id: 'revise', label: 'Revise', description: 'Change it using my note.' },
    { id: 'keep-current', label: 'Keep current', description: 'Do not change this pattern.' },
    { id: 'defer', label: 'Defer', description: 'Revisit when the trigger exists.' },
] as const satisfies ReadonlyArray<{
    id: Exclude<ReviewDecision, 'unreviewed'>
    label: string
    description: string
}>

const decisionLabels: Record<ReviewDecision, string> = {
    unreviewed: 'Unreviewed',
    approve: 'Approved',
    revise: 'Needs revision',
    'keep-current': 'Keep current',
    defer: 'Deferred',
}

const decisionStyles: Record<ReviewDecision, string> = {
    unreviewed: 'border-grey-1 bg-grey-4 text-grey-1',
    approve: 'border-n-1 bg-primary-1 text-n-1',
    revise: 'border-outline-2 bg-secondary-6 text-n-1',
    'keep-current': 'border-n-1 bg-white text-n-1',
    defer: 'border-grey-1 bg-grey-4 text-grey-1',
}

const emptyRecord = (): ReviewRecord => ({ decision: 'unreviewed', note: '' })

function isDecision(value: unknown): value is ReviewDecision {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(decisionLabels, value)
}

function readRecords(): ReviewRecords {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as { records?: unknown }
        const source = parsed && typeof parsed === 'object' && parsed.records ? parsed.records : parsed
        if (!source || typeof source !== 'object') return {}
        const ids = new Set(reviewItems.map((item) => item.id))

        return Object.fromEntries(
            Object.entries(source)
                .filter(([id, value]) => {
                    if (!ids.has(id) || !value || typeof value !== 'object') return false
                    const candidate = value as Partial<ReviewRecord>
                    return isDecision(candidate.decision) && typeof candidate.note === 'string'
                })
                .map(([id, value]) => {
                    const candidate = value as ReviewRecord
                    return [
                        id,
                        {
                            decision: candidate.decision,
                            note: candidate.note.slice(0, NOTE_LIMIT),
                            ...(typeof candidate.updatedAt === 'string' ? { updatedAt: candidate.updatedAt } : {}),
                        },
                    ]
                })
        )
    } catch {
        return {}
    }
}

function buildBrief(records: ReviewRecords): string {
    const lines = [
        '# Peanut Split UX review',
        '',
        `Exported: ${new Date().toISOString()}`,
        '',
        'Mockups are representative. No live product component was changed by this review.',
        '',
    ]

    for (const item of reviewItems) {
        const record = records[item.id] ?? emptyRecord()
        lines.push(
            `## ${item.id} — ${item.title}`,
            '',
            `- Audit findings: ${item.auditIds.join(', ')}`,
            `- Decision: ${decisionLabels[record.decision]}`,
            `- Question: ${item.question}`,
            `- Recommendation: ${item.recommendation}`,
            `- Implementation boundary: ${item.implementationBoundary}`,
            `- Note: ${record.note.trim() || '—'}`,
            ''
        )
    }

    lines.push(
        '## Deferred idea — anonymous room management',
        '',
        'A separate anonymous management capability remains an idea until roughly 1,000 rooms/PMF, real demand, a legal obligation, or measured audit-table pressure. Mockups are required when it reopens.',
        ''
    )

    return lines.join('\n')
}

function downloadBrief(records: ReviewRecords) {
    downloadMarkdown('peanutsplit-ux-review.md', buildBrief(records))
}

function MockupFrame({
    label,
    tone,
    children,
}: {
    label: string
    tone: 'current' | 'proposed'
    children: React.ReactNode
}) {
    return (
        <div className="overflow-hidden rounded-sm border border-n-1 bg-grey-3">
            <div
                className={`flex min-h-10 items-center justify-between gap-3 border-b border-n-1 px-3 py-2 ${
                    tone === 'proposed' ? 'bg-primary-1' : 'bg-grey-4'
                }`}
            >
                <span className="text-xs font-extrabold uppercase tracking-wider">{label}</span>
                <span className="text-[0.65rem] font-bold uppercase text-grey-1">
                    {tone === 'proposed' ? 'Proposed' : 'Before'}
                </span>
            </div>
            <div className="min-h-64 p-4 sm:p-5">{children}</div>
        </div>
    )
}

function FocusMockup() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Yellow border only" tone="current">
                <label className="text-sm font-extrabold" htmlFor="focus-before">
                    Room name
                </label>
                <input
                    id="focus-before"
                    defaultValue="Lisbon weekend"
                    className="mt-2 h-14 w-full rounded-sm border border-n-1 bg-white px-4 font-bold outline-none focus:border-primary-1"
                />
                <p className="mt-4 text-xs leading-5 text-grey-1">
                    Click elsewhere, then Tab here. On white, the yellow edge is easy to lose.
                </p>
            </MockupFrame>
            <MockupFrame label="Ink ring + offset" tone="proposed">
                <label className="text-sm font-extrabold" htmlFor="focus-after">
                    Room name
                </label>
                <input
                    id="focus-after"
                    defaultValue="Lisbon weekend"
                    className="mt-2 h-14 w-full rounded-sm border border-n-1 bg-white px-4 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-n-1"
                />
                <p className="mt-4 text-xs leading-5 text-grey-1">
                    The resting control is unchanged. The ring appears for keyboard focus only.
                </p>
            </MockupFrame>
        </div>
    )
}

function TargetMockup() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Artwork and target both small" tone="current">
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <p className="text-sm font-extrabold">Lunch · €42.00</p>
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="Edit example"
                            className="grid size-8 place-items-center rounded-sm border border-n-1 bg-white"
                        >
                            <Icon name="pencil" size={15} />
                        </button>
                        <button
                            type="button"
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-n-1 bg-primary-3 px-2 text-xs font-bold"
                        >
                            <Doodle name="reactionclap" size={16} /> 2
                        </button>
                        <span className="text-xs text-grey-1">32px / 32px</span>
                    </div>
                </div>
            </MockupFrame>
            <MockupFrame label="Compact art, reliable target" tone="proposed">
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <p className="text-sm font-extrabold">Lunch · €42.00</p>
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="Edit example"
                            className="shadow-2 grid size-11 place-items-center rounded-sm border border-n-1 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <Icon name="pencil" size={17} />
                        </button>
                        <button
                            type="button"
                            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-n-1 bg-primary-3 px-3 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <Doodle name="reactionclap" size={16} /> 2
                        </button>
                        <span className="text-xs text-grey-1">44px floor</span>
                    </div>
                </div>
            </MockupFrame>
        </div>
    )
}

function LabelMockup() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Placeholder carries meaning" tone="current">
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <input
                        aria-label="Current expense amount example"
                        placeholder="What was it for?"
                        className="h-14 w-full border-0 border-b border-dashed border-n-1 bg-transparent px-1 text-xl font-extrabold outline-none placeholder:text-grey-2"
                    />
                    <p className="mt-3 text-xs leading-5 text-grey-1">
                        The purpose disappears when typing begins, and the hint is roughly 1.23:1 on white.
                    </p>
                </div>
            </MockupFrame>
            <MockupFrame label="Purpose stays visible" tone="proposed">
                <div className="rounded-sm border border-n-1 bg-white p-4">
                    <label
                        htmlFor="label-after"
                        className="text-xs font-extrabold uppercase tracking-wider text-grey-1"
                    >
                        Expense description
                    </label>
                    <input
                        id="label-after"
                        placeholder="e.g. Friday lunch"
                        className="mt-1 h-14 w-full border-0 border-b border-dashed border-n-1 bg-transparent px-1 text-xl font-extrabold outline-none placeholder:text-grey-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <p className="mt-3 text-xs leading-5 text-grey-1">
                        The label names the field; the placeholder is optional format guidance.
                    </p>
                </div>
            </MockupFrame>
        </div>
    )
}

const radioChoices = ['Peanut', 'Sun', 'Wave'] as const

function RadioMockup() {
    const [beforeChoice, setBeforeChoice] = useState<(typeof radioChoices)[number]>('Peanut')
    const [choice, setChoice] = useState<(typeof radioChoices)[number]>('Peanut')
    const proposedRefs = useRef<Array<HTMLButtonElement | null>>([])

    const selectAt = (index: number) => {
        const next = radioChoices[index]
        setChoice(next)
        proposedRefs.current[index]?.focus()
    }

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        let nextIndex: number | undefined
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % radioChoices.length
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            nextIndex = (index - 1 + radioChoices.length) % radioChoices.length
        if (event.key === 'Home') nextIndex = 0
        if (event.key === 'End') nextIndex = radioChoices.length - 1
        if (nextIndex === undefined) return
        event.preventDefault()
        selectAt(nextIndex)
    }

    const tileClass = (selected: boolean) =>
        `min-h-16 rounded-sm border p-3 text-sm font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            selected ? 'border-n-1 bg-primary-1 shadow-2' : 'border-n-1 bg-white'
        }`

    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Every tile is a Tab stop" tone="current">
                <div className="grid grid-cols-3 gap-2" aria-label="Current keyboard-model illustration">
                    {radioChoices.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setBeforeChoice(item)}
                            className={tileClass(beforeChoice === item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-grey-1">
                    Try Tab: it visits all three. Arrow keys do nothing, despite the control being a single choice.
                </p>
            </MockupFrame>
            <MockupFrame label="One Tab stop + Arrow movement" tone="proposed">
                <div role="radiogroup" aria-label="Proposed room motif" className="grid grid-cols-3 gap-2">
                    {radioChoices.map((item, index) => (
                        <button
                            key={item}
                            ref={(node) => {
                                proposedRefs.current[index] = node
                            }}
                            type="button"
                            role="radio"
                            aria-checked={choice === item}
                            tabIndex={choice === item ? 0 : -1}
                            onClick={() => setChoice(item)}
                            onKeyDown={(event) => onKeyDown(event, index)}
                            className={tileClass(choice === item)}
                        >
                            {item}
                        </button>
                    ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-grey-1">
                    Tab enters once. Arrow keys move and select; Home/End jump to the first/last option.
                </p>
            </MockupFrame>
        </div>
    )
}

const lowContrastThemes = [
    { name: 'Classic', field: '#FFC900', muted: '#7A5E00', ratio: '3.97:1' },
    { name: 'Bubblegum', field: '#FF90E8', muted: '#8A2E77', ratio: '3.80:1' },
    { name: 'Coral', field: '#E99898', muted: '#7A2E2E', ratio: '4.17:1' },
] as const

function ThemeMockup() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Muted pair called legible" tone="current">
                <div className="space-y-2">
                    {lowContrastThemes.map((theme) => (
                        <div
                            key={theme.name}
                            className="rounded-sm border border-n-1 p-3"
                            style={{ backgroundColor: theme.field, color: theme.muted }}
                        >
                            <p className="text-sm font-bold">{theme.name} room details</p>
                            <p className="mt-1 text-xs">{theme.ratio} for normal text</p>
                        </div>
                    ))}
                </div>
            </MockupFrame>
            <MockupFrame label="Role is explicit" tone="proposed">
                <div className="space-y-2">
                    {lowContrastThemes.map((theme) => (
                        <div
                            key={theme.name}
                            className="rounded-sm border border-n-1 p-3"
                            style={{ backgroundColor: theme.field }}
                        >
                            <p className="text-sm font-extrabold text-n-1">{theme.name} room details</p>
                            <p className="mt-1 text-xs font-bold text-n-1">Ink for ordinary text · ≥4.5:1</p>
                            <p className="mt-2 text-xl font-extrabold" style={{ color: theme.muted }}>
                                Muted display only
                            </p>
                        </div>
                    ))}
                </div>
            </MockupFrame>
        </div>
    )
}

function DrawerShell({ fixedActions }: { fixedActions: boolean }) {
    const actions = (
        <div className={`${fixedActions ? 'border-t border-n-1 bg-white' : ''} p-3`}>
            <button type="button" className="min-h-11 w-full rounded-sm border border-n-1 bg-primary-1 font-bold">
                Save expense
            </button>
        </div>
    )

    return (
        <div className="mx-auto flex h-64 max-w-xs flex-col overflow-hidden rounded-t-3xl border-2 border-b-0 border-n-1 bg-white">
            <div className="flex items-center justify-between border-b border-n-1 px-4 py-3">
                <p className="text-sm font-extrabold">Add expense</p>
                <span className="text-xs text-grey-1">×</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-grey-3 p-3">
                <div className="space-y-2">
                    <div className="h-12 rounded-sm border border-n-1 bg-white" />
                    <div className="h-12 rounded-sm border border-n-1 bg-white" />
                    <div className="h-12 rounded-sm border border-n-1 bg-white" />
                    {!fixedActions ? actions : null}
                </div>
            </div>
            {fixedActions ? actions : null}
        </div>
    )
}

function DrawerMockup() {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <MockupFrame label="Actions scroll with body" tone="current">
                <DrawerShell fixedActions={false} />
                <p className="mt-3 text-xs leading-5 text-grey-1">The primary action can move below the viewport.</p>
            </MockupFrame>
            <MockupFrame label="Actions are a body sibling" tone="proposed">
                <DrawerShell fixedActions />
                <p className="mt-3 text-xs leading-5 text-grey-1">
                    A stable footer changes usable height and should be adopted only for a proven long flow.
                </p>
            </MockupFrame>
        </div>
    )
}

type BoundaryState = 'error' | 'loading' | 'missing'

function BoundaryMockup() {
    const [state, setState] = useState<BoundaryState>('error')
    const copy = {
        error: {
            eyebrow: 'Something slipped',
            title: 'We could not open this room',
            body: 'Your link is still here. Try once more, or return to your rooms.',
            action: 'Try again',
        },
        loading: {
            eyebrow: 'Counting peanuts',
            title: 'Opening your room…',
            body: 'Balances and expenses are being brought up to date.',
            action: 'Back to rooms',
        },
        missing: {
            eyebrow: 'Nothing at this link',
            title: 'This room could not be found',
            body: 'Check the shared link, or start a fresh room in a few seconds.',
            action: 'Create a room',
        },
    } as const
    const active = copy[state]

    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Preview a route state">
                {(Object.keys(copy) as BoundaryState[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setState(key)}
                        aria-pressed={state === key}
                        className={`min-h-11 rounded-full border border-n-1 px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                            state === key ? 'bg-n-1 text-white' : 'bg-white'
                        }`}
                    >
                        {key === 'missing' ? 'Not found' : key[0].toUpperCase() + key.slice(1)}
                    </button>
                ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <MockupFrame label="Framework fallback" tone="current">
                    <div className="grid min-h-48 place-items-center bg-white p-6 text-center">
                        <div>
                            <p className="font-mono text-sm text-grey-1">Application error</p>
                            <p className="mt-2 text-xs text-grey-1">A client-side exception has occurred.</p>
                        </div>
                    </div>
                </MockupFrame>
                <MockupFrame label="Safe, useful product state" tone="proposed">
                    <div className="shadow-2 min-h-48 rounded-sm border border-n-1 bg-white p-6">
                        <p className="text-h9 uppercase tracking-wider text-grey-1">{active.eyebrow}</p>
                        <p className="mt-2 text-h5">{active.title}</p>
                        <p className="mt-3 text-sm leading-6 text-grey-1">{active.body}</p>
                        <button
                            type="button"
                            className="shadow-2 mt-5 min-h-11 rounded-sm border border-n-1 bg-primary-1 px-4 text-sm font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            {active.action}
                        </button>
                        <p className="mt-4 text-xs text-grey-1">Reference PS-8K2 · no raw error or room link</p>
                    </div>
                </MockupFrame>
            </div>
        </div>
    )
}

function ItemMockup({ id }: { id: string }) {
    if (id === 'FOCUS') return <FocusMockup />
    if (id === 'TARGETS') return <TargetMockup />
    if (id === 'LABELS') return <LabelMockup />
    if (id === 'RADIOS') return <RadioMockup />
    if (id === 'THEMES') return <ThemeMockup />
    if (id === 'DRAWER') return <DrawerMockup />
    return <BoundaryMockup />
}

function ReviewCard({
    index,
    item,
    record,
    onChange,
}: {
    index: number
    item: ReviewItem
    record: ReviewRecord
    onChange: (record: ReviewRecord) => void
}) {
    const update = (patch: Partial<ReviewRecord>) =>
        onChange({ ...record, ...patch, updatedAt: new Date().toISOString() })

    return (
        <article id={item.id.toLocaleLowerCase()} className="scroll-mt-24 py-10 sm:py-14">
            <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-n-1 bg-n-1 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider text-white">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        {item.auditIds.map((id) => (
                            <span
                                key={id}
                                className="rounded-full border border-n-1 bg-primary-3 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider"
                            >
                                {id}
                            </span>
                        ))}
                        <span
                            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider ${decisionStyles[record.decision]}`}
                        >
                            {decisionLabels[record.decision]}
                        </span>
                    </div>
                    <h2 className="mt-3 font-display text-4xl font-extrabold">{item.title}</h2>
                    <p className="mt-3 max-w-3xl text-lg font-bold leading-7">{item.question}</p>
                </div>
                <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
                    <p className="text-h9 uppercase tracking-wider">Recommendation</p>
                    <p className="mt-2 text-sm leading-6">{item.recommendation}</p>
                </div>
            </div>

            <ItemMockup id={item.id} />

            <div className="shadow-2 mt-4 grid gap-5 rounded-sm border border-n-1 bg-white p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                <fieldset>
                    <legend className="text-h7">Decision</legend>
                    <p className="mt-1 text-sm leading-5 text-grey-1">Choose one disposition for this direction.</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {decisionOptions.map((option) => (
                            <label
                                key={option.id}
                                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-sm border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${
                                    record.decision === option.id
                                        ? decisionStyles[option.id]
                                        : 'border-n-1 bg-white hover:bg-grey-3'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`review-${item.id}`}
                                    value={option.id}
                                    checked={record.decision === option.id}
                                    onChange={() => update({ decision: option.id })}
                                    className="mt-0.5 size-4 shrink-0 accent-black"
                                />
                                <span>
                                    <span className="block text-sm font-extrabold">{option.label}</span>
                                    <span className="mt-1 block text-xs leading-4">{option.description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div>
                    <div className="flex items-end justify-between gap-3">
                        <label htmlFor={`review-note-${item.id}`} className="text-h7">
                            Review note
                        </label>
                        <span className="text-xs text-grey-1">
                            {record.note.length}/{NOTE_LIMIT}
                        </span>
                    </div>
                    <textarea
                        id={`review-note-${item.id}`}
                        value={record.note}
                        onChange={(event) => update({ note: event.target.value })}
                        maxLength={NOTE_LIMIT}
                        rows={5}
                        placeholder="What should change? Call out a screen, state, copy choice, or constraint."
                        className="mt-3 w-full resize-y rounded-sm border border-n-1 bg-white px-3 py-3 text-sm leading-6 placeholder:text-grey-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    />
                    <p className="mt-3 text-xs leading-5 text-grey-1">
                        <span className="font-extrabold text-n-1">Build boundary:</span> {item.implementationBoundary}
                    </p>
                </div>
            </div>
        </article>
    )
}

export function ReviewPicker() {
    const [records, setRecords] = useState<ReviewRecords>({})
    const [hydrated, setHydrated] = useState(false)
    const [saveState, setSaveState] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')

    useEffect(() => {
        setRecords(readRecords())
        setHydrated(true)
    }, [])

    useEffect(() => {
        if (!hydrated) return
        setSaveState('saving')
        const timeout = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ version: 1, savedAt: new Date().toISOString(), records })
                )
                setSaveState('saved')
            } catch {
                setSaveState('error')
            }
        }, 250)
        return () => window.clearTimeout(timeout)
    }, [hydrated, records])

    const effectiveRecords = useMemo(
        () =>
            Object.fromEntries(
                reviewItems.map((item) => [item.id, records[item.id] ?? emptyRecord()])
            ) as ReviewRecords,
        [records]
    )
    const reviewedCount = reviewItems.filter((item) => effectiveRecords[item.id]?.decision !== 'unreviewed').length

    const reset = () => {
        if (!window.confirm('Clear all UX review decisions and notes?')) return
        window.localStorage.removeItem(STORAGE_KEY)
        setRecords({})
    }

    return (
        <section id="review-picker" className="scroll-mt-24 py-12 sm:py-16" aria-labelledby="review-picker-title">
            <div className="shadow-4 sticky top-20 z-30 rounded-sm border-2 border-n-1 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Decision workspace</p>
                        <h2 id="review-picker-title" className="mt-1 text-h5">
                            {reviewedCount} of {reviewItems.length} directions reviewed
                        </h2>
                        <p className="mt-1 text-xs text-grey-1" aria-live="polite">
                            {
                                {
                                    loading: 'Loading saved work…',
                                    saving: 'Saving…',
                                    saved: 'Saved in this browser',
                                    error: 'Could not save in this browser',
                                }[saveState]
                            }
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => downloadBrief(effectiveRecords)}
                            className="shadow-2 min-h-11 rounded-sm border border-n-1 bg-primary-1 px-4 text-sm font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            Download review brief
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={Object.keys(records).length === 0}
                            className="min-h-11 rounded-sm border border-n-1 bg-white px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Clear review
                        </button>
                    </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-grey-4" aria-hidden="true">
                    <div
                        className="h-full bg-primary-1 transition-[width]"
                        style={{ width: `${Math.round((reviewedCount / reviewItems.length) * 100)}%` }}
                    />
                </div>
            </div>

            <div className="divide-y divide-n-1">
                {reviewItems.map((item, index) => (
                    <ReviewCard
                        key={item.id}
                        index={index}
                        item={item}
                        record={effectiveRecords[item.id] ?? emptyRecord()}
                        onChange={(record) => setRecords((current) => ({ ...current, [item.id]: record }))}
                    />
                ))}
            </div>
        </section>
    )
}
