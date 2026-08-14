import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getSplitGuide, guideAlternates } from '@/lib/split-content/artifact'

/**
 * The register-governor regression the S3 review found: `SplitGuideLayout` (and `ArticleLayout`)
 * used to wrap ANY page with a resolved chapter in `ChapterFrame`, never consulting
 * `pageRegisterOrNull` — so a flat-register page (e.g. `/splitwise-daily-limit`) got the exact
 * same chapter-ink numerals and ledger leader digits as a warm page, defeating the reason the
 * register exists (fun-engine.md Invariants #4).
 *
 * No real guide slug is flat-register today (`FLAT_REGISTER_SLUGS` covers one `alternatives/*`
 * slug, not a guide), so this stubs `pageChapterOrNull`/`pageRegisterOrNull` rather than relying
 * on real content — the point under test is the layout's own conditional, not the resolver table.
 */
const mocks = vi.hoisted(() => ({ register: 'default' as 'flat' | 'default' }))

vi.mock('@/lib/split-content/recipe', async () => {
    const actual = await vi.importActual<typeof import('@/lib/split-content/recipe')>('@/lib/split-content/recipe')
    return {
        ...actual,
        pageChapterOrNull: () => 'trips',
        pageRegisterOrNull: () => mocks.register,
    }
})

const { SplitGuideLayout } = await import('./GuideLayout')

const FIXTURE = path.join(process.cwd(), 'src/lib/split-content/__fixtures__/valid')

function renderGuide() {
    const guide = getSplitGuide('en', 'synthetic-guide', FIXTURE)
    if (!guide) throw new Error('fixture guide missing')
    return renderToStaticMarkup(
        <SplitGuideLayout guide={guide} alternates={guideAlternates('synthetic-guide', FIXTURE)}>
            <p>body</p>
        </SplitGuideLayout>
    )
}

describe('SplitGuideLayout register gate', () => {
    it('never emits data-chapter (no ChapterFrame) for a flat-register page, even though a chapter resolved', () => {
        mocks.register = 'flat'
        expect(renderGuide()).not.toContain('data-chapter=')
    })

    it('emits data-chapter (ChapterFrame present) for a default-register page with the same chapter', () => {
        mocks.register = 'default'
        expect(renderGuide()).toContain('data-chapter="trips"')
    })
})
