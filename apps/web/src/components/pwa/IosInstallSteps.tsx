'use client'

import { useTranslations } from 'next-intl'
import { InstallStepVisual } from './InstallStepVisual'

/** One action per line, shown only on Split's canonical install surface. */
export function IosInstallSteps() {
    const t = useTranslations('marketing.install')
    const steps = [
        { text: t('ios.step1'), visual: <InstallStepVisual icons={['more', 'share']} /> },
        { text: t('ios.step2'), visual: <InstallStepVisual icons={['add-home']} /> },
        {
            text: t('ios.step3'),
            visual: (
                <InstallStepVisual>
                    <span className="flex h-6 w-10 items-center justify-end rounded-full bg-[#34c759] p-0.5">
                        <span className="size-5 rounded-full bg-white shadow-sm" />
                    </span>
                </InstallStepVisual>
            ),
        },
        { text: t('ios.step4'), visual: <InstallStepVisual label={t('ios.add')} /> },
    ]

    return (
        <ol className="flex flex-col gap-3" data-testid="ios-install-steps">
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
    )
}
