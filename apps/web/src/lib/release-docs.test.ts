import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), '../..', path), 'utf8')

describe('release documentation', () => {
    it('uses only the explicit capability-state vocabulary', () => {
        const releaseStates = repoFile('docs/release-states.md')
        const allowed = new Set([
            'planned',
            'in progress',
            'code-complete',
            'deployed dark',
            'user-visible',
            'production-verified',
            'held',
            'retired',
        ])
        const rows = releaseStates
            .split('\n')
            .filter((line) => line.startsWith('| ') && !line.startsWith('| Capability') && !line.startsWith('| ---'))

        expect(rows.length).toBeGreaterThan(0)
        for (const line of rows) {
            const state = line.split('|')[2]?.trim()
            expect(allowed, `unexpected release state in: ${line}`).toContain(state)
        }
    })

    it('marks imperative build documents as historical and keeps push verification honest', () => {
        expect(repoFile('apps/web/docs/SPEC.md')).toContain('HISTORICAL BUILD SPEC')
        expect(repoFile('changelog-july-25.md')).toContain('HISTORICAL DELIVERY RECORD')

        const releaseStates = repoFile('docs/release-states.md')
        expect(releaseStates).toContain('| Push notifications | user-visible |')
        expect(releaseStates).toContain('has **not** been recorded')
    })
})
