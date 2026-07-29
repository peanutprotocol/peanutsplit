'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'

/**
 * What the room link actually is, on demand.
 *
 * Three independent first-time readers of the hero each stopped at the same line — "only
 * people with this link can open it" — and each said it was the biggest unanswered thing on
 * the page. It is the product's entire access model in eight words of grey text, under a URL,
 * on a page about money between friends.
 *
 * A sheet rather than more hero copy: the doubt arrives at a specific moment (looking at the
 * URL), and the answer is four sentences long — too much for the fold, too important to bury
 * behind a toggle most people never open.
 */
export function LinkExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useTranslations('marketing.linkExplainer')
    const points = ['bearer', 'private', 'lost', 'nothingElse'] as const

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{t('title')}</DrawerTitle>
                </DrawerHeader>

                <DrawerBody className="gap-4">
                    <ul className="flex flex-col gap-3">
                        {points.map((point) => (
                            <li
                                key={point}
                                className="flex items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
                            >
                                <span
                                    aria-hidden="true"
                                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-n-1 bg-primary-1"
                                >
                                    <Icon name="link" size={14} className="text-n-1" />
                                </span>
                                <span className="flex-1">
                                    <span className="block text-h7">{t(`${point}.title`)}</span>
                                    <span className="mt-1 block text-sm leading-5 text-grey-1">
                                        {t(`${point}.body`)}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>

                    <Button variant="stroke" className="justify-center" onClick={onClose}>
                        {t('done')}
                    </Button>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}

export default LinkExplainer
