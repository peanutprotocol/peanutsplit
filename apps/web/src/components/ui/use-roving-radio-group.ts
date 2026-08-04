'use client'

import { type KeyboardEvent, type RefCallback, useRef } from 'react'

const RADIO_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const
type RadioKey = (typeof RADIO_KEYS)[number]

const isRadioKey = (key: string): key is RadioKey => RADIO_KEYS.some((candidate) => candidate === key)

/** The keyboard movement native radios provide, kept pure so wrapping and edge
 *  behavior cannot drift between visual pickers. */
export function nextRovingRadioIndex(key: RadioKey, current: number, length: number): number {
    if (length <= 0) return -1
    if (key === 'Home') return 0
    if (key === 'End') return length - 1
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + length) % length
    return (current + 1) % length
}

interface RovingRadioGroupOptions<Value extends string> {
    options: readonly Value[]
    value: Value | null | undefined
    /** Return false when a busy controlled picker rejects this move. */
    onChange: (value: Value) => void | boolean
    disabled?: boolean
}

interface RovingRadioProps {
    ref: RefCallback<HTMLButtonElement>
    tabIndex: 0 | -1
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * Adds native radio keyboard behavior to button-shaped choices without owning
 * their appearance: one group tab stop, arrows with wrapping, and Home/End.
 */
export function useRovingRadioGroup<Value extends string>({
    options,
    value,
    onChange,
    disabled = false,
}: RovingRadioGroupOptions<Value>) {
    const nodes = useRef(new Map<Value, HTMLButtonElement>())
    const selected = value !== null && value !== undefined && options.includes(value) ? value : options[0]

    const getRadioProps = (option: Value): RovingRadioProps => ({
        ref: (node) => {
            if (node) nodes.current.set(option, node)
            else nodes.current.delete(option)
        },
        tabIndex: !disabled && option === selected ? 0 : -1,
        onKeyDown: (event) => {
            if (disabled || !isRadioKey(event.key)) return
            const current = options.indexOf(option)
            if (current < 0) return
            event.preventDefault()
            const next = options[nextRovingRadioIndex(event.key, current, options.length)]
            if (!next) return
            const accepted = onChange(next)
            if (accepted === false) return
            // Existing options can take focus before a controlled onChange
            // makes the surface busy. Newly revealed options use the RAF below.
            nodes.current.get(next)?.focus()
            // onChange may reveal a collapsed option before focus can move.
            requestAnimationFrame(() => nodes.current.get(next)?.focus())
        },
    })

    return { getRadioProps }
}
