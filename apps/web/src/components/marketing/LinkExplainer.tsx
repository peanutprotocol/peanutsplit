'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { DrawerBody } from '@/components/ui/DrawerLayout'
import { Icon } from '@/components/ui/Icon'
import { useMotionAllowed } from '@/lib/use-motion'
import { riseSoftVariants, sceneVariants } from './motion'

/**
 * What the room link actually is, on demand.
 *
 * Three independent first-time readers of the hero each stopped at the same line — "only
 * people with this link can open it" — and each said it was the biggest unanswered thing on
 * the page. It is the product's entire access model in eight words of grey text, under a URL,
 * on a page about money between friends.
 *
 * A sheet rather than more hero copy: the doubt arrives at a specific moment (looking at the
 * URL), and four self-contained answers are too much for the fold but useful on demand.
 */
export function LinkExplainer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useTranslations('marketing.linkExplainer')
    const motionAllowed = useMotionAllowed()
    const points = ['access', 'chat', 'remembered', 'money'] as const

    return (
        <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
            <DrawerContent className="bg-background">
                <DrawerHeader className="pb-0">
                    <DrawerTitle className="text-h5">{t('title')}</DrawerTitle>
                </DrawerHeader>

                <DrawerBody className="gap-4">
                    {/* Four answers to one question read as a list to work through when they
                        arrive together; a beat apart, they read as four short answers. This
                        sheet is mounted on open, well after hydration, so motion/react is the
                        right tool here in a way it is not for the server-rendered fold. */}
                    <motion.ul
                        className="flex flex-col gap-3"
                        variants={sceneVariants}
                        initial={motionAllowed ? 'hidden' : false}
                        animate="shown"
                        data-motion-surface
                    >
                        {points.map((point) => (
                            <motion.li
                                key={point}
                                variants={riseSoftVariants}
                                data-motion-surface
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
                                </span>
                            </motion.li>
                        ))}
                    </motion.ul>

                    <Button variant="stroke" className="justify-center" onClick={onClose}>
                        {t('done')}
                    </Button>
                </DrawerBody>
            </DrawerContent>
        </Drawer>
    )
}

export default LinkExplainer
