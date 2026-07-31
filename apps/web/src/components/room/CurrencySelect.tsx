'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { fieldSizes, type FieldSize } from '@/components/ui/field'
import type { CurrencyInfo } from '@/lib/api-types'
import { cn } from '@/lib/cn'
import { CurrencyTag } from './CurrencyTag'

interface CurrencySelectProps {
    value: string
    onChange: (code: string) => void
    currencies: readonly CurrencyInfo[]
    /** Inferred (or contextually obvious) codes, pinned above the alphabetical list. */
    suggested?: readonly string[]
    className?: string
    variant?: FieldSize
    id?: string
    'aria-label'?: string
    'data-testid'?: string
}

const MENU_GAP = 8
const VIEWPORT_GUTTER = 12
const MENU_WIDTH = 176
const MENU_MAX_HEIGHT = 256
const OPTION_HEIGHT = 48

export interface CurrencyMenuPlacement {
    direction: 'down' | 'up'
    left: number
    top: number
    width: number
    maxHeight: number
}

/**
 * Places the portalled list inside the *visible* viewport.
 *
 * Down is the default: the add-expense trigger is near the top of the sheet,
 * so opening upward was both surprising and the easiest way to collide with
 * the title/drag handle. Up only wins when the menu genuinely fits better
 * there. Keeping this pure makes the keyboard/visual-viewport edge cases
 * testable without mounting a drawer.
 */
export function currencyMenuPlacement(
    trigger: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width'>,
    viewport: { width: number; height: number; offsetTop?: number; offsetLeft?: number },
    itemCount: number
): CurrencyMenuPlacement {
    const offsetTop = viewport.offsetTop ?? 0
    const offsetLeft = viewport.offsetLeft ?? 0
    const wantedHeight = Math.min(MENU_MAX_HEIGHT, itemCount * OPTION_HEIGHT + 8)
    const viewportBottom = offsetTop + viewport.height
    const viewportRight = offsetLeft + viewport.width
    const below = viewportBottom - trigger.bottom - MENU_GAP - VIEWPORT_GUTTER
    const above = trigger.top - offsetTop - MENU_GAP - VIEWPORT_GUTTER
    const direction = below < Math.min(wantedHeight, 192) && above > below ? 'up' : 'down'
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

/**
 * Compact currency picker: one drawn sign and one ticker, everywhere.
 *
 * A native option can only contain text, which is why the old picker expanded
 * every row to “Brazilian Real (BRL)” and still could not show the drawing from
 * its closed trigger. The visible control is now a keyboard listbox. A silent
 * native select remains as a form/test bridge, so existing journeys that set
 * its value still exercise the same `onChange` path.
 */
export function CurrencySelect({
    value,
    onChange,
    currencies,
    suggested,
    className,
    variant = 'md',
    id,
    'aria-label': ariaLabel = 'Currency',
    'data-testid': testId,
}: CurrencySelectProps) {
    const generatedId = useId()
    const listboxId = `${id ?? generatedId}-options`
    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const listboxRef = useRef<HTMLDivElement>(null)
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
    const typeaheadRef = useRef('')
    const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [open, setOpen] = useState(false)
    const [placement, setPlacement] = useState<CurrencyMenuPlacement | null>(null)

    const ordered = useMemo(() => {
        const byCode = new Map(currencies.map((info) => [info.code, info]))
        const pinned = (suggested ?? [])
            .map((code) => byCode.get(code))
            .filter((info): info is CurrencyInfo => info !== undefined)
            .filter((info, index, list) => list.findIndex((candidate) => candidate.code === info.code) === index)
        const pinnedCodes = new Set(pinned.map((info) => info.code))
        const rest = [...currencies]
            .filter((info) => !pinnedCodes.has(info.code))
            .sort((a, b) => a.code.localeCompare(b.code))
        return [...pinned, ...rest]
    }, [currencies, suggested])

    const selectedIndex = Math.max(
        0,
        ordered.findIndex((info) => info.code === value)
    )
    const [activeIndex, setActiveIndex] = useState(selectedIndex)

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
                ordered.length
            )
        )
    }, [ordered.length])

    const keepOptionVisible = (option: HTMLButtonElement | null) => {
        const listbox = listboxRef.current
        if (!option || !listbox) return
        const top = option.offsetTop
        const bottom = top + option.offsetHeight
        if (top < listbox.scrollTop) listbox.scrollTop = top
        else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight
    }

    useLayoutEffect(() => {
        if (!open) return
        updatePlacement()
    }, [open, updatePlacement])

    useEffect(() => {
        if (!open) return
        requestAnimationFrame(() => {
            const option = optionRefs.current[activeIndex]
            // A Radix/Vaul modal traps focus inside the sheet. The list is
            // portalled outside it so it can escape the scroll viewport; trying
            // to focus an option there makes the trap bounce focus back on every
            // arrow key. In a drawer the trigger keeps focus and the nearby live
            // region announces the active ticker. Everywhere else the options
            // use ordinary roving focus.
            if (!triggerRef.current?.closest('[data-vaul-drawer]')) {
                option?.focus({ preventScroll: true })
            }
            keepOptionVisible(option)
        })
    }, [activeIndex, open])

    useEffect(() => {
        const closeOnOutsidePress = (event: PointerEvent) => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !listboxRef.current?.contains(target)) setOpen(false)
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

    // Radix drawers listen for Escape during document capture, before the
    // focused option's React handler runs. The drawer vetoes that Escape while
    // this menu exists; this bubble listener then closes the menu even in the
    // one-frame window before focus has moved from the trigger to an option.
    useEffect(() => {
        if (!open) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            setPlacement(null)
            typeaheadRef.current = ''
            requestAnimationFrame(() => triggerRef.current?.focus())
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
    }, [open])

    useEffect(
        () => () => {
            if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
        },
        []
    )

    useEffect(() => {
        if (!open) setActiveIndex(selectedIndex)
    }, [open, selectedIndex])

    const close = (restoreFocus = true) => {
        setOpen(false)
        setPlacement(null)
        typeaheadRef.current = ''
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
    }

    const choose = (code: string) => {
        onChange(code)
        close()
    }

    const focusOption = (index: number) => {
        const next = (index + ordered.length) % ordered.length
        setActiveIndex(next)
        const option = optionRefs.current[next]
        if (!triggerRef.current?.closest('[data-vaul-drawer]')) {
            option?.focus({ preventScroll: true })
        }
        keepOptionVisible(option)
    }

    const typeahead = (key: string) => {
        if (key.length !== 1 || !/^[a-z]$/i.test(key)) return false
        typeaheadRef.current += key.toUpperCase()
        if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current)
        typeaheadTimerRef.current = setTimeout(() => {
            typeaheadRef.current = ''
        }, 650)
        const match = ordered.findIndex((info) => info.code.startsWith(typeaheadRef.current))
        if (match >= 0) focusOption(match)
        return true
    }

    const listbox =
        open &&
        placement &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                ref={listboxRef}
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                data-direction={placement.direction}
                data-currency-menu
                className="shadow-4 pointer-events-auto fixed z-[70] overflow-y-auto overscroll-contain rounded-md border-2 border-n-1 bg-white p-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-n-1"
                style={{
                    left: placement.left,
                    top: placement.top,
                    width: placement.width,
                    maxHeight: placement.maxHeight,
                }}
            >
                {ordered.map((info, index) => {
                    const selected = info.code === value
                    const divider =
                        index > 0 &&
                        (suggested ?? []).includes(ordered[index - 1]?.code) &&
                        !(suggested ?? []).includes(info.code)
                    return (
                        <button
                            key={info.code}
                            id={`${listboxId}-${info.code}`}
                            ref={(node) => {
                                optionRefs.current[index] = node
                            }}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            data-active={index === activeIndex ? 'true' : undefined}
                            tabIndex={index === activeIndex ? 0 : -1}
                            onClick={() => choose(info.code)}
                            onFocus={() => setActiveIndex(index)}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                    event.preventDefault()
                                    focusOption(activeIndex + (event.key === 'ArrowDown' ? 1 : -1))
                                } else if (event.key === 'Home') {
                                    event.preventDefault()
                                    focusOption(0)
                                } else if (event.key === 'End') {
                                    event.preventDefault()
                                    focusOption(ordered.length - 1)
                                } else if (event.key === 'Escape') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    close()
                                } else if (event.key === 'Tab') {
                                    close(false)
                                } else if (typeahead(event.key)) {
                                    event.preventDefault()
                                }
                            }}
                            className={cn(
                                'flex min-h-12 w-full items-center rounded-sm px-3 text-left outline-none hover:bg-primary-3 focus-visible:bg-primary-3',
                                divider && 'mt-1 border-t border-dashed border-n-1 pt-1',
                                selected && 'bg-primary-1'
                            )}
                        >
                            <CurrencyTag code={info.code} catalog={currencies} />
                        </button>
                    )
                })}
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
                {currencies.map((info) => (
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
                    if (open) {
                        setOpen(false)
                    } else {
                        setActiveIndex(selectedIndex)
                        setOpen(true)
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        if (open) {
                            focusOption(activeIndex + (event.key === 'ArrowDown' ? 1 : -1))
                        } else {
                            setOpen(true)
                            setActiveIndex(
                                event.key === 'ArrowDown'
                                    ? selectedIndex
                                    : (selectedIndex - 1 + ordered.length) % ordered.length
                            )
                        }
                    } else if (open && event.key === 'Home') {
                        event.preventDefault()
                        focusOption(0)
                    } else if (open && event.key === 'End') {
                        event.preventDefault()
                        focusOption(ordered.length - 1)
                    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        choose(ordered[activeIndex].code)
                    } else if (open && event.key === 'Escape') {
                        event.preventDefault()
                        event.stopPropagation()
                        close()
                    } else if (open && typeahead(event.key)) {
                        event.preventDefault()
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
            <span className="sr-only" aria-live="polite">
                {open ? `${ariaLabel}: ${ordered[activeIndex]?.code}` : ''}
            </span>
            {listbox}
        </div>
    )
}
