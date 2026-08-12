'use client'

import { useTranslations } from 'next-intl'

/** Short, platform-aware fallback from the canonical, slug-free `/app` document. */
export function BrowserInstallSteps({ android }: { android: boolean }) {
    const t = useTranslations('marketing.install')
    const steps = android
        ? [t('browser.step1Android'), t('browser.step2Android'), t('browser.step3Android'), t('browser.step4Android')]
        : [t('browser.step1Other'), t('browser.step2Other'), t('browser.step3Other')]

    return (
        <div className="grid gap-3">
            <p className="text-sm leading-5 text-grey-1">{t('browser.embedded')}</p>
            <ol className="flex flex-col gap-3" data-testid="browser-install-steps">
                {steps.map((step, index) => (
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
            <p className="text-sm leading-5 text-grey-1">{t('browser.noOption')}</p>
        </div>
    )
}
