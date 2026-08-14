import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The register-governor regression the S3 review found: `ArticleLayout` used to wrap ANY page
 * with a resolved chapter in `ChapterFrame`, never consulting `pageRegisterOrNull` — so a
 * flat-register page (e.g. `/splitwise-daily-limit`) got the exact same chapter-ink numerals and
 * ledger leader digits as a warm page, defeating the reason the register exists (fun-engine.md
 * Invariants #4). `GuideLayout.test.tsx` proves the identical conditional by rendering
 * `SplitGuideLayout` with a mocked register; the same approach does not work here because
 * `ArticleLayout` is an async Server Component that itself renders `LanguageLinks`, also async —
 * `react-dom/server`'s synchronous renderer (this repo's only renderer in `node` tests) cannot
 * await a NESTED async component, only the one a test manually awaits at the top. So this reads
 * the source directly, the same idiom `route.test.tsx`'s route-adapter check and
 * `next-config.test.ts` already use for wiring `node`-environment vitest cannot execute.
 */
describe('ArticleLayout register gate', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/components/marketing/ArticleLayout.tsx'), 'utf8')

    it('resolves the register alongside the chapter', () => {
        expect(source).toContain('pageChapterOrNull, pageRegisterOrNull')
        expect(source).toContain(
            'const register = pageRegisterOrNull(doc.collection, doc.slug, frontmatter.tags ?? [], doc.locale)'
        )
    })

    it('only wraps ChapterFrame when the register is not flat', () => {
        expect(source).toContain("{chapter && register !== 'flat' ? (")
    })
})
