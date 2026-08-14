import type { CSSProperties, ReactNode } from 'react'
import { CHAPTER_TOKENS, ink28, type Chapter } from '@/lib/split-content/chapter-tokens'

/**
 * The chapter's tokens, as CSS custom properties on one wrapper (fun-engine.md S3). A server
 * component on purpose: the whole point is that chapter ink reaches every descendant — the receipt
 * grammar's leader digits, tape strip and numerals (blocks.tsx, components.tsx, globals.css) — by
 * CSS inheritance from `data-chapter`, never by threading a `chapter` prop through four renderers.
 * `data-chapter` itself is unused by any selector today; it documents which chapter is live and
 * gives a future rule a scope to key off without adding another wrapper.
 */
export function ChapterFrame({ chapter, children }: { chapter: Chapter; children: ReactNode }) {
    const tokens = CHAPTER_TOKENS[chapter]
    const style = {
        '--chapter-wash': tokens.wash,
        '--chapter-ink': tokens.ink,
        '--chapter-hairline': tokens.hairline,
        '--chapter-ink-28': ink28(chapter),
    } as CSSProperties

    return (
        <div data-chapter={chapter} style={style}>
            {children}
        </div>
    )
}

export default ChapterFrame
