import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (name: string): string => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8')

describe('manual install-instructions snooze wiring', () => {
    it.each([
        ['InstallPrompt', 'closeInstructions'],
        ['InstallRow', 'closeIosSteps'],
        ['PushOptIn', 'closeIosInstallSteps'],
    ])('snoozes the automatic prompt on both drawer dismissal and Done in %s', (component, closeHandler) => {
        const contents = source(component)

        expect(contents).toContain('snoozeAfterManualInstallInstructions()')
        expect(contents).toContain(`onOpenChange={(next) => !next && ${closeHandler}()}`)
        expect(contents).toContain(`onClick={${closeHandler}}`)
    })

    it('also snoozes after the generic browser-menu instructions close', () => {
        const contents = source('InstallRow')

        expect(contents).toContain('const closeBrowserSteps = () => {')
        expect(contents).toContain('snoozeAfterManualInstallInstructions()')
        expect(contents).toContain('onOpenChange={(next) => !next && closeBrowserSteps()}')
        expect(contents).toContain('onClick={closeBrowserSteps}')
    })

    it('rejects a prepared handoff response after the automatic card has been blocked', () => {
        const contents = source('InstallPrompt')

        expect(contents).toContain('visibleRef.current = false')
        expect(contents).toContain('if (shownContextRef.current !== shownAtStart || !visibleRef.current) {')
        expect(contents).toContain('void cancelPreparedInstallHandoff(prepared)')
    })
})
