import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Split content container release contract', () => {
    it('bakes no URL origin, no secret, and no inaccessible index env into the image', () => {
        const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8')

        expect(dockerfile).not.toMatch(/(?:ARG|ENV) (?:APP_ORIGIN|CONTENT_ORIGIN)=/)
        expect(dockerfile).not.toMatch(/(?:ARG|ENV) (?:SEO_INDEXABLE|SPLIT_CONTENT_EDGE_MARKER)=/)
    })

    it('keeps the source gate dark and local/CI config unable to open indexing or move the origin', () => {
        const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8')
        const workflow = fs.readFileSync(path.join(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
        const indexRelease = fs.readFileSync(path.join(process.cwd(), 'src/lib/split-content/index-release.ts'), 'utf8')

        expect(indexRelease).toContain('SPLIT_CONTENT_INDEX_RELEASED = false')
        expect(indexRelease).toContain('SPLIT_CONTENT_INDEX_RELEASED_PATHS = []')
        expect(compose).not.toContain('SPLIT_CONTENT_EDGE_MARKER')
        expect(compose).not.toContain('SEO_INDEXABLE')
        expect(workflow).toContain("SEO_INDEXABLE: 'false'")
        expect(workflow).toContain('--build-arg NEXT_PUBLIC_BASE_URL=https://peanutsplit.com')
        expect(workflow).not.toContain('--build-arg SEO_INDEXABLE')
        for (const name of ['APP_ORIGIN', 'CONTENT_ORIGIN']) {
            expect(compose, name).not.toContain(name)
            expect(workflow, name).not.toContain(name)
        }
    })
})
