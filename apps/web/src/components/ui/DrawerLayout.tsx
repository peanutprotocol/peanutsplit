'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

/**
 * Layout for the inside of a sheet. Lives beside `Drawer.tsx` rather than in it
 * so the vaul wrapper stays untouched while a rework is in flight there — fold
 * these two into `Drawer.tsx` (and drop this file) once it is free.
 *
 * They exist because seven sheets had drifted apart: four different section
 * gaps, `px-4` vs `px-5`, and three unrelated bottom-inset formulas
 * (`max(2.5rem,safe)`, `max(2rem,safe)`, `calc(1rem+safe)`). Layout is not a
 * per-drawer decision.
 */

/**
 * The body of a sheet: one section gap, one inset, one safe-area allowance.
 *
 * This is the drawer's single vertical scroll owner. The old anonymous
 * `overflow-auto` wrapper sat around the whole drawer, so its scrollbar ran
 * beside the title and clipped floating pickers. Headers and dedicated action
 * bars now stay outside this viewport.
 *
 * `[&>*]:shrink-0` is what makes it scroll at all. This is a column flex
 * container, so every section in it is a flex ITEM and shrinks when the sheet
 * runs out of room. A section only resists that while its automatic minimum size
 * is content-based — and every card in here is `overflow-hidden` for its rounded
 * corners, which per the flexbox spec drops that minimum to zero. So the tall
 * ones (an EXACT split with ten people) were silently squashed to fit instead of
 * overflowing: the viewport had nothing to scroll, the wheel did nothing, and
 * each card clipped its own last rows.
 */
export const DrawerBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-n-1 [&>*]:shrink-0',
                className
            )}
            {...props}
        />
    )
)
DrawerBody.displayName = 'DrawerBody'

/**
 * The action stack, last thing in the body: full width, primary first, the
 * secondary (`variant="stroke"`) under it.
 *
 * When it is a sibling of `DrawerBody`, this is the stable action zone. Existing
 * drawers may still render it inside a body while they migrate; in that case it
 * remains an ordinary in-flow stack.
 */
export const DrawerActions = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex shrink-0 flex-col gap-3', className)} {...props} />
)
DrawerActions.displayName = 'DrawerActions'
