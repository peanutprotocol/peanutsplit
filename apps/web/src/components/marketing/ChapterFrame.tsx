import type { CSSProperties, ReactNode } from 'react'
import { CHAPTER_TOKENS, ink28, type Chapter } from '@/lib/split-content/chapter-tokens'
import { skinVars, type Skin } from '@/lib/split-content/skin'

/**
 * The chapter's tokens, as CSS custom properties on one wrapper (fun-engine.md S3). A server
 * component on purpose: the whole point is that chapter ink reaches every descendant — the receipt
 * grammar's leader digits, tape strip and numerals (blocks.tsx, components.tsx, globals.css) — by
 * CSS inheritance from `data-chapter`, never by threading a `chapter` prop through four renderers.
 *
 * `data-skin` is the seam `data-chapter`'s docstring reserved, now used: every skin rule is scoped
 * `[data-skin='sticker']`, so the stylesheet is inert on a frame that emits `"none"`. It is emitted
 * ALWAYS, including for `'none'`, so the contact sheet and the DOM tests can read the value rather
 * than infer it from an absent attribute.
 *
 * The skin adds zero DOM nodes and zero text nodes: its wallpaper is a `background-image` data-URI
 * carried in `--skin-wall`, not markup.
 *
 * `SplitGuideLayout` (GuideLayout.tsx:106) resolves the skin exactly as `ArticleLayout` does, so
 * the generated guide corpus arrives here skinned. The `'none'` default stays for the call site
 * that resolved no skin at all — an unmapped fixture slug — rather than as a rollout gate.
 */
export function ChapterFrame({
    chapter,
    skin = 'none',
    seed = 0,
    children,
}: {
    chapter: Chapter
    skin?: Skin
    seed?: number
    children: ReactNode
}) {
    const tokens = CHAPTER_TOKENS[chapter]
    const style = {
        '--chapter-wash': tokens.wash,
        '--chapter-ink': tokens.ink,
        '--chapter-hairline': tokens.hairline,
        '--chapter-ink-28': ink28(chapter),
        ...skinVars(skin, seed, chapter),
    } as CSSProperties

    return (
        <div data-chapter={chapter} data-skin={skin} style={style}>
            {children}
        </div>
    )
}

export default ChapterFrame
