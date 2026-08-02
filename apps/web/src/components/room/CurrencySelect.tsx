'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Icon } from '@/components/ui/Icon'
import { fieldSizes, type FieldSize } from '@/components/ui/field'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { canPrice } from '@/lib/currency-rules'
import { currencyDisplayName, currencyInfo } from '@/lib/money'
import { CurrencyTag } from './CurrencyTag'

interface CurrencySelectProps {
    value: string
    onChange: (code: string) => void
    currencies: readonly CurrencyInfo[]
    /** Codes the call site inferred, offered above the static five. It does no inference of its
     *  own: each caller knows something this component cannot — the room's history, the parsed
     *  file, the device's timezone. */
    suggested?: readonly string[]
    /** May the reader invent a ticker the catalog does not have? False where the chosen currency
     *  has to be able to RECEIVE others — the Splitwise mapper picks what the file converts into. */
    allowCustom?: boolean
    /** Offer only currencies that can be converted into this one. `ExpenseDrawer` passes the room
     *  currency, so the picker cannot offer a pair the server would refuse with `NO_RATE`. */
    requireRateTo?: string
    className?: string
    variant?: FieldSize
    id?: string
    'aria-label'?: string
    'data-testid'?: string
}

const MENU_GAP = 8
const VIEWPORT_GUTTER = 12
const MENU_WIDTH = 208
const OPTION_HEIGHT = 48

/**
 * The invent-a-ticker row: 55px for the code and the line under it, plus the 4px that separates it
 * from the currency rows above. It is the row most often alone in the list, so budgeting it as an
 * ordinary 48px row is what left `BEER` rendered as a crushed sliver.
 */
const CUSTOM_OPTION_HEIGHT = 64

/** The search field (48px) inside its 8px frame, plus the dashed rule under it. */
const HEADER_HEIGHT = 65

/** The footer: the "search all" button or a status line, its `py-2`, and the dashed rule. Two
 *  lines, which is the most any of the status strings takes at this width. */
const FOOTER_HEIGHT = 49

/** The listbox's own `p-1`, top and bottom. */
const LIST_PADDING = 8

/** The menu's `border-2`, top and bottom. */
const MENU_BORDER = 4

/**
 * Everything in the menu that is NOT the scrolling list.
 *
 * The header and the footer are `shrink-0` and the listbox is `flex-1 min-h-0`, so every pixel
 * this budget forgets comes out of the rows. Forgetting the footer is what turned a one-match menu
 * into an 8px sliver with the row clipped away entirely. The numbers are measured against the
 * rendered menu, and `e2e/currency.spec.ts` fails if any row is ever cut.
 */
const MENU_CHROME = HEADER_HEIGHT + FOOTER_HEIGHT + LIST_PADDING + MENU_BORDER

/** How many rows the menu shows before anything is typed. */
export const COMMON_COUNT = 5

/**
 * The tallest menu ever asked for: the chrome, five rows, and the extra height one of them needs
 * if it is the invent-a-ticker row. Past five the listbox scrolls — the answer to 162 codes is the
 * search field, not a taller menu.
 */
const MENU_MAX_HEIGHT = MENU_CHROME + COMMON_COUNT * OPTION_HEIGHT + (CUSTOM_OPTION_HEIGHT - OPTION_HEIGHT)

/** How many of those five `suggested` may take. Four, so a Splitwise file carrying nine
 *  currencies cannot become the whole list and push the reader's likeliest answers out. */
const SUGGESTED_SLOTS = 4

/**
 * The backfill, used only when the call site inferred nothing — a UTC/`en` device with no room
 * behind it. `USD EUR GBP` are that device's likeliest answers; `BRL MXN` are Split's two biggest
 * markets, which the device signals miss most often.
 */
const STATIC_COMMON = ['USD', 'EUR', 'GBP', 'BRL', 'MXN'] as const

export interface CurrencyMenuPlacement {
    direction: 'down' | 'up'
    left: number
    top: number
    width: number
    maxHeight: number
}

/**
 * Places the portalled menu inside the *visible* viewport.
 *
 * Down is the default: the add-expense trigger is near the top of the sheet,
 * so opening upward was both surprising and the easiest way to collide with
 * the title/drag handle. Up only wins when the menu genuinely fits better
 * there. Keeping this pure makes the keyboard/visual-viewport edge cases
 * testable without mounting a drawer.
 *
 * `hasCustomRow` is asked for rather than inferred because the invent-a-ticker row is taller than
 * a currency row, and it is the row that is most often alone in the list — a query with no real
 * match is exactly when it appears.
 */
export function currencyMenuPlacement(
    trigger: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width'>,
    viewport: { width: number; height: number; offsetTop?: number; offsetLeft?: number },
    itemCount: number,
    hasCustomRow = false
): CurrencyMenuPlacement {
    const offsetTop = viewport.offsetTop ?? 0
    const offsetLeft = viewport.offsetLeft ?? 0
    const rowsHeight = itemCount * OPTION_HEIGHT + (hasCustomRow ? CUSTOM_OPTION_HEIGHT - OPTION_HEIGHT : 0)
    const wantedHeight = Math.min(MENU_MAX_HEIGHT, MENU_CHROME + rowsHeight)
    const viewportBottom = offsetTop + viewport.height
    const viewportRight = offsetLeft + viewport.width
    const below = viewportBottom - trigger.bottom - MENU_GAP - VIEWPORT_GUTTER
    const above = trigger.top - offsetTop - MENU_GAP - VIEWPORT_GUTTER
    const direction = below < Math.min(wantedHeight, MENU_CHROME + OPTION_HEIGHT) && above > below ? 'up' : 'down'
    const available = direction === 'up' ? above : below
    const maxHeight = Math.min(wantedHeight, Math.max(0, available))
    const width = Math.min(Math.max(MENU_WIDTH, trigger.width), viewport.width - VIEWPORT_GUTTER * 2)
    const left = Math.min(Math.max(trigger.left, offsetLeft + VIEWPORT_GUTTER), viewportRight - VIEWPORT_GUTTER - width)
    const top =
        direction === 'down'
            ? trigger.bottom + MENU_GAP
            : Math.max(offsetTop + VIEWPORT_GUTTER, trigger.top - MENU_GAP - maxHeight)

    return { direction, left, top, width, maxHeight }
}

/** Trim, strip diacritics, lowercase — so `türk` finds TRY and `peso argentino` finds ARS. */
const fold = (text: string): string => text.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A currency name splits into words on anything that is not a letter or a digit. */
const WORD_BREAK = /[^\p{L}\p{N}]+/u

/**
 * A code is three or four uppercase letters — the same shape the server accepts, so the picker
 * cannot offer a ticker the write would refuse.
 */
const TICKER_SHAPE = /^[A-Z]{3,4}$/

/** Trim, NFKC, uppercase — the server's `normaliseCode`, so `usd` and `ＵＳＤ` are one string. */
const normaliseTicker = (query: string): string => query.normalize('NFKC').trim().toUpperCase()

/**
 * Every currency this picker may offer.
 *
 * The rate constraint is two catalog lookups and no per-pair table: every rate is anchored on USD,
 * so a pair is priceable exactly when both sides have one — `canPrice`, the same predicate the
 * server prices with. In a room settling in a currency that has no rate the only survivor is that
 * one code, which is correct rather than a degraded list: such a room converts nothing, so every
 * expense in it is in its own currency and the balances are exact.
 *
 * This is what keeps the picker from promising something the write refuses. `requireRateTo` is set
 * on the expense composer and nowhere else; a room's OWN currency is chosen with no constraint,
 * which is where an invented ticker can be picked freely.
 *
 * `value` survives the filter unconditionally. It is already the selection, so showing it is not an
 * offer, and dropping it would leave the trigger naming a currency the open menu does not list.
 */
export function offerableCurrencies(
    currencies: readonly CurrencyInfo[],
    value: string,
    requireRateTo?: string
): CurrencyInfo[] {
    const room = requireRateTo === undefined ? null : currencyInfo(requireRateTo, currencies)
    const allowed = room ? currencies.filter((info) => canPrice(info, room)) : [...currencies]
    const missing = [...new Set([room?.code, value])].filter(
        (code): code is string => code !== undefined && !allowed.some((info) => info.code === code)
    )
    return [...missing.map((code) => currencyInfo(code, currencies)), ...allowed]
}

/** The base order every ranking falls back to: the five, then everything else A→Z. */
export function orderCurrencies(currencies: readonly CurrencyInfo[], common: readonly CurrencyInfo[]): CurrencyInfo[] {
    const shown = new Set(common.map((info) => info.code))
    return [
        ...common,
        ...currencies.filter((info) => !shown.has(info.code)).sort((a, b) => a.code.localeCompare(b.code)),
    ]
}

/**
 * The rows the menu shows before anything is typed, in this order: the current value, then the
 * codes the call site inferred, then the static backfill. Deduped, capped at five, and NEVER
 * re-sorted — the order is the ranking, and alphabetising it throws that ranking away.
 *
 * `value` is always row one, which is the whole answer to "what if the room's currency is not one
 * of the five": by construction it is. It is taken from the catalog when it is a real currency and
 * synthesised when it is an invented ticker, so a `BEER` room still opens on `BEER`.
 */
export function commonCurrencies(
    currencies: readonly CurrencyInfo[],
    value: string,
    suggested: readonly string[] = []
): CurrencyInfo[] {
    const byCode = new Map(currencies.map((info) => [info.code, info]))
    const picked: CurrencyInfo[] = []
    const take = (info: CurrencyInfo | undefined) => {
        if (!info || picked.length >= COMMON_COUNT) return
        if (picked.some((chosen) => chosen.code === info.code)) return
        picked.push(info)
    }

    take(byCode.get(value) ?? currencyInfo(value, currencies))

    let slots = SUGGESTED_SLOTS
    for (const code of suggested) {
        if (slots === 0) break
        const info = byCode.get(code)
        if (!info || picked.some((chosen) => chosen.code === code)) continue
        picked.push(info)
        slots -= 1
        if (picked.length >= COMMON_COUNT) break
    }

    for (const code of STATIC_COMMON) take(byCode.get(code))
    return picked
}

/**
 * Rank a query against the catalog. Four buckets, stable inside each, so ties keep the order they
 * arrived in — the five first, then A→Z. That single rule is what puts USD above UAH, UGX, UYU and
 * UZS for `u`, which is the ranking that matters most: one- and two-letter queries are the common
 * ones.
 *
 * Code SUBSTRING is deliberately absent. `ur` matching EUR and TRY is noise competing with a name
 * match for the top of a list that is read at a glance.
 */
export function matchCurrencies(query: string, currencies: readonly CurrencyInfo[]): CurrencyInfo[] {
    const needle = fold(query)
    if (needle === '') return [...currencies]

    const exact: CurrencyInfo[] = []
    const codePrefix: CurrencyInfo[] = []
    const nameWord: CurrencyInfo[] = []
    const nameSubstring: CurrencyInfo[] = []

    for (const info of currencies) {
        const code = fold(info.code)
        const name = fold(info.name)
        if (code === needle) exact.push(info)
        else if (code.startsWith(needle)) codePrefix.push(info)
        else if (name.split(WORD_BREAK).some((word) => word.startsWith(needle))) nameWord.push(info)
        // Two characters inside a name match half the catalog; three is where it starts to mean
        // something. `dol` finds every dollar, `do` would have found them by word start already.
        else if (needle.length >= 3 && name.includes(needle)) nameSubstring.push(info)
    }

    return [...exact, ...codePrefix, ...nameWord, ...nameSubstring]
}

/**
 * The invented ticker the query stands for, or null when it does not stand for one.
 *
 * It appears at three or four A–Z characters with no exact catalog match, and it appears LAST even
 * when real currencies matched — `BRLX` shows BRL and the offer to make `BRLX` a currency, and
 * nothing is corrected for the reader. `EUR` suppresses it outright: a joke currency must never be
 * able to shadow a real one.
 *
 * `requireRateTo` suppresses it too, and that is the rule that keeps the picker honest. An invented
 * code has no rate, so it can never convert into a room that settles in a real currency — offering
 * it would promise something the write refuses with a 400.
 */
export function customTickerFor(
    query: string,
    currencies: readonly CurrencyInfo[],
    options: { value?: string; allowCustom?: boolean; requireRateTo?: string } = {}
): string | null {
    if (options.allowCustom === false) return null
    if (options.requireRateTo !== undefined) return null
    const code = normaliseTicker(query)
    if (!TICKER_SHAPE.test(code)) return null
    if (code === options.value) return null
    if (currencies.some((info) => info.code === code)) return null
    return code
}

type MenuRow = { kind: 'currency' | 'custom'; code: string }

/**
 * Compact currency picker: one drawn sign and one ticker, everywhere.
 *
 * A native option can only contain text, which is why the old picker expanded
 * every row to “Brazilian Real (BRL)” and still could not show the drawing from
 * its closed trigger. The visible control is a keyboard listbox with a search
 * field on top of it. A silent native select remains as a form/test bridge, so
 * existing journeys that set its value still exercise the same `onChange` path.
 *
 * The five rows it opens on are the answer to 162 codes: scrolling is not a way to find CLP, and
 * single-letter typeahead is worse than a field you can type `chilean` into. The five are simply
 * what the field shows when it is empty.
 */
export function CurrencySelect({
    value,
    onChange,
    currencies,
    suggested,
    allowCustom = true,
    requireRateTo,
    className,
    variant = 'md',
    id,
    'aria-label': ariaLabel = 'Currency',
    'data-testid': testId,
}: CurrencySelectProps) {
    const t = useTranslations('room.currency')
    const locale = useLocale()
    const generatedId = useId()
    const listboxId = `${id ?? generatedId}-options`
    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const listboxRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const rowRefs = useRef<Array<HTMLDivElement | null>>([])
    /** Whether this open came from a key rather than a tap — see the focus effect. */
    const openedWithKeyRef = useRef(false)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const [placement, setPlacement] = useState<CurrencyMenuPlacement | null>(null)

    /** Named in the reader's language, because that is what the search matches on: `brasilien`
     *  has to find BRL for somebody reading the app in Portuguese. */
    const named = useMemo(
        () => currencies.map((info) => ({ ...info, name: currencyDisplayName(info.code, locale, currencies) })),
        [currencies, locale]
    )

    const selectable = useMemo(() => offerableCurrencies(named, value, requireRateTo), [named, value, requireRateTo])
    const common = useMemo(() => commonCurrencies(selectable, value, suggested), [selectable, value, suggested])
    const ordered = useMemo(() => orderCurrencies(selectable, common), [selectable, common])

    const trimmedQuery = query.trim()
    const matches = useMemo(
        () => (trimmedQuery === '' ? common : matchCurrencies(trimmedQuery, ordered)),
        [trimmedQuery, common, ordered]
    )
    const customCode = customTickerFor(query, currencies, { value, allowCustom, requireRateTo })

    const rows: MenuRow[] = useMemo(() => {
        const currencyRows: MenuRow[] = matches.map((info) => ({ kind: 'currency', code: info.code }))
        return customCode ? [...currencyRows, { kind: 'custom', code: customCode }] : currencyRows
    }, [matches, customCode])

    // The row list can shrink under the index — a new `value` re-ranks the five without the query
    // changing — so the highlight is clamped rather than allowed to point at nothing.
    const active = rows.length === 0 ? 0 : Math.min(activeIndex, rows.length - 1)
    const activeRow = rows[active]
    const activeId = activeRow ? `${listboxId}-${activeRow.code}` : undefined

    const roomInfo = requireRateTo === undefined ? null : currencyInfo(requireRateTo, currencies)
    const roomOnly = roomInfo !== null && !roomInfo.hasRate

    const updatePlacement = useCallback(() => {
        const trigger = triggerRef.current
        if (!trigger) return
        const visual = window.visualViewport
        setPlacement(
            currencyMenuPlacement(
                trigger.getBoundingClientRect(),
                {
                    width: visual?.width ?? window.innerWidth,
                    height: visual?.height ?? window.innerHeight,
                    offsetTop: visual?.offsetTop ?? 0,
                    offsetLeft: visual?.offsetLeft ?? 0,
                },
                Math.max(rows.length, 1),
                rows.some((row) => row.kind === 'custom')
            )
        )
    }, [rows])

    /** `offsetTop` is measured against the nearest POSITIONED ancestor, so this only agrees with
     *  `scrollTop` because the listbox itself is `relative`. Without that the rows are measured
     *  from the menu, 69px further down, and every row reads as overflowing a short list — which
     *  scrolled the selected row a little out of view every time the menu opened in a drawer. */
    const keepRowVisible = (row: HTMLDivElement | null) => {
        const listbox = listboxRef.current
        if (!row || !listbox) return
        const top = row.offsetTop
        const bottom = top + row.offsetHeight
        if (top < listbox.scrollTop) listbox.scrollTop = top
        else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight
    }

    const close = (restoreFocus = true) => {
        setOpen(false)
        setPlacement(null)
        setQuery('')
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
    }

    const choose = (code: string) => {
        onChange(code)
        close()
    }

    useLayoutEffect(() => {
        if (!open) return
        updatePlacement()
    }, [open, updatePlacement])

    /**
     * Release the sheet's focus trap for this menu.
     *
     * The menu is portalled to `document.body` so it can escape the drawer's scroll viewport. That
     * puts it outside the element Radix's `FocusScope` guards, and the scope listens for `focusin`
     * and `focusout` on `document`: whenever focus lands outside its container it pulls it straight
     * back to the last element that was inside — the trigger button. So the search field could
     * never hold focus inside `ExpenseDrawer`, by tap, by `.focus()`, or by arrow key.
     *
     * `onFocusOutside` / `onInteractOutside` do not touch this. Those belong to DismissableLayer
     * and govern DISMISSAL; the focus trap is a separate mechanism that reads neither.
     *
     * Radix's own portalled menus escape the trap by mounting a nested `FocusScope`, which pauses
     * the outer one through a module-private stack. `vaul` does not re-export that primitive, so
     * the equivalent here is to stop the two events the scope reacts to before they reach it: a
     * capture listener on `document` runs ahead of the scope's bubble listener. Only events that
     * move focus INTO this menu are stopped, so the trap keeps doing its job for the rest of the
     * sheet, and outside a drawer there is no scope listening and nothing changes.
     */
    useEffect(() => {
        if (!open) return
        const insideMenu = (node: EventTarget | null) =>
            node instanceof Node && menuRef.current?.contains(node) === true
        const onFocusIn = (event: FocusEvent) => {
            if (insideMenu(event.target)) event.stopImmediatePropagation()
        }
        const onFocusOut = (event: FocusEvent) => {
            if (insideMenu(event.relatedTarget)) event.stopImmediatePropagation()
        }
        document.addEventListener('focusin', onFocusIn, true)
        document.addEventListener('focusout', onFocusOut, true)
        return () => {
            document.removeEventListener('focusin', onFocusIn, true)
            document.removeEventListener('focusout', onFocusOut, true)
        }
    }, [open])

    /**
     * Focus goes to the search field, in a drawer as much as anywhere else.
     *
     * The old picker moved a roving focus between options and skipped that inside a Vaul sheet,
     * because Radix's focus trap bounced it back on every arrow key. A field cannot work that way —
     * it has to hold focus to receive text — so the effect above releases the trap for this menu,
     * and there is now one behaviour rather than two.
     *
     * The one thing that is still conditional is whether a TAP raises the keyboard. It should not:
     * most picks are one of the five, and a keyboard covering them to search a list you were not
     * going to search is the worst of both. The footer button is how you ask for one. A menu opened
     * with an arrow key is a different intent — that device has a keyboard and just used it.
     */
    useEffect(() => {
        if (!open) return
        const frame = requestAnimationFrame(() => {
            const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true
            if (fine || openedWithKeyRef.current) inputRef.current?.focus({ preventScroll: true })
        })
        return () => cancelAnimationFrame(frame)
    }, [open])

    /**
     * A new query is a new list, so it is read from the top.
     *
     * Without this the scroller keeps the offset the previous query left behind: clearing a search
     * lands on the empty state scrolled past USD and EUR, and the selected row — documented as
     * always row one, always visible — is off screen. The row count often does not change between
     * two queries (`kr` and the five both give five rows), so the highlight effect below cannot be
     * what resets it.
     */
    useEffect(() => {
        if (listboxRef.current) listboxRef.current.scrollTop = 0
    }, [trimmedQuery])

    // `placement.maxHeight` is in the deps because a keyboard opening under the menu shrinks the
    // scroller, and a row that was visible in the taller list may not be in the shorter one. Keyed
    // on the number rather than on the placement object, so that scrolling the list itself — which
    // also re-runs `updatePlacement`, through the capture-phase scroll listener — does not snap back.
    useEffect(() => {
        if (!open) return
        keepRowVisible(rowRefs.current[active])
    }, [active, open, rows.length, placement?.maxHeight])

    useEffect(() => {
        const closeOnOutsidePress = (event: PointerEvent) => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
        }
        document.addEventListener('pointerdown', closeOnOutsidePress)
        return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
    }, [])

    useEffect(() => {
        if (!open) return
        const visual = window.visualViewport
        window.addEventListener('resize', updatePlacement)
        window.addEventListener('scroll', updatePlacement, true)
        visual?.addEventListener('resize', updatePlacement)
        visual?.addEventListener('scroll', updatePlacement)
        return () => {
            window.removeEventListener('resize', updatePlacement)
            window.removeEventListener('scroll', updatePlacement, true)
            visual?.removeEventListener('resize', updatePlacement)
            visual?.removeEventListener('scroll', updatePlacement)
        }
    }, [open, updatePlacement])

    // Radix drawers listen for Escape during document capture, before the focused element's React
    // handler runs. The drawer vetoes that Escape while this menu exists; this bubble listener then
    // closes the menu even in the one-frame window before focus has reached the search field. The
    // field's own handler stops propagation, so the two never both fire.
    useEffect(() => {
        if (!open) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            close()
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
    }, [open])

    // A fresh open starts on the value — `commonCurrencies` makes that row one — and a fresh query
    // starts on its best match, so Enter after typing `chf` picks CHF without an arrow key.
    useEffect(() => {
        setActiveIndex(0)
    }, [open, trimmedQuery])

    const moveActive = (delta: number) => {
        if (rows.length === 0) return
        setActiveIndex((current) => (current + delta + rows.length) % rows.length)
    }

    /**
     * The one line under the list. It is a live region, so it says what changed and nothing else:
     * how many currencies the query found, or — when it found none — why, and what can be done
     * about it. None of these is an error, so none of them reads as one.
     */
    const showAll = trimmedQuery === '' && ordered.length > common.length
    const status = (() => {
        if (trimmedQuery === '') {
            if (roomOnly) return t('roomOnly', { roomCurrency: roomInfo?.code ?? '' })
            return showAll ? '' : t('results', { count: matches.length })
        }
        if (matches.length > 0) return t('results', { count: matches.length })
        return customCode ? t('noMatch', { query: trimmedQuery }) : t('noMatchLong', { query: trimmedQuery })
    })()

    const menu =
        open &&
        placement &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                ref={menuRef}
                data-currency-menu
                data-direction={placement.direction}
                className="shadow-4 pointer-events-auto fixed z-[70] flex flex-col overflow-hidden rounded-md border-2 border-n-1 bg-white"
                style={{
                    left: placement.left,
                    top: placement.top,
                    width: placement.width,
                    maxHeight: placement.maxHeight,
                }}
            >
                {/* The field is drawn like every other field in the app — `.input` plus a size from
                    `fieldSizes` — because it has to read as something you type into. Borderless over
                    white it read as a section heading, and on touch nothing else says otherwise:
                    a tap deliberately does not raise the keyboard. */}
                <div className="relative shrink-0 border-b border-dashed border-n-1 p-2">
                    <input
                        ref={inputRef}
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listboxId}
                        aria-activedescendant={activeId}
                        aria-autocomplete="list"
                        aria-label={t('searchLabel')}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={query}
                        placeholder={t('searchPlaceholder')}
                        data-testid={testId ? `${testId}-search` : undefined}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                event.preventDefault()
                                moveActive(event.key === 'ArrowDown' ? 1 : -1)
                            } else if ((event.key === 'Home' || event.key === 'End') && trimmedQuery === '') {
                                // With text in the field the caret wins: Home and End are how you
                                // edit a query, and a list jump would make the field unusable.
                                event.preventDefault()
                                setActiveIndex(event.key === 'Home' ? 0 : Math.max(rows.length - 1, 0))
                            } else if (event.key === 'Enter') {
                                // Two call sites are inside a <form>; an unprevented Enter submits.
                                event.preventDefault()
                                if (activeRow) choose(activeRow.code)
                            } else if (event.key === 'Escape') {
                                event.preventDefault()
                                event.stopPropagation()
                                if (query === '') close()
                                else setQuery('')
                            } else if (event.key === 'Tab') {
                                // Focus is at the end of document.body, so a natural tab would land
                                // somewhere unrelated. Consume it and hand focus back to the
                                // trigger; a second Tab then leaves normally.
                                event.preventDefault()
                                close()
                            }
                        }}
                        className={cn('input', fieldSizes.sm, 'pr-9 placeholder:font-normal')}
                    />
                    {query !== '' && (
                        <button
                            type="button"
                            aria-label={t('clearSearch')}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => {
                                setQuery('')
                                inputRef.current?.focus()
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-grey-1"
                        >
                            <Icon name="x" size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>

                <div
                    ref={listboxRef}
                    id={listboxId}
                    role="listbox"
                    aria-label={ariaLabel}
                    className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-n-1"
                >
                    {rows.map((row, index) => {
                        const selected = row.code === value
                        return (
                            <div
                                key={row.code}
                                id={`${listboxId}-${row.code}`}
                                ref={(node) => {
                                    rowRefs.current[index] = node
                                }}
                                role="option"
                                aria-selected={selected}
                                // The row draws a sign and a ticker like every other row; the
                                // label is where it says what choosing it does.
                                aria-label={row.kind === 'custom' ? t('useCustom', { code: row.code }) : undefined}
                                data-active={index === active ? 'true' : undefined}
                                data-testid={row.kind === 'custom' ? 'currency-custom' : undefined}
                                // A tabIndex=-1 button still takes pointer focus in Safari, which
                                // would blur the search field on every tap.
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => choose(row.code)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={cn(
                                    'flex min-h-12 w-full cursor-pointer items-center rounded-sm px-3 text-left',
                                    row.kind === 'custom' &&
                                        'mt-1 flex-col items-start justify-center gap-0.5 border-t border-dashed border-n-1 pt-1',
                                    index === active && 'bg-primary-3',
                                    selected && 'bg-primary-1'
                                )}
                            >
                                {row.kind === 'currency' ? (
                                    <CurrencyTag code={row.code} catalog={currencies} />
                                ) : (
                                    <>
                                        <span className="flex w-full items-center justify-between gap-1">
                                            <CurrencyTag code={row.code} catalog={currencies} />
                                            <span className="shrink-0 text-h10 uppercase tracking-wide text-grey-1">
                                                {t('noRateChip')}
                                            </span>
                                        </span>
                                        <span className="text-xs leading-4 text-grey-1">{t('useCustomHint')}</span>
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>

                <div className="shrink-0 border-t border-dashed border-n-1 px-3 py-2">
                    {showAll && (
                        <button
                            type="button"
                            data-testid={testId ? `${testId}-all` : undefined}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={() => inputRef.current?.focus()}
                            className="w-full text-left text-xs font-bold text-n-1 underline"
                        >
                            {t('all', { count: ordered.length })}
                        </button>
                    )}
                    {/* Mounted whether or not it has anything to say: a live region added at the
                        moment its text appears is a live region a screen reader never announces. */}
                    <p aria-live="polite" className={cn('text-xs leading-4 text-grey-1', status === '' && 'sr-only')}>
                        {status}
                    </p>
                </div>
            </div>,
            document.body
        )

    return (
        <div ref={rootRef} className={cn('relative w-full', className)}>
            {/* Compatibility bridge for forms and existing Playwright journeys.
                It is not an interaction surface and is hidden from the accessibility tree. */}
            <select
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                tabIndex={-1}
                aria-hidden="true"
                data-testid={testId}
                className="pointer-events-none absolute size-px opacity-0"
            >
                {selectable.map((info) => (
                    <option key={info.code} value={info.code}>
                        {info.code}
                    </option>
                ))}
            </select>

            <button
                ref={triggerRef}
                type="button"
                aria-label={`${ariaLabel}, ${value}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open && placement ? listboxId : undefined}
                onClick={() => {
                    if (open) close(false)
                    else {
                        openedWithKeyRef.current = false
                        setOpen(true)
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                    event.preventDefault()
                    if (!open) {
                        openedWithKeyRef.current = true
                        setOpen(true)
                    } else {
                        // Only reachable on a coarse pointer, where the tap left focus here.
                        inputRef.current?.focus({ preventScroll: true })
                        moveActive(event.key === 'ArrowDown' ? 1 : -1)
                    }
                }}
                className={cn(
                    'input flex w-full items-center justify-between gap-1 text-left focus-visible:border-primary-1 focus-visible:ring-2 focus-visible:ring-primary-1',
                    fieldSizes[variant],
                    'pr-3'
                )}
            >
                <span key={value} aria-hidden>
                    <CurrencyTag code={value} catalog={currencies} />
                </span>
                <Icon
                    name="chevron-down"
                    size={20}
                    aria-hidden="true"
                    className={cn(
                        'shrink-0 text-n-1 transition-transform motion-reduce:transition-none',
                        open && 'rotate-180'
                    )}
                />
            </button>
            {menu}
        </div>
    )
}
