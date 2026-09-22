'use client'

import { useTranslations } from 'next-intl'
import { InstallStepVisual } from './InstallStepVisual'

/** Short, platform-aware fallback from the canonical, slug-free `/app` document. */
export function BrowserInstallSteps({ android }: { android: boolean }) {
    const t = useTranslations('marketing.install')
    const steps = android
        ? [
              { text: t('browser.step1Android'), visual: <InstallStepVisual icons={['more-vertical']} /> },
              { text: t('browser.step2Android'), visual: <InstallStepVisual icons={['add-home']} /> },
              {
                  text: t('browser.step3Android'),
                  visual: <InstallStepVisual icons={['install']} label={t('browser.install')} />,
              },
              { text: t('browser.step4Android'), visual: <InstallStepVisual label={t('browser.install')} /> },
          ]
        : [
              { text: t('browser.step1Other'), visual: <InstallStepVisual icons={['more-vertical']} /> },
              { text: t('browser.step2Other'), visual: <InstallStepVisual icons={['install']} /> },
              { text: t('browser.step3Other'), visual: <InstallStepVisual label="Split" /> },
          ]

    return (
        <div className="grid gap-3">
            <p className="text-sm leading-5 text-grey-1">{t('browser.embedded')}</p>
            <ol className="flex flex-col gap-3" data-testid="browser-install-steps">
                {steps.map((step, index) => (
                    <li key={step.text} className="flex items-start gap-3">
                        <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-n-1 bg-primary-1 font-display text-h8 leading-none"
                        >
                            {index + 1}
                        </span>
                        <div className="min-w-0 flex-1 text-sm leading-5">
                            <p>{step.text}</p>
                            {step.visual}
                        </div>
                    </li>
                ))}
            </ol>
            <p className="text-sm leading-5 text-grey-1">{t('browser.noOption')}</p>
        </div>
    )
}
