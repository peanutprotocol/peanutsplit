'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FALLBACK_CURRENCIES, decimalsOf, formatMoney, parseAmountToMinor } from '@/lib/money'
import { getTool } from '@/tools/registry'
import type { Tool, ToolField, ToolInput, ToolRowColumn } from '@/tools/types'

/**
 * The one interactive part of a tool page.
 *
 * It is handed a slug rather than a tool, because the compute function is a function and a
 * function does not cross the server-component boundary — a `<ToolCalculator tool={tool} />` fails
 * at serialisation, not at type-check. Looking the tool up from the registry on the client costs
 * one bundled module and keeps the config in one place.
 *
 * Every value is held as the string the reader typed and parsed on each render. Holding numbers
 * instead means a half-typed "1." or an empty field has to be represented as something, and the
 * something is always wrong: 0 makes the result jump, `null` makes every field nullable. Strings
 * in, integers out at the compute boundary.
 *
 * Amounts are parsed to minor units by the same parser the expense form uses, so "1.234,56" and
 * "1,234.56" both work and neither reaches the arithmetic as a float.
 */

const COLUMN = 'mx-auto w-full max-w-xl px-5'
const INPUT =
    'h-12 w-full rounded-sm border border-n-1 bg-white px-3 text-base font-bold text-n-1 outline-none focus:border-2'

/** A field's starting text. Amounts are typed in major units, so the default is shown as typed. */
const initialText = (field: ToolField): string => (field.kind === 'toggle' ? '' : String(field.defaultValue))

interface RowState {
    name: string
    values: Record<string, string>
}

export function ToolCalculator({ slug }: { slug: string }) {
    const tool = getTool(slug)
    if (!tool) return null
    return <Calculator tool={tool} />
}

function Calculator({ tool }: { tool: Tool }) {
    const [currency, setCurrency] = useState('EUR')
    const [text, setText] = useState<Record<string, string>>(() =>
        Object.fromEntries(tool.fields.map((field) => [field.name, initialText(field)]))
    )
    const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(tool.fields.filter((f) => f.kind === 'toggle').map((f) => [f.name, f.defaultValue === 1]))
    )
    const [rows, setRows] = useState<RowState[]>([])
    const [copied, setCopied] = useState(false)

    const decimals = decimalsOf(currency)
    const scalars = tool.fields.filter((field) => field.kind !== 'toggle')
    const rowSpec = tool.rows

    /** How many people the table is asking about, clamped to what the count field allows. */
    const countField = rowSpec && tool.fields.find((field) => field.name === rowSpec.countField)
    const rowCount = countField ? clamp(Math.trunc(Number(text[countField.name])), countField) : 0

    const defaultRow = (index: number): RowState => ({
        name: `${rowSpec?.namePrefix ?? ''} ${index + 1}`.trim(),
        values: Object.fromEntries((rowSpec?.columns ?? []).map((column) => [column.name, initialText(column)])),
    })

    /** Rows past the current count keep their values, so nudging the count down and back is free. */
    const visibleRows = useMemo(
        () => Array.from({ length: rowCount }, (_, index) => rows[index] ?? defaultRow(index)),
        [rows, rowCount, tool.slug]
    )

    const editRow = (index: number, change: (row: RowState) => RowState) => {
        setRows((current) => {
            const next = [...current]
            while (next.length <= index) next.push(defaultRow(next.length))
            next[index] = change(next[index])
            return next
        })
        setCopied(false)
    }

    const visibleColumns = (rowSpec?.columns ?? []).filter(
        (column) => !column.requiresToggle || toggles[column.requiresToggle]
    )

    /** An amount or a count that cannot be read is an unfinished form, not a broken one. */
    const incomplete =
        rowCount < 1 ||
        scalars.some(
            (field) =>
                (field.kind === 'amount' || field.kind === 'count') && !Number.isFinite(parse(field, text[field.name], decimals)) // prettier-ignore
        )

    const outcome = useMemo(() => {
        if (incomplete) return null
        const input: ToolInput = {
            values: Object.fromEntries(scalars.map((field) => [field.name, zeroed(parse(field, text[field.name], decimals))])), // prettier-ignore
            toggles,
            rows: visibleRows.map((row) => ({
                name: row.name.trim() || 'Someone',
                values: Object.fromEntries(
                    (rowSpec?.columns ?? []).map((column) => [
                        column.name,
                        zeroed(parse(column, row.values[column.name], decimals)),
                    ])
                ),
            })),
            decimals,
        }
        return tool.compute(input)
    }, [incomplete, text, toggles, visibleRows, decimals, tool])

    const money = (minor: number) => formatMoney(String(minor), currency, FALLBACK_CURRENCIES, 'en')

    const pasteable = outcome?.shares.map((share) => `${share.label} ${money(share.amountMinor)}`).join(', ') ?? ''

    return (
        <section className={`${COLUMN} my-8`}>
            <div className="rounded-sm border border-n-1 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-h6">{tool.copy.formTitle}</h2>
                    <label className="shrink-0">
                        <span className="sr-only">Currency</span>
                        <select
                            value={currency}
                            onChange={(event) => setCurrency(event.target.value)}
                            data-testid="tool-currency"
                            className="h-10 rounded-sm border border-n-1 bg-white px-2 text-sm font-bold text-n-1"
                        >
                            {FALLBACK_CURRENCIES.map((info) => (
                                <option key={info.code} value={info.code}>
                                    {info.code}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-4 flex flex-col gap-4">
                    {tool.fields.map((field) =>
                        field.kind === 'toggle' ? (
                            <label key={field.name} className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={toggles[field.name] ?? false}
                                    onChange={(event) => {
                                        setToggles((current) => ({ ...current, [field.name]: event.target.checked }))
                                        setCopied(false)
                                    }}
                                    data-testid={`tool-field-${field.name}`}
                                    className="mt-1 size-5 shrink-0 rounded-sm border border-n-1"
                                />
                                <span>
                                    <span className="block text-h8">{field.label}</span>
                                    {field.help && <span className="block text-xs text-grey-1">{field.help}</span>}
                                </span>
                            </label>
                        ) : (
                            <FieldInput
                                key={field.name}
                                field={field}
                                value={text[field.name] ?? ''}
                                onChange={(next) => {
                                    setText((current) => ({ ...current, [field.name]: next }))
                                    setCopied(false)
                                }}
                            />
                        )
                    )}
                </div>

                {rowSpec && rowCount > 0 && (
                    <ul className="mt-5 flex flex-col gap-3">
                        {visibleRows.map((row, index) => (
                            <li key={index} className="rounded-sm border border-grey-1 p-3">
                                <label className="block">
                                    <span className="sr-only">{rowSpec.nameLabel}</span>
                                    <input
                                        value={row.name}
                                        onChange={(event) =>
                                            editRow(index, (current) => ({ ...current, name: event.target.value }))
                                        }
                                        maxLength={40}
                                        aria-label={`${rowSpec.nameLabel} ${index + 1}`}
                                        data-testid={`tool-row-name-${index}`}
                                        className="h-10 w-full rounded-sm border border-n-1 bg-white px-3 text-sm font-bold text-n-1 outline-none"
                                    />
                                </label>
                                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                    {visibleColumns.map((column) => (
                                        <div key={column.name} className="flex-1">
                                            <FieldInput
                                                field={column}
                                                compact
                                                value={row.values[column.name] ?? initialText(column)}
                                                onChange={(next) =>
                                                    editRow(index, (current) => ({
                                                        ...current,
                                                        values: { ...current.values, [column.name]: next },
                                                    }))
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="mt-4 rounded-sm border border-n-1 bg-primary-3 p-4" data-testid="tool-result">
                <h2 className="text-h6">{tool.copy.resultTitle}</h2>

                {!outcome && <p className="mt-3 text-sm leading-5 text-n-1">{tool.copy.resultHint}</p>}
                {outcome?.problem && (
                    <p role="alert" className="mt-3 text-sm font-bold leading-5 text-n-1">
                        {outcome.problem}
                    </p>
                )}

                {outcome && !outcome.problem && (
                    <>
                        <dl className="mt-4 flex flex-col gap-2">
                            {outcome.shares.map((share, index) => (
                                <div
                                    key={index}
                                    className="flex items-baseline justify-between gap-3 border-b border-dashed border-grey-1 pb-2"
                                >
                                    <dt className="min-w-0">
                                        <span className="block truncate text-h7">{share.label}</span>
                                        <span className="block text-xs text-grey-1">{share.detail}</span>
                                    </dt>
                                    <dd className="shrink-0 text-h6 tabular-nums">{money(share.amountMinor)}</dd>
                                </div>
                            ))}
                        </dl>

                        <ul className="mt-3 flex flex-col gap-1 text-xs text-grey-1">
                            {outcome.workings.map((working) => (
                                <li key={working.label} className="flex justify-between gap-3">
                                    <span>{working.label}</span>
                                    <span className="tabular-nums">
                                        {working.amountMinor === undefined ? working.value : money(working.amountMinor)}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <p className="mt-3 text-xs leading-4 text-grey-1">{tool.copy.roundingNote}</p>

                        <Button
                            variant="stroke"
                            className="mt-4 justify-center"
                            data-testid="tool-copy"
                            onClick={() => {
                                void navigator.clipboard?.writeText(pasteable)
                                setCopied(true)
                            }}
                        >
                            {copied ? tool.copy.copyDone : tool.copy.copyLabel}
                        </Button>
                    </>
                )}
            </div>
        </section>
    )
}

function FieldInput({
    field,
    value,
    onChange,
    compact = false,
}: {
    field: ToolField | ToolRowColumn
    value: string
    onChange: (next: string) => void
    compact?: boolean
}) {
    const numeric = field.kind !== 'amount'
    return (
        <label className="block">
            <span className={compact ? 'block text-xs font-bold text-n-1' : 'block text-h8'}>{field.label}</span>
            <span className="mt-1 flex items-center gap-2">
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    type={numeric ? 'number' : 'text'}
                    inputMode={numeric ? 'numeric' : 'decimal'}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    data-testid={`tool-field-${field.name}`}
                    className={compact ? `${INPUT} h-10 text-sm` : INPUT}
                />
                {field.unit && <span className="shrink-0 text-sm text-grey-1">{field.unit}</span>}
            </span>
            {field.help && !compact && <span className="mt-1 block text-xs text-grey-1">{field.help}</span>}
        </label>
    )
}

/** Amounts go through the money parser; everything else is a plain number the browser validated. */
function parse(field: ToolField | ToolRowColumn, raw: string | undefined, decimals: number): number {
    const text = (raw ?? '').trim()
    if (text === '') return Number.NaN
    if (field.kind === 'amount') {
        const minor = parseAmountToMinor(text, decimals, 'en')
        return minor === null ? Number.NaN : Number(minor)
    }
    return Number(text)
}

const zeroed = (value: number): number => (Number.isFinite(value) ? value : 0)

/** A count the reader typed, held inside the field's own bounds — "50 people" is not a room. */
function clamp(value: number, field: ToolField): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(Math.max(value, field.min ?? 0), field.max ?? Number.MAX_SAFE_INTEGER)
}

export default ToolCalculator
