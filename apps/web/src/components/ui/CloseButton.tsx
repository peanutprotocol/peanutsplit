'use client'

import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { Icon } from './Icon'

/**
 * The one way to dismiss a surface: drawer, overlay, banner, full-page form.
 *
 * Every one of these was hand-rolled, and they had drifted into four different
 * buttons — a black-outlined circle on the expense drawer and the create-room
 * form, a square outline on the scanner, a bare grey glyph on the install
 * banner, and nothing at all on room settings. The circle was the loudest of
 * them: a 44px pill with a 2px border reads as a primary action sitting next to
 * a drawer title it is only there to close.
 *
 * So the chrome is gone and only the drawn X remains. What stays fixed is the
 * part a finger cares about — a 44px target and the same nudge on press. Size
 * is not a per-surface decision, which is why there is no size prop; a caller
 * that needs a different tint or a layout offset passes `className`.
 */
const CLOSE_ICON_SIZE = 21

type CloseButtonBaseProps = {
    /** Accessible name. Always a translated string — this button has no visible label. */
    label: string
    className?: string
}

type CloseButtonElementProps =
    | ({ href?: never } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'className' | 'type'>)
    /** A close that is really a navigation (leaving a full-page form) stays a link,
     *  so it keeps middle-click, open-in-new-tab and prefetch. */
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'aria-label' | 'className' | 'href'>)

export type CloseButtonProps = CloseButtonBaseProps & CloseButtonElementProps

export function CloseButton({ label, className, href, ...props }: CloseButtonProps) {
    const classes = cn(
        'flex size-11 shrink-0 items-center justify-center rounded-sm transition-transform active:rotate-3',
        className
    )
    const glyph = <Icon name="x" size={CLOSE_ICON_SIZE} />

    if (href !== undefined) {
        return (
            <Link
                href={href}
                aria-label={label}
                className={classes}
                {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
            >
                {glyph}
            </Link>
        )
    }

    return (
        <button
            type="button"
            aria-label={label}
            className={classes}
            {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
        >
            {glyph}
        </button>
    )
}

CloseButton.displayName = 'CloseButton'
