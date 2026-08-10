'use client'

import { useTranslations } from 'next-intl'

/**
 * The Safari taps that put Split on a home screen, plus the first launch that restores this room.
 *
 * Extracted from `InstallPrompt` because there are now two reasons to show it.
 * The second is notifications: iOS delivers no web push to a browser tab at all,
 * so "add it to your home screen" IS the instruction for turning them on, and
 * the copy for it already existed.
 */
export function IosInstallSteps() {
    const t = useTranslations('marketing.install')

    return (
        <ol className="flex flex-col gap-3">
            {/* Literal keys: four steps is not enough repetition to justify a
                computed path, which the i18n audit could only skip. */}
            {[t('ios.step1'), t('ios.step2'), t('ios.step3'), t('ios.step4')].map((step, index) => (
                <li key={step} className="flex items-start gap-3">
                    <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-1 font-display text-h8 leading-none"
                    >
                        {index + 1}
                    </span>
                    <span className="flex-1 text-sm leading-5">{step}</span>
                </li>
            ))}
        </ol>
    )
}
