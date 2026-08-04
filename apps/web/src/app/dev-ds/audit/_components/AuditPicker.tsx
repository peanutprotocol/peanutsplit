'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { downloadMarkdown } from './audit-browser'
import { auditRecommendations } from './audit-recommendations'
import {
    severityOrder,
    severityStyle,
    type AuditRecommendation,
    type Decision,
    type Finding,
    type FindingDecision,
    type PriorConflict,
    type Severity,
} from './audit-model'

type DecisionRecords = Record<string, FindingDecision>
type DecisionFilter = Decision | 'all'
type SeverityFilter = Severity | 'all'
type SaveState = 'loading' | 'saving' | 'saved' | 'error'

const STORAGE_KEY = 'peanutsplit:dev-ds:audit-decisions:v2'
const NOTE_LIMIT = 2_000

const decisions = [
    {
        id: 'fix-now',
        label: 'Fix now',
        description: 'Approved for immediate work.',
    },
    {
        id: 'plan',
        label: 'Plan',
        description: 'Accepted; scope and schedule it.',
    },
    {
        id: 'mockup-review',
        label: 'Mockup review',
        description: 'Approve the visual or flow direction first.',
    },
    {
        id: 'accept',
        label: 'Accept risk',
        description: 'Keep the current tradeoff deliberately.',
    },
    {
        id: 'defer',
        label: 'Defer',
        description: 'Revisit when context changes.',
    },
    {
        id: 'disagree',
        label: 'Disagree',
        description: 'Reject or reframe this finding.',
    },
] as const satisfies ReadonlyArray<{ id: Exclude<Decision, 'unreviewed'>; label: string; description: string }>

const decisionLabels: Record<Decision, string> = {
    unreviewed: 'Unreviewed',
    'fix-now': 'Fix now',
    plan: 'Plan',
    'mockup-review': 'Mockup review',
    accept: 'Accept risk',
    defer: 'Defer',
    disagree: 'Disagree',
}

const decisionStyle: Record<Decision, string> = {
    unreviewed: 'border-grey-1 bg-grey-4 text-grey-1',
    'fix-now': 'border-error bg-error-1 text-error',
    plan: 'border-n-1 bg-primary-1 text-n-1',
    'mockup-review': 'border-outline-2 bg-secondary-6 text-n-1',
    accept: 'border-n-1 bg-primary-3 text-n-1',
    defer: 'border-grey-1 bg-white text-grey-1',
    disagree: 'border-n-1 bg-n-1 text-white',
}

const emptyDecision = (): FindingDecision => ({ decision: 'unreviewed', note: '' })
const recommendationRecords: DecisionRecords = auditRecommendations
const recommendationDetails: Record<string, AuditRecommendation> = auditRecommendations

function isDecision(value: unknown): value is Decision {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(decisionLabels, value)
}

function readStoredDecisions(findingIds: Set<string>): DecisionRecords {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as { decisions?: unknown }
        const source = parsed && typeof parsed === 'object' && parsed.decisions ? parsed.decisions : parsed
        if (!source || typeof source !== 'object') return {}

        return Object.fromEntries(
            Object.entries(source)
                .filter(([id, value]) => {
                    if (!findingIds.has(id) || !value || typeof value !== 'object') return false
                    const candidate = value as Partial<FindingDecision>
                    return isDecision(candidate.decision) && typeof candidate.note === 'string'
                })
                .map(([id, value]) => {
                    const candidate = value as FindingDecision
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

function buildDecisionBrief(findings: Finding[], records: DecisionRecords, overriddenIds: Set<string>): string {
    const reviewed = findings.filter(
        (finding) => (records[finding.id]?.decision ?? 'unreviewed') !== 'unreviewed'
    ).length
    const counts = Object.fromEntries(
        (Object.keys(decisionLabels) as Decision[]).map((decision) => [
            decision,
            findings.filter((finding) => (records[finding.id]?.decision ?? 'unreviewed') === decision).length,
        ])
    ) as Record<Decision, number>

    const lines = [
        '# Peanut Split audit decisions',
        '',
        `Exported: ${new Date().toISOString()}`,
        `Progress: ${reviewed}/${findings.length} reviewed`,
        '',
        '## Decision summary',
        '',
        ...Object.entries(decisionLabels).map(([decision, label]) => `- ${label}: ${counts[decision as Decision]}`),
        '',
        '## Findings',
        '',
    ]

    for (const finding of findings) {
        const record = records[finding.id] ?? emptyDecision()
        lines.push(
            `### ${finding.id} — ${finding.title}`,
            '',
            `- Decision: ${decisionLabels[record.decision]}`,
            `- Source: ${overriddenIds.has(finding.id) ? 'Manual override' : 'Agent recommendation'}`,
            `- Severity: ${finding.severity}`,
            `- Area: ${finding.area}`,
            `- Horizon / effort: ${finding.horizon} / ${finding.effort}`,
            `- Recommended move: ${finding.action}`,
            `- Note: ${record.note.trim() || '—'}`,
            ''
        )
    }

    return lines.join('\n')
}

function FindingCard({
    finding,
    record,
    overridden,
    priorConflict,
    onChange,
    onRestore,
}: {
    finding: Finding
    record: FindingDecision
    overridden: boolean
    priorConflict?: PriorConflict
    onChange: (next: FindingDecision) => void
    onRestore: () => void
}) {
    const updateDecision = (decision: Decision) =>
        onChange({ ...record, decision, updatedAt: new Date().toISOString() })
    const updateNote = (note: string) => onChange({ ...record, note, updatedAt: new Date().toISOString() })

    return (
        <article
            id={finding.id.toLowerCase()}
            className="shadow-2 scroll-mt-24 overflow-hidden rounded-sm border border-n-1 bg-white"
        >
            <div className="flex flex-wrap items-center gap-2 border-b border-n-1 bg-grey-3 px-4 py-3">
                <span
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider ${severityStyle[finding.severity]}`}
                >
                    {finding.severity}
                </span>
                <span className="text-xs font-bold text-grey-1">{finding.id}</span>
                <span className="text-xs text-grey-1">{finding.area}</span>
                <span className="text-xs font-bold sm:ml-auto">
                    {finding.horizon} · {finding.effort}
                </span>
                {finding.status && finding.status !== 'confirmed' ? (
                    <span className="rounded-full border border-n-1 bg-white px-2 py-1 text-[0.65rem] font-bold uppercase">
                        {finding.status}
                    </span>
                ) : null}
                <span
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider ${decisionStyle[record.decision]}`}
                >
                    {decisionLabels[record.decision]}
                </span>
                <span className="text-[0.65rem] font-bold uppercase tracking-wider text-grey-1">
                    {overridden ? 'Manual override' : 'Agent recommendation'}
                </span>
            </div>

            <div className="p-5 sm:p-6">
                <h3 className="text-h5">{finding.title}</h3>
                <p className="mt-3 text-sm leading-6 text-grey-1">{finding.summary}</p>
                {priorConflict ? (
                    <div className="mt-4 rounded-sm border-2 border-error bg-error-1 p-4">
                        <p className="text-h9 uppercase tracking-wider text-error">
                            Previous intuition superseded · {priorConflict.decision}
                        </p>
                        <p className="mt-2 text-sm leading-6">{priorConflict.explanation}</p>
                    </div>
                ) : null}
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-sm border border-n-1 bg-error-1 p-4">
                        <p className="text-h9 uppercase tracking-wider text-error">Why it matters</p>
                        <p className="mt-2 text-sm leading-6">{finding.impact}</p>
                    </div>
                    <div className="rounded-sm border border-n-1 bg-primary-3 p-4">
                        <p className="text-h9 uppercase tracking-wider">Recommended move</p>
                        <p className="mt-2 text-sm leading-6">{finding.action}</p>
                    </div>
                </div>

                <div className="mt-5 rounded-sm border-2 border-n-1 bg-grey-3 p-4 sm:p-5">
                    <fieldset>
                        <legend className="text-h7">Disposition</legend>
                        <p className="mt-1 text-sm leading-5 text-grey-1">
                            Prefilled by the audit triage. Override it only when your context changes the call.
                        </p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                            {decisions.map((option) => {
                                const selected = record.decision === option.id
                                return (
                                    <label
                                        key={option.id}
                                        className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors hover:bg-primary-3 ${
                                            selected ? decisionStyle[option.id] : 'border-n-1 bg-white'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name={`decision-${finding.id}`}
                                            value={option.id}
                                            checked={selected}
                                            onChange={() => updateDecision(option.id)}
                                            className="mt-0.5 size-4 shrink-0 accent-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                        />
                                        <span>
                                            <span className="block text-sm font-extrabold">{option.label}</span>
                                            <span className="mt-1 block text-xs leading-4">{option.description}</span>
                                        </span>
                                    </label>
                                )
                            })}
                        </div>
                        {overridden ? (
                            <button
                                type="button"
                                onClick={onRestore}
                                className="mt-3 min-h-11 text-sm font-bold underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Restore agent recommendation
                            </button>
                        ) : null}
                    </fieldset>

                    <div className="mt-4 border-t border-n-1 pt-4">
                        <div className="flex items-end justify-between gap-3">
                            <label htmlFor={`note-${finding.id}`} className="text-sm font-extrabold">
                                Decision rationale
                            </label>
                            <span className="text-xs text-grey-1">
                                {record.note.length}/{NOTE_LIMIT}
                            </span>
                        </div>
                        <textarea
                            id={`note-${finding.id}`}
                            value={record.note}
                            onChange={(event) => updateNote(event.target.value)}
                            maxLength={NOTE_LIMIT}
                            rows={4}
                            placeholder="Capture the rationale, owner, dependencies, or what would change this decision."
                            className="mt-2 w-full resize-y rounded-sm border border-n-1 bg-white px-3 py-3 text-sm leading-6 placeholder:text-grey-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                    </div>
                </div>

                <details className="mt-4 rounded-sm border border-n-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                        Evidence <Icon name="chevron-down" size={16} />
                    </summary>
                    <ul className="space-y-2 border-t border-n-1 p-4 font-mono text-xs leading-5 text-grey-1">
                        {finding.evidence.map((item) => (
                            <li key={item}>• {item}</li>
                        ))}
                    </ul>
                </details>
            </div>
        </article>
    )
}

export function AuditPicker({ findings }: { findings: Finding[] }) {
    const findingIds = useMemo(() => new Set(findings.map((finding) => finding.id)), [findings])
    const [records, setRecords] = useState<DecisionRecords>({})
    const [hydrated, setHydrated] = useState(false)
    const [saveState, setSaveState] = useState<SaveState>('loading')
    const [query, setQuery] = useState('')
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
    const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all')
    const [conflictOnly, setConflictOnly] = useState(false)

    useEffect(() => {
        setRecords(readStoredDecisions(findingIds))
        setHydrated(true)
        setSaveState('saving')
    }, [findingIds])

    useEffect(() => {
        if (!hydrated) return
        setSaveState('saving')
        const timeout = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ version: 2, savedAt: new Date().toISOString(), decisions: records })
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
                findings.map((finding) => [
                    finding.id,
                    records[finding.id] ?? recommendationRecords[finding.id] ?? emptyDecision(),
                ])
            ) as DecisionRecords,
        [findings, records]
    )

    const getRecord = (id: string) => effectiveRecords[id] ?? emptyDecision()
    const reviewedCount = findings.filter((finding) => getRecord(finding.id).decision !== 'unreviewed').length
    const noteCount = findings.filter((finding) => getRecord(finding.id).note.trim()).length
    const overrideCount = Object.keys(records).length
    const conflictCount = findings.filter((finding) => recommendationDetails[finding.id]?.priorConflict).length
    const progress = findings.length ? Math.round((reviewedCount / findings.length) * 100) : 0

    const decisionCounts = useMemo(
        () =>
            Object.fromEntries(
                (Object.keys(decisionLabels) as Decision[]).map((decision) => [
                    decision,
                    findings.filter((finding) => effectiveRecords[finding.id]?.decision === decision).length,
                ])
            ) as Record<Decision, number>,
        [effectiveRecords, findings]
    )

    const visibleFindings = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase()
        return [...findings]
            .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
            .filter((finding) => severityFilter === 'all' || finding.severity === severityFilter)
            .filter((finding) => decisionFilter === 'all' || effectiveRecords[finding.id]?.decision === decisionFilter)
            .filter((finding) => !conflictOnly || Boolean(recommendationDetails[finding.id]?.priorConflict))
            .filter((finding) => {
                if (!needle) return true
                const record = effectiveRecords[finding.id]
                return [finding.id, finding.title, finding.area, finding.summary, finding.action, record?.note ?? '']
                    .join(' ')
                    .toLocaleLowerCase()
                    .includes(needle)
            })
    }, [conflictOnly, decisionFilter, effectiveRecords, findings, query, severityFilter])

    const updateRecord = (id: string, next: FindingDecision) => setRecords((current) => ({ ...current, [id]: next }))

    const resetDecisions = () => {
        if (!window.confirm('Remove every manual override and restore the agent triage?')) return
        window.localStorage.removeItem(STORAGE_KEY)
        setRecords({})
    }

    const exportBrief = () => {
        downloadMarkdown(
            'peanutsplit-audit-decisions.md',
            buildDecisionBrief(findings, effectiveRecords, new Set(Object.keys(records)))
        )
    }

    return (
        <section id="decisions" className="scroll-mt-24 pb-14" aria-labelledby="decision-picker-title">
            <div className="shadow-4 rounded-sm border-2 border-n-1 bg-primary-1 p-5 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Decision workspace</p>
                        <h2 id="decision-picker-title" className="mt-2 font-display text-4xl font-extrabold">
                            Turn findings into calls
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-grey-1 sm:text-base">
                            Three specialist reviews prefilled every engineering call using the pre-user rule: fix cheap
                            foundations, plan real quality debt, mock up broad UX changes, and defer speculative scale.
                            The {conflictCount} older snap calls that materially pull elsewhere are marked in red;
                            pacing differences are intentionally ignored. Your overrides autosave only in this browser.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" variant="dark" className="w-auto" onClick={exportBrief} disableHaptics>
                            Download decision brief
                        </Button>
                        <button
                            type="button"
                            onClick={resetDecisions}
                            disabled={overrideCount === 0}
                            className="min-h-11 px-2 text-sm font-bold underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Restore all recommendations
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div>
                        <div className="flex items-center justify-between gap-4 text-sm font-bold">
                            <span>
                                {reviewedCount} of {findings.length} triaged
                            </span>
                            <span>{progress}%</span>
                        </div>
                        <div
                            className="mt-2 h-3 overflow-hidden rounded-full border border-n-1 bg-white"
                            role="progressbar"
                            aria-label="Audit findings triaged"
                            aria-valuemin={0}
                            aria-valuemax={findings.length}
                            aria-valuenow={reviewedCount}
                        >
                            <div className="h-full bg-n-1 transition-[width]" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                    <p className="text-sm font-bold" aria-live="polite">
                        {noteCount} rationales · {overrideCount} manual overrides ·{' '}
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
            </div>

            <div className="shadow-2 mt-5 rounded-sm border border-n-1 bg-white p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.45fr)_minmax(10rem,0.45fr)]">
                    <label className="block text-sm font-bold">
                        Search findings and notes
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="ID, title, area, recommendation, note…"
                            className="mt-2 min-h-11 w-full rounded-sm border border-n-1 bg-white px-3 text-sm placeholder:text-grey-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        />
                    </label>
                    <label className="block text-sm font-bold">
                        Severity
                        <select
                            value={severityFilter}
                            onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
                            className="mt-2 min-h-11 w-full rounded-sm border border-n-1 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <option value="all">All severities</option>
                            {severityOrder.map((severity) => (
                                <option key={severity} value={severity}>
                                    {severity[0].toUpperCase() + severity.slice(1)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm font-bold">
                        Decision
                        <select
                            value={decisionFilter}
                            onChange={(event) => setDecisionFilter(event.target.value as DecisionFilter)}
                            className="mt-2 min-h-11 w-full rounded-sm border border-n-1 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <option value="all">All decisions</option>
                            {(Object.keys(decisionLabels) as Decision[]).map((decision) => (
                                <option key={decision} value={decision}>
                                    {decisionLabels[decision]} ({decisionCounts[decision]})
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2" aria-label="Decision summary">
                    {(Object.keys(decisionLabels) as Decision[]).map((decision) => (
                        <button
                            key={decision}
                            type="button"
                            onClick={() => setDecisionFilter(decisionFilter === decision ? 'all' : decision)}
                            aria-pressed={decisionFilter === decision}
                            className={`min-h-11 rounded-full border px-3 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                                decisionFilter === decision ? decisionStyle[decision] : 'border-n-1 bg-white'
                            }`}
                        >
                            {decisionLabels[decision]} · {decisionCounts[decision]}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setConflictOnly((current) => !current)}
                        aria-pressed={conflictOnly}
                        className={`min-h-11 rounded-full border px-3 text-xs font-extrabold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                            conflictOnly ? 'border-error bg-error-1 text-error' : 'border-n-1 bg-white'
                        }`}
                    >
                        Previous conflicts · {conflictCount}
                    </button>
                </div>
            </div>

            <div className="my-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">Evidence-backed findings</p>
                    <h2 className="mt-2 font-display text-4xl font-extrabold">
                        {visibleFindings.length} of {findings.length} shown
                    </h2>
                </div>
                <p className="text-sm text-grey-1">Effort: S · M · L · XL</p>
            </div>

            {visibleFindings.length ? (
                <div className="space-y-5">
                    {visibleFindings.map((finding) => (
                        <FindingCard
                            key={finding.id}
                            finding={finding}
                            record={getRecord(finding.id)}
                            overridden={Boolean(records[finding.id])}
                            priorConflict={recommendationDetails[finding.id]?.priorConflict}
                            onChange={(next) => updateRecord(finding.id, next)}
                            onRestore={() =>
                                setRecords((current) => {
                                    const next = { ...current }
                                    delete next[finding.id]
                                    return next
                                })
                            }
                        />
                    ))}
                </div>
            ) : (
                <div className="shadow-2 rounded-sm border border-n-1 bg-white p-8 text-center">
                    <p className="text-h6">No findings match these filters.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setQuery('')
                            setSeverityFilter('all')
                            setDecisionFilter('all')
                            setConflictOnly(false)
                        }}
                        className="mt-3 min-h-11 text-sm font-bold underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        Reset filters
                    </button>
                </div>
            )}
        </section>
    )
}
