'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { downloadMarkdown } from './audit-browser'

interface ExecutiveChoice {
    id: string
    label: string
    description: string
    recommended?: boolean
}

interface ExecutiveQuestion {
    id: string
    title: string
    question: string
    consequence: string
    recommendation: string
    recordedChoice?: string
    choices: ExecutiveChoice[]
}

interface ExecutiveAnswer {
    choice: string
    note: string
    updatedAt?: string
}

type AnswerRecords = Record<string, ExecutiveAnswer>
type SaveState = 'loading' | 'saving' | 'saved' | 'error'

const STORAGE_KEY = 'peanutsplit:dev-ds:executive-decisions:v2'
const NOTE_LIMIT = 2_000

const questions: ExecutiveQuestion[] = [
    {
        id: 'EXEC-01',
        title: 'Room ownership and lifecycle',
        question: 'What promise should a room link make about access, recovery, and deletion?',
        consequence:
            'This decides whether the product needs owners, management credentials, link rotation, account recovery, and a visible delete/archive flow.',
        recommendation:
            'Direction recorded, not active scope: stay no-account and possession-of-link before product-market fit. A separate capability could eventually rotate or delete, but that flow stays in ideas until roughly 1,000 rooms, PMF or real demand; require mockups when it reopens.',
        recordedChoice: 'anonymous-managed',
        choices: [
            {
                id: 'anonymous-managed',
                label: 'Anonymous + manageable',
                description: 'Strong share link plus a separate rotate/delete capability.',
                recommended: true,
            },
            {
                id: 'anonymous-permanent',
                label: 'Anonymous + permanent',
                description: 'Anyone with the link edits; ledgers never become user-deletable.',
            },
            {
                id: 'owned-accounts',
                label: 'Accounts + ownership',
                description: 'Add identity, roles, recovery, revocation, and owned deletion.',
            },
        ],
    },
    {
        id: 'EXEC-02',
        title: 'Acquisition and canonical domain',
        question: 'Is localized SEO content a launch acquisition channel, and where is the canonical home?',
        consequence:
            'This controls the public/app route split, static rendering priority, canonical URLs, redirects, and whether the three locale catalogs remain launch scope.',
        recommendation:
            'Decision recorded: consolidate under the Peanut domain and keep localized SEO as a launch acquisition surface. Execute this as an intentional canonical migration; the exact host/path split remains the one open call below.',
        recordedChoice: 'peanut-domain-seo',
        choices: [
            {
                id: 'peanutsplit-seo',
                label: 'peanutsplit.com + SEO',
                description: 'Keep the current domain and invest in static localized public pages.',
                recommended: true,
            },
            {
                id: 'peanut-domain-seo',
                label: 'Peanut domain + SEO',
                description: 'Move product/content under peanut.me with a planned migration.',
            },
            {
                id: 'product-only',
                label: 'Product-first only',
                description: 'Deprioritize localized editorial SEO until there is demand.',
            },
        ],
    },
    {
        id: 'EXEC-03',
        title: 'Splitwise import at launch',
        question: 'Is anonymous Splitwise import a core onboarding differentiator?',
        consequence:
            'The answer determines whether to retain a public write-heavy endpoint, add lean safeguards before promotion, or remove a large abuse and lifecycle surface for now.',
        recommendation:
            'Decision recorded: keep import available but quiet. Add only lean safeguards—strict caps, efficient snapshot construction, monitoring, and a kill switch—and defer distributed quota machinery.',
        recordedChoice: 'quiet-import',
        choices: [
            {
                id: 'core-import',
                label: 'Core onboarding',
                description: 'Keep and market import; add lean safeguards before promotion.',
                recommended: true,
            },
            {
                id: 'quiet-import',
                label: 'Optional utility',
                description: 'Keep it available but do not optimize or promote it yet.',
            },
            {
                id: 'disable-import',
                label: 'Disable for launch',
                description: 'Remove the anonymous write surface until demand is proven.',
            },
        ],
    },
    {
        id: 'EXEC-04',
        title: 'Peanut domain topology',
        question: 'Where exactly should the product and SEO content live under the Peanut domain?',
        consequence:
            '“Peanut domain + SEO” resolves the strategy but not the canonical URLs. This choice determines redirects, cookie scope, sitemap ownership, analytics boundaries, and the route architecture.',
        recommendation:
            'Use split.peanut.me for the product and peanut.me/split for editorial SEO, matching the existing domain decision document. It keeps the app operationally isolated while content inherits the parent brand.',
        choices: [
            {
                id: 'split-surfaces',
                label: 'Split product and content',
                description: 'App at split.peanut.me; SEO content at peanut.me/split.',
                recommended: true,
            },
            {
                id: 'subdomain-all',
                label: 'Everything on subdomain',
                description: 'Product and content both live at split.peanut.me.',
            },
            {
                id: 'subpath-all',
                label: 'Everything on subpath',
                description: 'Product and content both live below peanut.me/split.',
            },
        ],
    },
]

const emptyAnswer = (): ExecutiveAnswer => ({ choice: '', note: '' })
const recordedAnswers: AnswerRecords = Object.fromEntries(
    questions.flatMap((question) =>
        question.recordedChoice
            ? [[question.id, { choice: question.recordedChoice, note: '' } satisfies ExecutiveAnswer]]
            : []
    )
)

function readStoredAnswers(): AnswerRecords {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as { answers?: unknown }
        const source = parsed && typeof parsed === 'object' && parsed.answers ? parsed.answers : parsed
        if (!source || typeof source !== 'object') return {}

        return Object.fromEntries(
            questions.flatMap((question) => {
                const candidate = (source as Record<string, unknown>)[question.id]
                if (!candidate || typeof candidate !== 'object') return []
                const answer = candidate as Partial<ExecutiveAnswer>
                const validChoices = new Set(question.choices.map((choice) => choice.id))
                if (typeof answer.choice !== 'string' || (answer.choice !== '' && !validChoices.has(answer.choice)))
                    return []
                if (typeof answer.note !== 'string') return []
                return [
                    [
                        question.id,
                        {
                            choice: answer.choice,
                            note: answer.note.slice(0, NOTE_LIMIT),
                            ...(typeof answer.updatedAt === 'string' ? { updatedAt: answer.updatedAt } : {}),
                        },
                    ],
                ]
            })
        )
    } catch {
        return {}
    }
}

function buildExecutiveBrief(records: AnswerRecords): string {
    const lines = ['# Peanut Split executive decisions', '', `Exported: ${new Date().toISOString()}`, '']

    for (const question of questions) {
        const answer = records[question.id] ?? emptyAnswer()
        const choice = question.choices.find((item) => item.id === answer.choice)
        lines.push(
            `## ${question.id} — ${question.title}`,
            '',
            `Question: ${question.question}`,
            '',
            `Decision: ${choice?.label ?? 'Unanswered'}`,
            `Note: ${answer.note.trim() || '—'}`,
            '',
            `Engineering read: ${question.recommendation}`,
            ''
        )
    }

    return lines.join('\n')
}

export function ExecutiveQuestions() {
    const [records, setRecords] = useState<AnswerRecords>({})
    const [hydrated, setHydrated] = useState(false)
    const [saveState, setSaveState] = useState<SaveState>('loading')

    useEffect(() => {
        setRecords(readStoredAnswers())
        setHydrated(true)
        setSaveState('saving')
    }, [])

    useEffect(() => {
        if (!hydrated) return
        setSaveState('saving')
        const timeout = window.setTimeout(() => {
            try {
                window.localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ version: 2, savedAt: new Date().toISOString(), answers: records })
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
                questions.map((question) => [
                    question.id,
                    records[question.id] ?? recordedAnswers[question.id] ?? emptyAnswer(),
                ])
            ) as AnswerRecords,
        [records]
    )

    const answeredCount = useMemo(
        () => questions.filter((question) => Boolean(effectiveRecords[question.id]?.choice)).length,
        [effectiveRecords]
    )
    const remainingCount = questions.length - answeredCount

    const updateAnswer = (questionId: string, patch: Partial<ExecutiveAnswer>) =>
        setRecords((current) => ({
            ...current,
            [questionId]: {
                ...(current[questionId] ?? recordedAnswers[questionId] ?? emptyAnswer()),
                ...patch,
                updatedAt: new Date().toISOString(),
            },
        }))

    const reset = () => {
        if (!window.confirm('Remove manual changes and restore the recorded leadership decisions?')) return
        window.localStorage.removeItem(STORAGE_KEY)
        setRecords({})
    }

    return (
        <section id="executive-decisions" className="scroll-mt-24 pb-14" aria-labelledby="executive-title">
            <div className="shadow-4 overflow-hidden rounded-sm border-2 border-n-1 bg-n-1 text-white">
                <div className="p-5 sm:p-6">
                    <p className="text-h9 uppercase tracking-[0.18em] text-primary-1">Leadership queue</p>
                    <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <h2 id="executive-title" className="font-display text-4xl font-extrabold">
                                {remainingCount === 1
                                    ? 'Only one call still needs you'
                                    : `${remainingCount} calls remain`}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-grey-2 sm:text-base">
                                Three leadership decisions are recorded. The remaining question turns “Peanut domain +
                                SEO” into an exact canonical architecture.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                variant="primary"
                                width="auto"
                                onClick={() =>
                                    downloadMarkdown(
                                        'peanutsplit-executive-decisions.md',
                                        buildExecutiveBrief(effectiveRecords)
                                    )
                                }
                                disableHaptics
                            >
                                Download leadership brief
                            </Button>
                            <button
                                type="button"
                                onClick={reset}
                                disabled={Object.keys(records).length === 0}
                                className="min-h-11 px-2 text-sm font-bold text-white underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Restore recorded decisions
                            </button>
                        </div>
                    </div>
                    <p className="mt-5 text-sm font-bold" aria-live="polite">
                        {answeredCount} of {questions.length} answered ·{' '}
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

                <div className="grid gap-px border-t border-n-1 bg-n-1 lg:grid-cols-2 2xl:grid-cols-4">
                    {questions.map((question) => {
                        const answer = effectiveRecords[question.id] ?? emptyAnswer()
                        const manuallyAnswered = Boolean(records[question.id]?.choice)
                        return (
                            <article key={question.id} className="bg-white p-5 text-n-1 sm:p-6">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-h9 uppercase tracking-[0.18em] text-grey-1">{question.id}</p>
                                    <span
                                        className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wider ${
                                            manuallyAnswered
                                                ? 'border-n-1 bg-primary-1'
                                                : question.recordedChoice
                                                  ? 'border-n-1 bg-primary-3'
                                                  : 'border-error bg-error-1 text-error'
                                        }`}
                                    >
                                        {manuallyAnswered
                                            ? 'Manual decision'
                                            : question.recordedChoice
                                              ? 'Decision recorded'
                                              : 'Needs decision'}
                                    </span>
                                </div>
                                <h3 className="mt-2 text-h5">{question.title}</h3>
                                <p className="mt-3 text-base font-bold leading-6">{question.question}</p>
                                <p className="mt-3 text-sm leading-6 text-grey-1">{question.consequence}</p>

                                <div className="mt-4 rounded-sm border border-n-1 bg-primary-3 p-4">
                                    <p className="text-h9 uppercase tracking-wider">Engineering read</p>
                                    <p className="mt-2 text-sm leading-6">{question.recommendation}</p>
                                </div>

                                <fieldset className="mt-5">
                                    <legend className="text-sm font-extrabold">Leadership decision</legend>
                                    <div className="mt-2 space-y-2">
                                        {question.choices.map((choice) => (
                                            <label
                                                key={choice.id}
                                                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-sm border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${
                                                    answer.choice === choice.id
                                                        ? 'border-n-1 bg-primary-1'
                                                        : 'border-n-1 bg-white hover:bg-grey-3'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`executive-${question.id}`}
                                                    value={choice.id}
                                                    checked={answer.choice === choice.id}
                                                    onChange={() => updateAnswer(question.id, { choice: choice.id })}
                                                    className="mt-0.5 size-4 shrink-0 accent-black"
                                                />
                                                <span>
                                                    <span className="block text-sm font-extrabold">
                                                        {choice.label}
                                                        {choice.id === question.recordedChoice
                                                            ? ' · Recorded decision'
                                                            : !question.recordedChoice && choice.recommended
                                                              ? ' · Recommended'
                                                              : ''}
                                                    </span>
                                                    <span className="mt-1 block text-xs leading-4">
                                                        {choice.description}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <label
                                    htmlFor={`executive-note-${question.id}`}
                                    className="mt-5 block text-sm font-bold"
                                >
                                    Leadership note
                                </label>
                                <textarea
                                    id={`executive-note-${question.id}`}
                                    value={answer.note}
                                    onChange={(event) => updateAnswer(question.id, { note: event.target.value })}
                                    maxLength={NOTE_LIMIT}
                                    rows={4}
                                    placeholder="Capture why, constraints, or a follow-up question."
                                    className="mt-2 w-full resize-y rounded-sm border border-n-1 bg-white px-3 py-3 text-sm leading-6 placeholder:text-grey-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                                />
                            </article>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
