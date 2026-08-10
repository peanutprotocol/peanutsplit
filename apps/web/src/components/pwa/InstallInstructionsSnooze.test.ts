import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (name: string): string => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8')

describe('iOS install-instructions snooze wiring', () => {
    it.each([
        ['InstallPrompt', 'closeInstructions'],
        ['InstallRow', 'closeIosSteps'],
        ['PushOptIn', 'closeIosInstallSteps'],
    ])('snoozes the automatic prompt on both drawer dismissal and Done in %s', (component, closeHandler) => {
        const contents = source(component)

        expect(contents).toContain('snoozeAfterIosInstallInstructions()')
        expect(contents).toContain(`onOpenChange={(next) => !next && ${closeHandler}()}`)
        expect(contents).toContain(`onClick={${closeHandler}}`)
    })

    it('rejects a prepared handoff response after the automatic card has been blocked', () => {
        const contents = source('InstallPrompt')

        expect(contents).toContain('visibleRef.current = false')
        expect(contents).toContain('if (shownContextRef.current !== shownAtStart || !visibleRef.current) {')
        expect(contents).toContain('void cancelPreparedInstallHandoff(prepared)')
    })
})
