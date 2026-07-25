'use client'

import Image from 'next/image'
import { motion } from 'motion/react'
import { peanutCheering } from '@/assets/mascot'

/**
 * Signature moment #6. Deliberately screenshot-worthy — this is the state people
 * send back into the group chat. The polish wave upgrades this with confetti and
 * the handbell sound; the composition and copy are the hooks it builds on.
 */
export function AllSettled({ compact = false }: { compact?: boolean }) {
    return (
        <motion.div
            data-testid="all-settled"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 18 }}
            className="shadow-4 mx-4 flex flex-col items-center gap-3 rounded-sm border border-n-1 bg-green-1 px-6 py-6 text-center"
        >
            <Image
                src={peanutCheering}
                alt=""
                unoptimized
                className={compact ? 'h-24 w-24 object-contain' : 'h-32 w-32 object-contain'}
            />
            <p className="text-h5">All settled up 🎉</p>
            <p className="max-w-[20rem] text-sm text-n-1">Nobody owes anybody anything. Enjoy the rare feeling.</p>
        </motion.div>
    )
}
