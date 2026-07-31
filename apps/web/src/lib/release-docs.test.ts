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
        // Read the row by its cells, not by its whitespace. Prettier pads the
        // markdown table to align the pipes, so an exact "| a | b |" match makes
        // the format gate and this test contradict each other over spacing that
        // carries no meaning. The claim under test is the STATE of the push row.
        const pushRow = releaseStates
            .split('\n')
            .map((line) => line.split('|').map((cell) => cell.trim()))
            .find((cells) => cells[1] === 'Push notifications')
        expect(pushRow?.[2]).toBe('user-visible')
        expect(releaseStates).toContain('has **not** been recorded')
    })
})
