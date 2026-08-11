import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = (name: string): string => readFileSync(new URL(`./${name}.tsx`, import.meta.url), 'utf8')
const appPage = (): string => readFileSync(new URL('../../app/app/page.tsx', import.meta.url), 'utf8')

describe('legacy room-shortcut repair wiring', () => {
    it('writes canonical launch evidence in a child layout effect before the provider passive effect', () => {
        const marker = component('CanonicalAppLaunchMarker')

        expect(marker).toContain('useLayoutEffect')
        expect(marker).toContain('recordCanonicalStandaloneLaunch()')
        expect(appPage()).toContain('!repairing && <CanonicalAppLaunchMarker />')
    })

    it('keeps the automatic repair notice conditional, independently dismissible, and actionable', () => {
        const prompt = component('InstallPrompt')

        expect(prompt).toContain("state === 'repair' ? (isIOSHere() ? 'ios_steps' : 'browser_steps')")
        expect(prompt).toContain('repairExposure ? isInstallRepairNoticeDismissed() : isInstallSnoozed()')
        expect(prompt).toContain("t('repair.cardBody')")
        expect(prompt).toContain("t('repair.cta')")
        expect(prompt).toContain("openInstallRepairSurface('auto')")
    })

    it('keeps both suspected and confirmed standalone Device rows openable', () => {
        const row = component('InstallRow')

        expect(row).toContain("state === 'installed' || state === 'repair'")
        expect(row).toContain("openInstallRepairSurface('settings')")
        expect(row).toContain("t('row.checkAction')")
    })

    it('acknowledges the repair page, offers a local room copy, and provides an in-app escape', () => {
        const surface = component('InstallAppSurface')

        expect(surface).toContain('dismissInstallRepairNotice()')
        expect(surface).toContain('readInstallRepairRoomUrl()')
        expect(surface).toContain('install-repair-copy-room')
        expect(surface).toContain('install-repair-back')
        expect(surface).toContain('if (repair) return')
    })
})
