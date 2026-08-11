'use client'

import { useTranslations } from 'next-intl'

/** One action per line, shown only on Split's canonical install surface. */
export function IosInstallSteps() {
    const t = useTranslations('marketing.install')

    return (
        <ol className="flex flex-col gap-3">
            {/* Literal keys: five steps are not enough repetition to justify a
                computed path, which the i18n audit could only skip. */}
            {[t('ios.step1'), t('ios.step2'), t('ios.step3'), t('ios.step4'), t('ios.step5')].map((step, index) => (
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
