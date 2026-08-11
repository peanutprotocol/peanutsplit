import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Split content container release contract', () => {
    it('pins separate URL origins without baking a secret or inaccessible index env into the image', () => {
        const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8')

        expect(dockerfile.match(/ARG APP_ORIGIN=https:\/\/split\.peanut\.me/g)).toHaveLength(2)
        expect(dockerfile.match(/ARG CONTENT_ORIGIN=https:\/\/peanut\.me/g)).toHaveLength(2)
        expect(dockerfile).not.toMatch(/(?:ARG|ENV) (?:SEO_INDEXABLE|SPLIT_CONTENT_EDGE_MARKER)=/)
    })

    it('keeps the source gates dark and local/CI config unable to smuggle the raw marker into origin', () => {
        const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8')
        const workflow = fs.readFileSync(path.join(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
        const indexRelease = fs.readFileSync(path.join(process.cwd(), 'src/lib/split-content/index-release.ts'), 'utf8')
        const markerRelease = fs.readFileSync(
            path.join(process.cwd(), 'src/lib/split-content/marker-release.ts'),
            'utf8'
        )

        expect(indexRelease).toContain('SPLIT_CONTENT_INDEX_RELEASED = false')
        expect(markerRelease).toContain("SPLIT_EDGE_MARKER_SHA256 = '0'.repeat(64)")
        expect(compose).not.toContain('SPLIT_CONTENT_EDGE_MARKER')
        expect(compose).not.toContain('SEO_INDEXABLE')
        expect(workflow).toContain("SEO_INDEXABLE: 'false'")
        expect(workflow).toContain('--build-arg NEXT_PUBLIC_BASE_URL=https://split.peanut.me')
        expect(workflow).not.toContain('--build-arg SEO_INDEXABLE')
    })
})
