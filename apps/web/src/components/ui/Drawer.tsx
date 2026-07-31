'use client'

import * as React from 'react'
import { cn as twMerge } from '@/lib/cn'
import { Drawer as DrawerPrimitive } from 'vaul'

/**
 * A sheet is modal, so the room behind it is `inert`: nothing in it is tabbable,
 * reachable by a screen reader's own cursor, or findable.
 *
 * The dialog underneath already marks the background `aria-hidden`, which is the
 * half of modality browsers and screen readers disagree about — out of the
 * accessibility tree while every control in it stays focusable. `inert` is the
 * whole of it, so the `aria-hidden` goes with it: shipping both is exactly the
 * combination that leaves a subtree unreadable and still tabbable. The dialog
 * removes the attribute again on close and finds a no-op.
 *
 * The dialog's own marker attribute picks the elements rather than a hand-rolled
 * sweep of `document.body`: it already leaves out the live regions the toasts
 * announce through, and the sheet itself. The overlay is the one marked thing
 * that has to stay live — decorative to a screen reader, but it is also the
 * backdrop, and an inert backdrop cannot be tapped to close the sheet.
 *
 * This renders inside the content so it lives exactly as long as the sheet does.
 * The work waits a microtask because effects run child first: the dialog marks
 * the background in an effect of its own, which has not run yet when this one
 * does, and the marker is what we read.
 */
function InertBackground() {
    React.useEffect(() => {
        let cancelled = false
        let ours: HTMLElement[] = []
        queueMicrotask(() => {
            if (cancelled) return
            const background = Array.from(
                document.querySelectorAll<HTMLElement>('body > [data-aria-hidden]:not([data-vaul-overlay])')
            )
            ours = background.filter((element) => !element.hasAttribute('inert'))
            for (const element of background) {
                element.setAttribute('inert', '')
                element.removeAttribute('aria-hidden')
            }
        })
        return () => {
            cancelled = true
            // Only what this sheet made inert: a sheet opened on top of another one
            // must not hand the first sheet's background back on the way out.
            for (const element of ours) element.removeAttribute('inert')
        }
    }, [])
    return null
}

/**
 * `autoFocus` is vaul's, and it defaults to FALSE: it cancels the dialog's
 * open-autofocus, so focus stayed on whatever opened the sheet. The focus trap
 * only pulls focus back to the last element it saw INSIDE the dialog, so with
 * nothing ever focused in there the trap never armed either — Tab walked into
 * the room behind the sheet, and two of them opened a second sheet on top of
 * this one. Being modal is what a sheet is, not a per-caller decision.
 */
const Drawer = ({
    shouldScaleBackground = true,
    autoFocus = true,
    ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => {
    return (
        <DrawerPrimitive.Root
            shouldScaleBackground={shouldScaleBackground}
            autoFocus={autoFocus}
            snapToSequentialPoint
            {...props}
        />
    )
}
Drawer.displayName = 'Drawer'

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Overlay ref={ref} className={twMerge('fixed inset-0 z-50 bg-black/80', className)} {...props} />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    /** No sheet here is opened by a `DrawerTrigger` — they are URL params — so the
     *  dialog's own "focus the trigger again" had no trigger to find and closing
     *  dropped focus on `<body>`. Remember what the sheet took focus from. */
    const openerRef = React.useRef<HTMLElement | null>(null)

    return (
        <DrawerPortal>
            <DrawerOverlay />
            <DrawerPrimitive.Content
                ref={ref}
                className={twMerge(
                    // The sheet stops short of the top on purpose. That strip is the
                    // only backdrop a phone has to tap on, and it is where you watch
                    // the room repaint behind a theme change. At full height there is
                    // no "behind" and no way out but the close button.
                    'fixed inset-x-0 bottom-0 z-50 mt-6 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border bg-background',
                    className
                )}
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
                    onOpenAutoFocus?.(event)
                }}
                onCloseAutoFocus={(event) => {
                    onCloseAutoFocus?.(event)
                    // Ours instead of the dialog's, which would go looking for a trigger.
                    event.preventDefault()
                    if (openerRef.current?.isConnected) openerRef.current.focus()
                    openerRef.current = null
                }}
                {...props}
            >
                <InertBackground />
                <div className="mx-auto my-3 h-1.5 w-10 shrink-0 rounded-full bg-black" />
                <div className="flex min-h-0 w-full justify-center">
                    {/* vaul animates the sheet; this is the content settling inside it.
                        A mount-time CSS animation rather than a transition, because the
                        content is portalled in on open — there is no "before" state for
                        a transition to run from. */}
                    <div className="animate-drawer-in flex min-h-0 w-full flex-col md:max-h-[min(92dvh,52rem)] md:max-w-xl">
                        {children}
                    </div>
                </div>
            </DrawerPrimitive.Content>
        </DrawerPortal>
    )
})
DrawerContent.displayName = 'DrawerContent'

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={twMerge('grid gap-1.5 p-4 text-center sm:text-left', className)} {...props} />
)
DrawerHeader.displayName = 'DrawerHeader'

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={twMerge('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
)
DrawerFooter.displayName = 'DrawerFooter'

const DrawerTitle = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Title
        ref={ref}
        className={twMerge('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
    />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
    React.ElementRef<typeof DrawerPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DrawerPrimitive.Description ref={ref} className={twMerge('text-sm text-grey-1', className)} {...props} />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription }
