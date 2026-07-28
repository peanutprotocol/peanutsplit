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
 * `pb` clears the home indicator on a phone and still leaves a comfortable
 * margin on a device that has none — the sheet's last control must never sit
 * flush against the bottom edge.
 */
export const DrawerBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn('flex flex-col gap-5 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4', className)}
            {...props}
        />
    )
)
DrawerBody.displayName = 'DrawerBody'

/**
 * The action stack, last thing in the body: full width, primary first, the
 * secondary (`variant="stroke"`) under it.
 *
 * Deliberately not a pinned footer. These sheets are short, and a bar fixed to
 * the bottom of an 80vh sheet on a 667px phone covers the row you are reading.
 */
export const DrawerActions = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={cn('flex flex-col gap-3', className)} {...props} />
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
