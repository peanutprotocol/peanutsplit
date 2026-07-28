'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Icon } from '@/components/ui/Icon'
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
    id?: string
    'aria-label'?: string
    'data-testid'?: string
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
    id,
    'aria-label': ariaLabel = 'Currency',
    'data-testid': testId,
}: CurrencySelectProps) {
    const reduceMotion = useReducedMotion()
    const generatedId = useId()
    const listboxId = `${id ?? generatedId}-options`
    const rootRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
    const [open, setOpen] = useState(false)

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

    useEffect(() => {
        if (!open) return
        requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus())
    }, [activeIndex, open])

    useEffect(() => {
        const closeOnOutsidePress = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('pointerdown', closeOnOutsidePress)
        return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
    }, [])

    const close = (restoreFocus = true) => {
        setOpen(false)
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
    }

    const choose = (code: string) => {
        onChange(code)
        close()
    }

    const focusOption = (index: number) => {
        const next = (index + ordered.length) % ordered.length
        setActiveIndex(next)
        optionRefs.current[next]?.focus()
        optionRefs.current[next]?.scrollIntoView({ block: 'nearest' })
    }

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
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
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
                        setOpen(true)
                        setActiveIndex(
                            event.key === 'ArrowDown'
                                ? selectedIndex
                                : (selectedIndex - 1 + ordered.length) % ordered.length
                        )
                    }
                }}
                className="input flex h-16 w-full items-center justify-between gap-1 pl-4 pr-3 text-left focus-visible:border-primary-1 focus-visible:ring-2 focus-visible:ring-primary-1"
            >
                <motion.span
                    key={value}
                    aria-hidden
                    initial={reduceMotion ? false : { scale: 0.94, opacity: 0.55 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                >
                    <CurrencyTag code={value} catalog={currencies} />
                </motion.span>
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

            {open && (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={ariaLabel}
                    className="shadow-4 absolute bottom-[calc(100%+0.5rem)] left-0 z-50 max-h-[min(16rem,45vh)] w-full min-w-[8.5rem] overflow-y-auto rounded-sm border border-n-1 bg-white p-1"
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
                                ref={(node) => {
                                    optionRefs.current[index] = node
                                }}
                                type="button"
                                role="option"
                                aria-selected={selected}
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
                                        close()
                                    } else if (event.key === 'Tab') {
                                        close(false)
                                    }
                                }}
                                className={cn(
                                    'flex min-h-11 w-full items-center rounded-sm px-3 text-left outline-none hover:bg-primary-3 focus-visible:bg-primary-3',
                                    divider && 'mt-1 border-t border-n-1 pt-1',
                                    selected && 'bg-primary-1'
                                )}
                            >
                                <CurrencyTag code={info.code} catalog={currencies} />
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
