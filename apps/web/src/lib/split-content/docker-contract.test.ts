import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Split content container release contract', () => {
    it('carries the index flag as runtime env, not a build arg, and bakes no origin or secret', () => {
        const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8')

        expect(dockerfile).not.toMatch(/(?:ARG|ENV) (?:APP_ORIGIN|CONTENT_ORIGIN)=/)
        expect(dockerfile).not.toMatch(/(?:ARG|ENV) SPLIT_CONTENT_EDGE_MARKER=/)

        // Nobody here has Dokploy access, so the deployed image is where the released state lives.
        expect(dockerfile).toContain('ENV SEO_INDEXABLE=true')
        // A build ARG would inline it at build time and let a stale Dokploy build setting decide
        // what the running container claims. It is read per request.
        expect(dockerfile).not.toMatch(/ARG SEO_INDEXABLE/)
    })

    it('keeps local and CI config from claiming to be the indexed deployment', () => {
        const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8')
        const workflow = fs.readFileSync(path.join(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')

        expect(compose).not.toContain('SPLIT_CONTENT_EDGE_MARKER')
        expect(compose).toContain('SEO_INDEXABLE: ${SEO_INDEXABLE:-false}')
        expect(compose).toContain('SPLIT_FX_MODE: ${SPLIT_FX_MODE:-static}')
        expect(compose).toContain('SPLIT_FX_ENDPOINT: ${SPLIT_FX_ENDPOINT:-}')
        expect(workflow).toContain("SEO_INDEXABLE: 'false'")
        expect(workflow).toContain('--build-arg NEXT_PUBLIC_BASE_URL=https://peanutsplit.com')
        expect(workflow).not.toContain('--build-arg SEO_INDEXABLE')
        for (const name of ['APP_ORIGIN', 'CONTENT_ORIGIN']) {
            expect(compose, name).not.toContain(name)
            expect(workflow, name).not.toContain(name)
        }
    })
})
