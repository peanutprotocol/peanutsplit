'use client'

import { useTranslations } from 'next-intl'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody, drawerContentClass, drawerHeaderClass } from '@/components/ui/DrawerLayout'
import { AccountPanel } from './AccountPanel'

/**
 * The landing page has no settings drawer to hang the email box in, so it gets
 * this one. Opened only by an explicit tap on the "using a new phone someday?"
 * line — there is no prompt engine here and nothing appears on its own.
 */
export function SaveRoomsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const t = useTranslations('account')

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className={drawerContentClass}>
                {/* Title only — the panel already carries the blurb, and saying
                    it twice in one sheet reads as a marketing page. */}
                <DrawerHeader className={drawerHeaderClass}>
                    <DrawerTitle className="text-h5">{t('title')}</DrawerTitle>
                </DrawerHeader>
                <DrawerBody>
                    <AccountPanel />
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}
