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
 */
export const DrawerBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-n-1',
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

/**
 * What a sheet's `<DrawerContent>` and `<DrawerHeader>` must carry until those
 * defaults can move into `Drawer.tsx`.
 *
 * `drawerContentClass` supplies the border COLOUR: the base is a bare `border`,
 * which resolves to currentColor, so three sheets were outlined in black and
 * four in whatever the text colour happened to be.
 *
 * `drawerHeaderClass` cancels the base's `text-center sm:text-left`. Below
 * 640px that centred the title of every sheet whose body is left-aligned —
 * which is all of them.
 */
export const drawerContentClass = 'border-n-1'
export const drawerHeaderClass = 'px-4 pb-1 text-left'
