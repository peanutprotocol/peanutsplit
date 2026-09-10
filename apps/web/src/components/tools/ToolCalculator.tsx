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
import type { IndexedLocale } from '@/i18n/locales'
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
 *
 * The `split-tool-*` class names carry no styling here: they are the hooks the sticker skin paints
 * this surface through (globals.css), so an unskinned tool page renders identically. They exist
 * because a stylesheet must not select on `data-testid` — a test hook is free to move, a paint hook
 * is not — which the class audit enforces. `split-tool-field` sits only on the text and number
 * inputs, never on `ScaleInput`'s range or `SwitchRow`'s `sr-only` checkbox: the skin's 2px border,
 * white fill and 10px radius visibly destroy a native range track, and repainting a hidden checkbox
 * is meaningless.
 */

const COLUMN = 'mx-auto w-full max-w-5xl px-5'
/** Shell chrome rather than a tool's words: the same control sits on every calculator. */
const CURRENCY_LABEL: Record<IndexedLocale, string> = { en: 'Currency', 'es-419': 'Moneda', 'pt-br': 'Moeda' }

/** A field's starting text. Amounts are typed in major units, so the default is shown as typed. */
const initialText = (field: ToolField): string => (field.kind === 'toggle' ? '' : String(field.defaultValue))
const CHROME: Record<
    IndexedLocale,
    {
        live: string
        example: string
        details: string
        rateDetails: string
        active: string
        copyError: string
        viewSplit: string
        enterValue: string
    }
> = {
    en: {
        live: 'Updates as you type',
        viewSplit: 'View split',
        enterValue: 'Enter a valid value for',
        example: 'Example values — change them to match your plans.',
        details: 'How this is calculated',
        rateDetails: 'About the default rate',
        active: 'Custom weights applied',
        copyError: 'Could not copy. Select the amounts to copy them.',
    },
    'es-419': {
        live: 'Se actualiza al escribir',
        viewSplit: 'Ver reparto',
        enterValue: 'Ingresa un valor válido para',
        example: 'Valores de ejemplo. Cámbialos según tus planes.',
        details: 'Cómo se calcula',
        rateDetails: 'Acerca de la tarifa inicial',
        active: 'Pesos personalizados aplicados',
        copyError: 'No se pudo copiar. Selecciona los importes para copiarlos.',
    },
    'pt-br': {
        live: 'Atualiza enquanto você digita',
        viewSplit: 'Ver divisão',
        enterValue: 'Informe um valor válido para',
        example: 'Valores de exemplo. Altere conforme seus planos.',
        details: 'Como é calculado',
        rateDetails: 'Sobre a tarifa inicial',
        active: 'Pesos personalizados aplicados',
        copyError: 'Não foi possível copiar. Selecione os valores para copiá-los.',
    },
}

const inputModeFor = (field: ToolField) => (field.kind === 'count' ? 'numeric' : 'decimal')

interface RowState {
    name: string
    values: Record<string, string>
}

/** The option a picker starts on, which is also the option whose pre-fills the fields load with. */
const initialOption = (choice: ToolChoiceField): ToolChoiceOption =>
    choice.options.find((option) => option.value === choice.defaultValue) ?? choice.options[0]

/** A country page opens the picker on its own row: the same options, a different one selected. */
const openedOn = (tool: Tool, start: Record<string, string>): Tool => ({
    ...tool,
    choices: tool.choices?.map((choice) =>
        start[choice.name] ? { ...choice, defaultValue: start[choice.name] } : choice
    ),
})

export function ToolCalculator({
    slug,
    locale = 'en',
    start,
}: {
    slug: string
    locale?: IndexedLocale
    /** Picker options to open on, keyed by choice name. Their pre-fills load with the page. */
    start?: Record<string, string>
}) {
    const tool = getTool(slug, locale)
    if (!tool) return null
    return <Calculator tool={start ? openedOn(tool, start) : tool} locale={locale} />
}

function Calculator({ tool, locale }: { tool: Tool; locale: IndexedLocale }) {
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
    const [copyError, setCopyError] = useState(false)
    const [edited, setEdited] = useState(false)
    const chrome = CHROME[locale]

    /** Anything the reader changes retires the two "we have done that" labels. */
    const touched = () => {
        setEdited(true)
        setCopied(false)
        setCopyError(false)
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
    const optionFor = (choiceName: string): ToolChoiceOption | undefined =>
        choiceFields
            .find((choice) => choice.name === choiceName)
            ?.options.find((option) => option.value === choices[choiceName])
    const unitFor = (field: ToolField): string | undefined => {
        const distanceUnit = field.unitChoice ? optionFor(field.unitChoice)?.unit : undefined
        if (field.unitBasis && distanceUnit) return `${field.unit ?? ''} / ${field.unitBasis} ${distanceUnit}`
        if (field.currency && distanceUnit) return `/ ${distanceUnit}`
        return field.unit ?? distanceUnit
    }

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

    const incompleteRow = visibleRows
        .flatMap((row, index) => (rowSpec?.columns ?? []).map((column) => ({ row, index, column })))
        .find(({ row, column }) => {
            const value = parse(column, row.values[column.name], decimals, locale)
            return !Number.isFinite(value) || value < (column.min ?? 0)
        })

    const incompleteField = scalars.find((field) => {
        const value = parse(field, text[field.name], decimals, locale)
        return (
            !Number.isFinite(value) ||
            (field.kind === 'count' && (!Number.isInteger(value) || value < (field.min ?? 1)))
        )
    })
    const incomplete = rowCount < 1 || Boolean(incompleteField) || Boolean(incompleteRow)

    const outcome = useMemo(() => {
        if (incomplete) return null
        const input: ToolInput = {
            values: Object.fromEntries(scalars.map((field) => [field.name, zeroed(parse(field, text[field.name], decimals, locale))])), // prettier-ignore
            toggles,
            choices,
            rows: visibleRows.map((row, index) => ({
                // The table's own noun, not a hardcoded word: a blanked name reads as "Passageiro"
                // on a Portuguese page rather than as English nobody translated.
                name: row.name.trim() || `${rowSpec?.namePrefix ?? ''} ${index + 1}`.trim(),
                values: Object.fromEntries(
                    (rowSpec?.columns ?? []).map((column) => [
                        column.name,
                        zeroed(parse(column, row.values[column.name], decimals, locale)),
                    ])
                ),
            })),
            decimals,
            locale,
            phrases: tool.phrases,
        }
        return tool.compute(input)
    }, [incomplete, text, toggles, choices, visibleRows, decimals, locale, tool])

    /** The builder's arithmetic, run live, so the reader watches the number being assembled. */
    const built = useMemo(() => {
        if (!builder) return null
        const values = Object.fromEntries(
            builder.fields.map((field) => [field.name, zeroed(parse(field, text[field.name], decimals, locale))])
        )
        return builder.derive(values)
    }, [builder, text, decimals, locale])

    const builderValid = builder?.fields.every((field) => {
        const value = parse(field, text[field.name], decimals, locale)
        return Number.isFinite(value) && value >= (field.min ?? 0)
    })

    const money = (minor: number) => formatMoney(String(minor), currency, CURRENCY_CATALOG, locale)
    const pasteable = outcome?.shares.map((share) => `${share.label} ${money(share.amountMinor)}`).join(', ') ?? ''

    const hasScales = rowSpec?.columns.some((column) => column.kind === 'scale') ?? false
    const customWeights = visibleRows.some((row) =>
        rowSpec?.columns.some(
            (column) => (column.kind === 'scale' || !hasScales) && row.values[column.name] !== initialText(column)
        )
    )
    const changeCurrency = (code: string) => {
        setCurrency(code)
        touched()
        feedback('tick')
    }
    const fieldRow = (field: ToolField) => (
        <FieldRow
            key={field.name}
            field={field}
            value={text[field.name] ?? ''}
            unit={unitFor(field)}
            currency={currency}
            locale={locale}
            onCurrencyChange={field.currency ? changeCurrency : undefined}
            onChange={(next) => write(field, next)}
        />
    )
    const peopleRows = (scalesOnly = false) => (
        <ul>
            {visibleRows.map((row, index) => (
                <li key={index} className={composerRowClassName('px-4 py-3')}>
                    <div className="flex min-w-0 items-center gap-3">
                        <MemberAvatar name={row.name} avatar={PERSONA_KEYS[index % PERSONA_KEYS.length]} size={28} />
                        {scalesOnly ? (
                            <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                {row.name.trim() || `${rowSpec?.namePrefix} ${index + 1}`}
                            </span>
                        ) : (
                            <label className="min-w-0 flex-1">
                                <span className="sr-only">{`${rowSpec?.nameLabel} ${index + 1}`}</span>
                                <input
                                    value={row.name}
                                    maxLength={40}
                                    onChange={(event) =>
                                        editRow(index, (current) => ({ ...current, name: event.target.value }))
                                    }
                                    aria-label={`${rowSpec?.nameLabel} ${index + 1}`}
                                    data-testid={`tool-row-name-${index}`}
                                    className={composerBareInputClassName('h-11 px-1 text-base font-bold')}
                                />
                            </label>
                        )}
                        {!scalesOnly &&
                            rowSpec?.columns
                                .filter((column) => column.kind !== 'scale')
                                .map((column) => (
                                    <div key={column.name} className="w-28 shrink-0">
                                        <CompactInput
                                            field={{ ...column, help: undefined }}
                                            ariaLabel={`${column.label}: ${row.name.trim() || `${rowSpec?.namePrefix} ${index + 1}`}`}
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
                    {scalesOnly &&
                        rowSpec?.columns
                            .filter((column) => column.kind === 'scale')
                            .map((column) => (
                                <div key={column.name} className="mt-2">
                                    <ScaleInput
                                        ariaLabel={`${column.label}: ${row.name.trim() || `${rowSpec?.namePrefix} ${index + 1}`}`}
                                        field={column}
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
                </li>
            ))}
        </ul>
    )

    return (
        <section className={`${COLUMN} my-6 grid items-start gap-5 lg:grid-cols-[1.15fr_1fr]`}>
            <div className="flex min-w-0 flex-col gap-5">
                <motion.div
                    initial={motionAllowed ? { opacity: 0, y: 12 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionAllowed ? { type: 'spring', stiffness: 300, damping: 30 } : { duration: 0 }}
                    data-motion-surface
                    className={composerSurfaceClassName()}
                >
                    <div className="px-4 pb-3 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-h6">{tool.copy.inputTitle}</h2>
                            <a
                                href="#tool-result"
                                className="inline-flex min-h-9 items-center gap-1 rounded-sm text-sm font-bold underline lg:hidden"
                            >
                                {chrome.viewSplit}
                                <Icon name="chevron-down" size={16} />
                            </a>
                        </div>
                        <p className="mt-1 text-xs leading-4 text-grey-1">{edited ? chrome.live : chrome.example}</p>
                    </div>
                    {choiceFields.map((choice) => (
                        <Picker
                            key={choice.name}
                            choice={choice}
                            value={choices[choice.name]}
                            onPick={pick}
                            detailsLabel={chrome.rateDetails}
                        />
                    ))}
                    <div className={composerRowClassName('px-4 py-3')}>
                        <label className="block text-sm font-bold" htmlFor={`tool-${hero.name}`}>
                            {hero.label}
                        </label>
                        <div className="mt-2 flex min-w-0 items-center gap-2">
                            <input
                                id={`tool-${hero.name}`}
                                value={text[hero.name] ?? ''}
                                onChange={(event) => write(hero, event.target.value)}
                                type={hero.kind === 'amount' ? 'text' : 'number'}
                                inputMode={inputModeFor(hero)}
                                min={hero.min}
                                max={hero.max}
                                step={hero.step}
                                aria-label={hero.label}
                                data-testid={`tool-field-${hero.name}`}
                                className={composerBoxedInputClassName(
                                    'split-tool-field h-12 min-w-0 flex-1 text-left text-h5 font-extrabold'
                                )}
                            />
                            {unitFor(hero) && (
                                <span className="shrink-0 text-sm font-bold text-grey-1">{unitFor(hero)}</span>
                            )}
                            {(hero.kind === 'amount' || hero.currency) && (
                                <CurrencyControl currency={currency} locale={locale} onChange={changeCurrency} />
                            )}
                        </div>
                        {hero.help && <p className="mt-2 text-xs leading-4 text-grey-1">{hero.help}</p>}
                    </div>
                    {restFields.filter((field) => field.kind !== 'count').map(fieldRow)}
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
                                    'split-tool-builder-summary flex min-h-14 w-full items-center gap-3 rounded-sm px-4 text-left'
                                )}
                            >
                                <Doodle name={tool.doodle} size={28} weight={1.8} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-h8">{builder.title}</span>
                                    <span className="block text-xs text-grey-1">{builder.summary}</span>
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
                                        transition={
                                            motionAllowed ? { duration: 0.18, ease: 'easeOut' } : { duration: 0 }
                                        }
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
                                                unit={unitFor(field)}
                                                currency={currency}
                                                locale={locale}
                                                onCurrencyChange={
                                                    field.currency
                                                        ? (code) => {
                                                              setCurrency(code)
                                                              touched()
                                                              feedback('tick')
                                                          }
                                                        : undefined
                                                }
                                                onChange={(next) => write(field, next)}
                                                plain
                                            />
                                        ))}
                                        <dl className="flex flex-col gap-1 px-4 pt-3 text-xs text-grey-1">
                                            <div className="flex justify-between gap-3">
                                                <dt>{builder.floorLabel}</dt>
                                                <dd className="tabular-nums">
                                                    {currency} {figure(built.floor)}{' '}
                                                    {unitFor(
                                                        tool.fields.find((field) => field.name === builder.target)!
                                                    )}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between gap-3 text-n-1">
                                                <dt className="font-bold">{builder.totalLabel}</dt>
                                                <dd className="font-bold tabular-nums">
                                                    {currency} {figure(built.total)}{' '}
                                                    {unitFor(
                                                        tool.fields.find((field) => field.name === builder.target)!
                                                    )}
                                                </dd>
                                            </div>
                                        </dl>
                                        <div className="p-4">
                                            <Button
                                                variant="stroke"
                                                className="justify-center"
                                                data-testid="tool-builder-apply"
                                                disabled={!builderValid}
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
                <div className={composerSurfaceClassName()}>
                    <div className="px-4 pb-3 pt-4">
                        <h2 className="text-h6">{tool.copy.rowsTitle}</h2>
                        <p className="mt-1 text-xs leading-4 text-grey-1">{tool.copy.rowsHelp}</p>
                    </div>
                    {restFields.filter((field) => field.kind === 'count').map(fieldRow)}
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
                    {rowSpec && rowCount > 0 && (
                        <>
                            {hasScales && peopleRows()}
                            <details className={composerRowClassName()} data-testid="tool-optional">
                                <summary className="cursor-pointer rounded-sm px-4 py-3 text-sm font-bold">
                                    {tool.copy.optionalTitle}
                                    {customWeights && (
                                        <span className="mt-1 block text-xs text-grey-1">{chrome.active}</span>
                                    )}
                                </summary>
                                <p className="px-4 pb-3 text-xs leading-4 text-grey-1">{tool.copy.optionalHelp}</p>
                                {peopleRows(hasScales)}
                            </details>
                        </>
                    )}
                </div>
            </div>
            <div
                className={composerSurfaceClassName(
                    'split-tool-result scroll-mt-5 bg-primary-3 lg:sticky lg:top-6 lg:self-start'
                )}
                id="tool-result"
                data-testid="tool-result"
            >
                <div className="flex items-center gap-3 px-4 pt-4">
                    <Doodle name={tool.doodle} size={26} weight={1.8} />
                    <div>
                        <h2 className="text-h6">{tool.copy.resultTitle}</h2>
                        <p className="mt-1 text-xs text-grey-1">{chrome.live}</p>
                    </div>
                </div>

                {!outcome && (
                    <p className="px-4 pb-4 pt-3 text-sm leading-5 text-n-1">
                        {incompleteField
                            ? `${chrome.enterValue} ${incompleteField.label.toLocaleLowerCase(locale)}.`
                            : incompleteRow
                              ? `${chrome.enterValue} ${incompleteRow.column.label.toLocaleLowerCase(locale)} (${incompleteRow.row.name.trim() || `${rowSpec?.namePrefix} ${incompleteRow.index + 1}`}).`
                              : tool.copy.resultHint}
                    </p>
                )}
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

                        <details className="mx-4 mt-3">
                            <summary className="cursor-pointer rounded-sm py-2 text-sm font-bold">
                                {chrome.details}
                            </summary>
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
                        </details>

                        <div className="p-4">
                            <Button
                                variant="stroke"
                                className="split-tool-copy justify-center"
                                data-testid="tool-copy"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(pasteable)
                                        setCopied(true)
                                        setCopyError(false)
                                        feedback('tick')
                                    } catch {
                                        setCopied(false)
                                        setCopyError(true)
                                    }
                                }}
                            >
                                {copied ? tool.copy.copyDone : tool.copy.copyLabel}
                            </Button>
                            {copyError && (
                                <p role="status" className="mt-2 text-sm">
                                    {chrome.copyError}
                                </p>
                            )}
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
function CurrencyControl({
    currency,
    locale,
    onChange,
}: {
    currency: string
    locale: IndexedLocale
    onChange: (currency: string) => void
}) {
    return (
        <div className={cn(COMPOSER_CURRENCY_SLOT, 'split-tool-currency')}>
            <CurrencySelect
                value={currency}
                onChange={onChange}
                currencies={CURRENCY_CATALOG}
                variant="sm"
                aria-label={CURRENCY_LABEL[locale]}
                data-testid="tool-currency"
            />
        </div>
    )
}

function Picker({
    choice,
    value,
    onPick,
    detailsLabel,
}: {
    detailsLabel: string
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
            {(chosen?.note || chosen?.source) && (
                <details className="mt-2">
                    <summary className="cursor-pointer rounded-sm py-1 text-xs font-bold">{detailsLabel}</summary>
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
                    )}{' '}
                </details>
            )}
        </div>
    )
}

/** A field as a row of the composer: what it is on the left, the number on the right. */
function FieldRow({
    field,
    value,
    onChange,
    unit,
    currency,
    locale,
    onCurrencyChange,
    plain = false,
}: {
    field: ToolField
    value: string
    onChange: (next: string) => void
    unit?: string
    currency: string
    locale: IndexedLocale
    onCurrencyChange?: (currency: string) => void
    plain?: boolean
}) {
    return (
        <div
            className={cn(
                plain ? 'border-t border-dashed border-grey-2' : composerRowClassName(),
                onCurrencyChange || (unit?.length ?? 0) > 8
                    ? 'flex min-h-14 flex-wrap items-center gap-3 px-4 py-3'
                    : 'flex min-h-14 items-center gap-3 px-4 py-2'
            )}
        >
            <span className="min-w-0 flex-1">
                <span className="block text-h8">{field.label}</span>
                {field.help && <span className="block text-xs leading-4 text-grey-1">{field.help}</span>}
            </span>
            <span
                className={cn(
                    'flex shrink-0 items-center gap-2',
                    (onCurrencyChange || (unit?.length ?? 0) > 8) && 'w-full'
                )}
            >
                {onCurrencyChange && (
                    <CurrencyControl currency={currency} locale={locale} onChange={onCurrencyChange} />
                )}
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    type={field.kind === 'amount' ? 'text' : 'number'}
                    inputMode={inputModeFor(field)}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    aria-label={field.label}
                    data-testid={`tool-field-${field.name}`}
                    className={composerBoxedInputClassName(
                        cn('split-tool-field w-24', onCurrencyChange && 'min-w-0 flex-1')
                    )}
                />
                {unit && <span className="text-xs font-bold text-grey-1">{unit}</span>}
            </span>
        </div>
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
                <span
                    className={cn(
                        'absolute left-0.5 top-0.5 size-5 rounded-full border-2 border-n-1 bg-white transition-transform',
                        on && 'translate-x-5'
                    )}
                />
            </span>
        </label>
    )
}

/** A per-person number, sized for a row that holds two or three of them. */
function CompactInput({
    field,
    ariaLabel,
    value,
    onChange,
}: {
    ariaLabel?: string
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
                    inputMode={inputModeFor(field)}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    aria-label={ariaLabel ?? field.label}
                    data-testid={`tool-field-${field.name}`}
                    className={composerBoxedInputClassName('split-tool-field w-full')}
                />
                {field.unit && <span className="shrink-0 text-xs text-grey-1">{field.unit}</span>}
            </span>
            {field.help && <span className="mt-1 block text-[0.6875rem] leading-4 text-grey-1">{field.help}</span>}
        </label>
    )
}

/** A bounded contribution weight, with the chosen multiplier printed beside the label. */
function ScaleInput({
    field,
    value,
    onChange,
    ariaLabel,
}: {
    field: ToolField
    value: string
    onChange: (next: string) => void
    ariaLabel?: string
}) {
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
                aria-label={ariaLabel ?? field.label}
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

/**
 * Amounts go through the money parser; everything else is a plain number the browser validated.
 * Parsed in the page's own language, so the thousands form its result column prints is one it takes.
 */
function parse(field: ToolField, raw: string | undefined, decimals: number, locale: IndexedLocale): number {
    const text = (raw ?? '').trim()
    if (text === '') return Number.NaN
    if (field.kind === 'amount') {
        const minor = parseAmountToMinor(text, decimals, locale)
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
