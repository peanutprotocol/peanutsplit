'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CurrencySelect } from '@/components/room/CurrencySelect'
import { MemberAvatar } from '@/components/room/MemberAvatar'
import { AnimatedMoney, Money } from '@/components/room/Money'
import { Button } from '@/components/ui/Button'
import {
    COMPOSER_CURRENCY_SLOT,
    composerBareInputClassName,
    composerBoxedInputClassName,
    composerRowClassName,
    composerSurfaceClassName,
} from '@/components/ui/composer-style'
import { Doodle } from '@/components/ui/Doodle'
import { Icon } from '@/components/ui/Icon'
import { PERSONA_KEYS } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { CURRENCY_CATALOG } from '@/lib/currency-catalog'
import { decimalsOf, formatMoney, parseAmountToMinor } from '@/lib/money'
import { useMotionAllowed } from '@/lib/use-motion'
import { useFeedback } from '@/lib/use-settings'
import { getTool } from '@/tools/registry'
import type { Tool, ToolChoiceField, ToolChoiceOption, ToolField, ToolInput } from '@/tools/types'

/**
 * The one interactive part of a tool page.
 *
 * It is handed a slug rather than a tool, because the compute function is a function and a
 * function does not cross the server-component boundary — a `<ToolCalculator tool={tool} />` fails
 * at serialisation, not at type-check. Looking the tool up from the registry on the client costs
 * one bundled module and keeps the config in one place.
 *
 * **Built out of the app's own components, not out of marketing form styling.** The composer
 * object, the currency picker, the drawn member avatars, the counting amounts, the button and the
 * chevron-and-collapse fold are the ones `/new` and the room screens use. A calculator styled as a
 * form on a different website teaches the reader an interface they are about to leave; this way
 * the CTA opens something they have already had their hands on for a minute.
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
/** A field's starting text. Amounts are typed in major units, so the default is shown as typed. */
const initialText = (field: ToolField): string => (field.kind === 'toggle' ? '' : String(field.defaultValue))

interface RowState {
    name: string
    values: Record<string, string>
}

/** The option a picker starts on, which is also the option whose pre-fills the fields load with. */
const initialOption = (choice: ToolChoiceField): ToolChoiceOption =>
    choice.options.find((option) => option.value === choice.defaultValue) ?? choice.options[0]

export function ToolCalculator({ slug }: { slug: string }) {
    const tool = getTool(slug)
    if (!tool) return null
    return <Calculator tool={tool} />
}

function Calculator({ tool }: { tool: Tool }) {
    const choiceFields = tool.choices ?? []
    const startingOptions = choiceFields.map(initialOption)
    const builder = tool.builder
    const motionAllowed = useMotionAllowed()
    const feedback = useFeedback()

    const [currency, setCurrency] = useState(
        () => startingOptions.find((option) => option?.currency)?.currency ?? 'EUR'
    )
    const [text, setText] = useState<Record<string, string>>(() => ({
        ...Object.fromEntries(tool.fields.map((field) => [field.name, initialText(field)])),
        ...Object.fromEntries((builder?.fields ?? []).map((field) => [field.name, initialText(field)])),
        ...Object.assign({}, ...startingOptions.map((option) => option?.sets ?? {})),
    }))
    const [choices, setChoices] = useState<Record<string, string>>(() =>
        Object.fromEntries(choiceFields.map((choice) => [choice.name, initialOption(choice)?.value ?? '']))
    )
    const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(tool.fields.filter((f) => f.kind === 'toggle').map((f) => [f.name, f.defaultValue === 1]))
    )
    const [rows, setRows] = useState<RowState[]>([])
    const [builderOpen, setBuilderOpen] = useState(false)
    const [applied, setApplied] = useState(false)
    const [copied, setCopied] = useState(false)

    /** Anything the reader changes retires the two "we have done that" labels. */
    const touched = () => {
        setCopied(false)
        setApplied(false)
    }

    /**
     * Picking an option writes its numbers into the fields below it and moves the currency with
     * them, because a rate published in one country's money is wrong under another's sign. Both
     * are ordinary state afterwards — the reader types over either without the picker objecting.
     */
    const pick = (choice: ToolChoiceField, value: string) => {
        const option = choice.options.find((entry) => entry.value === value)
        setChoices((current) => ({ ...current, [choice.name]: value }))
        if (option?.sets) setText((current) => ({ ...current, ...option.sets }))
        if (option?.currency) setCurrency(option.currency)
        touched()
    }

    /**
     * A count is held to its own maximum in the box, as it is typed. The row table was already
     * clamped, so a field left reading 50 while the page divided by twenty was a page disagreeing
     * with itself — and the reader who does not count the rows leaves with a number two and a half
     * times too big, with nothing on screen to say so.
     */
    const write = (field: ToolField, next: string) => {
        setText((current) => ({ ...current, [field.name]: capped(field, next) }))
        touched()
    }

    const decimals = decimalsOf(currency)
    const scalars = tool.fields.filter((field) => field.kind !== 'toggle')
    const switches = tool.fields.filter((field) => field.kind === 'toggle')
    const [hero, ...restFields] = scalars
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
        touched()
    }

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
            choices,
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
    }, [incomplete, text, toggles, choices, visibleRows, decimals, tool])

    /** The builder's arithmetic, run live, so the reader watches the number being assembled. */
    const built = useMemo(() => {
        if (!builder) return null
        const values = Object.fromEntries(
            builder.fields.map((field) => [field.name, zeroed(parse(field, text[field.name], decimals))])
        )
        return builder.derive(values)
    }, [builder, text, decimals])

    const money = (minor: number) => formatMoney(String(minor), currency, CURRENCY_CATALOG, 'en')
    const pasteable = outcome?.shares.map((share) => `${share.label} ${money(share.amountMinor)}`).join(', ') ?? ''

    return (
        <section className={`${COLUMN} my-8 flex flex-col gap-3`}>
            <motion.div
                initial={motionAllowed ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }}
                data-motion-surface
                className={composerSurfaceClassName()}
            >
                {tool.presets && tool.presets.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b border-dashed border-grey-2 px-3 pb-3 pt-3">
                        {tool.presets.map((preset) => (
                            <button
                                key={preset.optionValue}
                                type="button"
                                data-testid={`tool-preset-${preset.optionValue}`}
                                // A shortcut whose choice is live is a pressed toggle. Without
                                // this the three presets look and read identically whether or not
                                // their option is the one the fields below are filled from.
                                aria-pressed={choices[preset.choiceName] === preset.optionValue}
                                onClick={() => {
                                    // Same pre-fill path the dropdown picker already uses (§ below) —
                                    // a preset is a shortcut to an existing choice/option, not a
                                    // second way to set fields.
                                    const choice = choiceFields.find((field) => field.name === preset.choiceName)
                                    if (choice) pick(choice, preset.optionValue)
                                }}
                                className="rounded-full border border-n-1 bg-white px-3 py-1 text-xs font-bold text-n-1"
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                )}
                {/* The headline number and the currency share the first line, exactly as they do on
                    the add-expense and create-room composers. Everything else is a row under it. */}
                <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                    <label className="min-w-0 flex-1">
                        <span className="block px-1 text-xs text-grey-1">{hero.label}</span>
                        <input
                            value={text[hero.name] ?? ''}
                            onChange={(event) => write(hero, event.target.value)}
                            type={hero.kind === 'amount' ? 'text' : 'number'}
                            inputMode={hero.kind === 'amount' ? 'decimal' : 'numeric'}
                            min={hero.min}
                            max={hero.max}
                            step={hero.step}
                            aria-label={hero.label}
                            data-testid={`tool-field-${hero.name}`}
                            className={composerBareInputClassName('h-12 px-1 text-h5 font-extrabold')}
                        />
                    </label>
                    <div className={COMPOSER_CURRENCY_SLOT}>
                        <CurrencySelect
                            value={currency}
                            onChange={(code) => {
                                setCurrency(code)
                                touched()
                                feedback('tick')
                            }}
                            currencies={CURRENCY_CATALOG}
                            variant="sm"
                            aria-label="Currency"
                            data-testid="tool-currency"
                        />
                    </div>
                </div>

                {choiceFields.map((choice) => (
                    <Picker key={choice.name} choice={choice} value={choices[choice.name]} onPick={pick} />
                ))}

                {restFields.map((field) => (
                    <FieldRow
                        key={field.name}
                        field={field}
                        value={text[field.name] ?? ''}
                        onChange={(next) => write(field, next)}
                    />
                ))}

                {switches.map((field) => (
                    <SwitchRow
                        key={field.name}
                        field={field}
                        on={toggles[field.name] ?? false}
                        onChange={(on) => {
                            setToggles((current) => ({ ...current, [field.name]: on }))
                            touched()
                            feedback('tick')
                        }}
                    />
                ))}

                {builder && built && (
                    <>
                        <button
                            type="button"
                            onClick={() => setBuilderOpen((open) => !open)}
                            aria-expanded={builderOpen}
                            aria-controls="tool-builder"
                            data-testid="tool-builder-summary"
                            data-focus-contained
                            className={composerRowClassName(
                                'flex min-h-14 w-full items-center gap-3 rounded-sm px-4 text-left'
                            )}
                        >
                            <Doodle name={tool.doodle} size={28} weight={1.8} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-h8">{builder.title}</span>
                                <span className="block truncate text-xs text-grey-1">{builder.summary}</span>
                            </span>
                            <Icon
                                name="chevron-down"
                                size={22}
                                className={cn('transition-transform', builderOpen && 'rotate-180')}
                            />
                        </button>

                        <AnimatePresence initial={false}>
                            {builderOpen && (
                                <motion.div
                                    id="tool-builder"
                                    data-testid="tool-builder"
                                    initial={motionAllowed ? { opacity: 0, height: 0 } : false}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={motionAllowed ? { opacity: 0, height: 0 } : undefined}
                                    transition={motionAllowed ? { duration: 0.18, ease: 'easeOut' } : { duration: 0 }}
                                    data-motion-surface
                                    data-motion-collapse
                                    className={composerRowClassName('overflow-hidden bg-grey-3')}
                                >
                                    <p className="px-4 pb-1 pt-3 text-xs leading-4 text-n-1">{builder.intro}</p>
                                    {builder.fields.map((field) => (
                                        <FieldRow
                                            key={field.name}
                                            field={field}
                                            value={text[field.name] ?? ''}
                                            onChange={(next) => write(field, next)}
                                            plain
                                        />
                                    ))}
                                    <dl className="flex flex-col gap-1 px-4 pt-3 text-xs text-grey-1">
                                        <div className="flex justify-between gap-3">
                                            <dt>{builder.floorLabel}</dt>
                                            <dd className="tabular-nums">{figure(built.floor)}</dd>
                                        </div>
                                        <div className="flex justify-between gap-3 text-n-1">
                                            <dt className="font-bold">{builder.totalLabel}</dt>
                                            <dd className="font-bold tabular-nums">{figure(built.total)}</dd>
                                        </div>
                                    </dl>
                                    <div className="p-4">
                                        <Button
                                            variant="stroke"
                                            className="justify-center"
                                            data-testid="tool-builder-apply"
                                            onClick={() => {
                                                setText((current) => ({
                                                    ...current,
                                                    [builder.target]: figure(built.total),
                                                }))
                                                setCopied(false)
                                                setApplied(true)
                                                feedback('tick')
                                            }}
                                        >
                                            {applied ? builder.appliedLabel : builder.applyLabel}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </motion.div>

            {rowSpec && rowCount > 0 && (
                <ul className={composerSurfaceClassName()}>
                    {visibleRows.map((row, index) => (
                        <li key={index} className={index === 0 ? undefined : composerRowClassName()}>
                            <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                                {/* Drawn, the way a member is drawn everywhere else in the app. Art
                                    only: a calculator has nobody to speak and no persona to name. */}
                                <MemberAvatar
                                    name={row.name}
                                    avatar={PERSONA_KEYS[index % PERSONA_KEYS.length]}
                                    size={34}
                                />
                                <label className="min-w-0 flex-1">
                                    <span className="sr-only">{`${rowSpec.nameLabel} ${index + 1}`}</span>
                                    <input
                                        value={row.name}
                                        onChange={(event) =>
                                            editRow(index, (current) => ({ ...current, name: event.target.value }))
                                        }
                                        maxLength={40}
                                        aria-label={`${rowSpec.nameLabel} ${index + 1}`}
                                        data-testid={`tool-row-name-${index}`}
                                        className={composerBareInputClassName(
                                            'h-11 px-1 text-base font-bold md:text-sm'
                                        )}
                                    />
                                </label>
                            </div>
                            <div className="flex flex-col gap-3 px-4 pb-3 sm:flex-row sm:items-end sm:gap-5">
                                {rowSpec.columns.map((column) => (
                                    <div key={column.name} className="min-w-0 flex-1">
                                        {column.kind === 'scale' ? (
                                            <ScaleInput
                                                field={column}
                                                value={row.values[column.name] ?? initialText(column)}
                                                onChange={(next) =>
                                                    editRow(index, (current) => ({
                                                        ...current,
                                                        values: { ...current.values, [column.name]: next },
                                                    }))
                                                }
                                            />
                                        ) : (
                                            <CompactInput
                                                field={column}
                                                value={row.values[column.name] ?? initialText(column)}
                                                onChange={(next) =>
                                                    editRow(index, (current) => ({
                                                        ...current,
                                                        values: { ...current.values, [column.name]: next },
                                                    }))
                                                }
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div className={composerSurfaceClassName('bg-primary-3')} data-testid="tool-result">
                <div className="flex items-center gap-3 px-4 pt-4">
                    <Doodle name={tool.doodle} size={26} weight={1.8} />
                    <h2 className="text-h6">{tool.copy.resultTitle}</h2>
                </div>

                {!outcome && <p className="px-4 pb-4 pt-3 text-sm leading-5 text-n-1">{tool.copy.resultHint}</p>}
                {outcome?.problem && (
                    <p role="alert" className="px-4 pb-4 pt-3 text-sm font-bold leading-5 text-n-1">
                        {outcome.problem}
                    </p>
                )}

                {outcome && !outcome.problem && (
                    <>
                        <dl className="split-tool-shares mt-3 flex flex-col">
                            {outcome.shares.map((share, index) => (
                                <div
                                    key={index}
                                    className={composerRowClassName(
                                        'flex items-center justify-between gap-3 px-4 py-2.5'
                                    )}
                                >
                                    <dt className="min-w-0">
                                        <span className="block truncate text-h7">{share.label}</span>
                                        <span className="block text-xs text-grey-1">{share.detail}</span>
                                    </dt>
                                    {/* Counting rather than flickering — the app's own amount. */}
                                    <dd className="split-tool-amount shrink-0 text-h6">
                                        <AnimatedMoney
                                            minor={String(share.amountMinor)}
                                            currency={currency}
                                            catalog={CURRENCY_CATALOG}
                                        />
                                    </dd>
                                </div>
                            ))}
                        </dl>

                        {/* The same strip `<Working>` renders in an article, by class rather than
                            by component — this list is inlined here, not built from that one. */}
                        <ul
                            className={composerRowClassName(
                                'split-working flex flex-col gap-1 px-4 pt-3 text-xs text-grey-1'
                            )}
                        >
                            {outcome.workings.map((working) => (
                                <li key={working.label} className="flex justify-between gap-3">
                                    <span>{working.label}</span>
                                    <span className="tabular-nums">
                                        {working.amountMinor === undefined ? (
                                            working.value
                                        ) : (
                                            <Money
                                                minor={String(working.amountMinor)}
                                                currency={currency}
                                                catalog={CURRENCY_CATALOG}
                                            />
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <p className="px-4 pt-3 text-xs leading-4 text-grey-1">{tool.copy.roundingNote}</p>

                        <div className="p-4">
                            <Button
                                variant="stroke"
                                className="justify-center"
                                data-testid="tool-copy"
                                onClick={() => {
                                    void navigator.clipboard?.writeText(pasteable)
                                    setCopied(true)
                                    feedback('tick')
                                }}
                            >
                                {copied ? tool.copy.copyDone : tool.copy.copyLabel}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </section>
    )
}

/**
 * A picker, and underneath it whatever the chosen option has to declare about itself.
 *
 * The note and the source live here rather than in a block further down the page because they are
 * about the number in the box above them: a rate is only worth pre-filling if the reader can see
 * what it covers and open the page it was read off.
 */
function Picker({
    choice,
    value,
    onPick,
}: {
    choice: ToolChoiceField
    value: string | undefined
    onPick: (choice: ToolChoiceField, value: string) => void
}) {
    const chosen = choice.options.find((option) => option.value === value)
    return (
        <div className={composerRowClassName('px-4 py-3')}>
            <label className="block">
                <span className="block text-h8">{choice.label}</span>
                <span className="relative mt-1 block">
                    <select
                        value={value ?? ''}
                        onChange={(event) => onPick(choice, event.target.value)}
                        data-testid={`tool-choice-${choice.name}`}
                        className="h-12 w-full appearance-none rounded-sm border border-n-1 bg-white pl-3 pr-10 text-base font-bold text-n-1 outline-none md:text-sm"
                    >
                        {choice.options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <Icon
                        name="chevron-down"
                        size={20}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                    />
                </span>
            </label>
            {choice.help && <p className="mt-2 text-xs leading-4 text-grey-1">{choice.help}</p>}
            {chosen?.note && <p className="mt-2 text-xs leading-4 text-n-1">{chosen.note}</p>}
            {chosen?.source && (
                <p className="mt-1 text-xs leading-4 text-grey-1">
                    <a
                        href={chosen.source.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-n-1 underline"
                    >
                        {chosen.source.label}
                    </a>
                </p>
            )}
        </div>
    )
}

/** A field as a row of the composer: what it is on the left, the number on the right. */
function FieldRow({
    field,
    value,
    onChange,
    plain = false,
}: {
    field: ToolField
    value: string
    onChange: (next: string) => void
    plain?: boolean
}) {
    return (
        <label
            className={cn(
                plain ? 'border-t border-dashed border-grey-2' : composerRowClassName(),
                'flex min-h-14 items-center gap-3 px-4'
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{field.label}</span>
                {field.help && <span className="block text-xs leading-4 text-grey-1">{field.help}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    type={field.kind === 'amount' ? 'text' : 'number'}
                    inputMode={field.kind === 'amount' ? 'decimal' : 'numeric'}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    data-testid={`tool-field-${field.name}`}
                    className={composerBoxedInputClassName('w-24')}
                />
                {field.unit && <span className="text-xs text-grey-1">{field.unit}</span>}
            </span>
        </label>
    )
}

/** A yes-or-no as the app draws one: a track that fills with the brand colour when it is on. */
function SwitchRow({ field, on, onChange }: { field: ToolField; on: boolean; onChange: (on: boolean) => void }) {
    return (
        <label className={composerRowClassName('flex min-h-14 cursor-pointer items-center gap-3 px-4')}>
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{field.label}</span>
                {field.help && <span className="block text-xs leading-4 text-grey-1">{field.help}</span>}
            </span>
            <input
                type="checkbox"
                checked={on}
                onChange={(event) => onChange(event.target.checked)}
                data-testid={`tool-field-${field.name}`}
                data-focus-proxy
                className="peer sr-only"
            />
            <span
                data-focus-proxy-target
                className="relative h-7 w-12 shrink-0 rounded-full border-2 border-n-1 bg-white transition-colors peer-checked:bg-primary-1"
            >
                <span className="absolute left-0.5 top-0.5 size-5 rounded-full border-2 border-n-1 bg-white transition-transform peer-checked:translate-x-5" />
            </span>
        </label>
    )
}

/** A per-person number, sized for a row that holds two or three of them. */
function CompactInput({
    field,
    value,
    onChange,
}: {
    field: ToolField
    value: string
    onChange: (next: string) => void
}) {
    return (
        <label className="block">
            <span className="block text-xs font-bold text-n-1">{field.label}</span>
            <span className="mt-1 flex items-center gap-1.5">
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    type={field.kind === 'amount' ? 'text' : 'number'}
                    inputMode={field.kind === 'amount' ? 'decimal' : 'numeric'}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    data-testid={`tool-field-${field.name}`}
                    className={composerBoxedInputClassName('w-full')}
                />
                {field.unit && <span className="shrink-0 text-xs text-grey-1">{field.unit}</span>}
            </span>
        </label>
    )
}

/**
 * A notch on a labelled slider, for the question nobody answers honestly in a box.
 *
 * The notch the reader is on is printed beside the label and both ends are printed under the
 * track, so what the control means is on screen without a legend. What the notch does to the
 * arithmetic is not hidden either — it is answered in the tool's own FAQ.
 */
function ScaleInput({ field, value, onChange }: { field: ToolField; value: string; onChange: (next: string) => void }) {
    const notches = field.notches ?? []
    const top = Math.max(1, notches.length)
    const notch = Math.min(top, Math.max(1, Math.round(Number(value)) || 1))
    return (
        <label className="block">
            <span className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-n-1">{field.label}</span>
                <span className="truncate text-xs text-grey-1">{notches[notch - 1]}</span>
            </span>
            <input
                type="range"
                min={1}
                max={top}
                step={1}
                value={notch}
                onChange={(event) => onChange(event.target.value)}
                aria-label={field.label}
                aria-valuetext={notches[notch - 1]}
                data-testid={`tool-field-${field.name}`}
                className="mt-1.5 h-6 w-full cursor-pointer accent-primary-1"
            />
            <span className="flex justify-between gap-2 text-[0.6875rem] leading-4 text-grey-1">
                <span>{notches[0]}</span>
                <span>{notches[top - 1]}</span>
            </span>
        </label>
    )
}

/** Amounts go through the money parser; everything else is a plain number the browser validated. */
function parse(field: ToolField, raw: string | undefined, decimals: number): number {
    const text = (raw ?? '').trim()
    if (text === '') return Number.NaN
    if (field.kind === 'amount') {
        const minor = parseAmountToMinor(text, decimals, 'en')
        return minor === null ? Number.NaN : Number(minor)
    }
    return Number(text)
}

const zeroed = (value: number): number => (Number.isFinite(value) ? value : 0)

/** A built rate as the reader would type it — never money, so never the money formatter. */
const figure = (value: number): string => String(Number(value.toFixed(4)))

/** A count the reader typed, held inside the field's own bounds — "50 people" is not a room. */
function clamp(value: number, field: ToolField): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(Math.max(value, field.min ?? 0), field.max ?? Number.MAX_SAFE_INTEGER)
}

/**
 * The typed text of a count, cut back to the field's maximum before it is stored.
 *
 * Only the ceiling, and only for counts. The floor has to stay soft because an empty box and a
 * half-typed one are both on the way to a real number, and a field that snapped to its minimum on
 * every keystroke could not be cleared. Amounts are left alone: their text is a locale's, not a
 * number's, and this is not the place that parses it.
 */
function capped(field: ToolField, raw: string): string {
    if (field.kind !== 'count' || field.max === undefined || raw.trim() === '') return raw
    const value = Math.trunc(Number(raw))
    return Number.isFinite(value) && value > field.max ? String(field.max) : raw
}

export default ToolCalculator
