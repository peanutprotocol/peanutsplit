import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (name: string): string => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8')

describe('canonical install-surface wiring', () => {
    it.each(['InstallPrompt', 'InstallRow', 'PushOptIn'])(
        'never treats reading or leaving install help as a refusal in %s',
        (component) => {
            const contents = source(component)

            expect(contents).not.toContain('snoozeAfterManualInstallInstructions')
            expect(contents).not.toContain('snoozeInstallFor')
        }
    )

    it.each(['InstallPrompt', 'InstallRow', 'PushOptIn'])(
        'routes manual installation away from a room document in %s',
        (component) => {
            expect(source(component)).toContain("openInstallSurface('")
        }
    )

    it('keeps the explicit automatic refusal as the only card backoff', () => {
        const contents = source('InstallPrompt')

        expect(contents).toContain("dismiss('not_now')")
        expect(contents).toContain('noteInstallDismissed()')
        expect(contents).not.toContain('<Drawer')
    })

    it('labels instruction-only actions separately from the native install action', () => {
        const contents = source('InstallPrompt')

        expect(contents).toContain("state === 'promptable' ? t('cta') : t('ctaSteps')")
    })

    it('rejects a prepared handoff response after the automatic card has been blocked', () => {
        const contents = source('InstallPrompt')

        expect(contents).toContain('visibleRef.current = false')
        expect(contents).toContain('if (shownContextRef.current !== shownAtStart || !visibleRef.current) {')
        expect(contents).toContain('void cancelPreparedInstallHandoff(prepared)')
    })
})
