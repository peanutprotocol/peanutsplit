'use client'

import { useTranslations } from 'next-intl'

/** Safe fallback from the canonical, slug-free `/app` document. */
export function BrowserInstallSteps() {
    const t = useTranslations('marketing.install')

    return (
        <ol className="flex flex-col gap-3" data-testid="browser-install-steps">
            {[t('browser.step1'), t('browser.step2'), t('browser.step3'), t('browser.step4')].map((step, index) => (
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
