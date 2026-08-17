import type { CSSProperties, ReactNode } from 'react'
import type { Chapter } from '@/lib/split-content/chapter-tokens'
import { skinVars, type Skin } from '@/lib/split-content/skin'

/**
 * The chapter-less half of `ChapterFrame` (fun-engine.md Wave 2 / S3): a skin painted onto one
 * wrapper for a surface that has no chapter to carry — today, a tool page.
 *
 * A second component rather than `ChapterFrame({ chapter?: … })` on purpose. `ChapterFrame`'s
 * identity IS the chapter; a tool page has a skin and genuinely no chapter, so making `chapter`
 * optional there would let a content page ship unframed by accident and lose its ink.
 *
 * `chapter` is still taken here, because the wallpaper draws its motifs from a chapter's doodle
 * pool — see `toolWallpaperChapter`. It is a pool choice, not a chapter: nothing is emitted for it,
 * no `data-chapter`, no `--chapter-*` var, and nothing downstream can read it.
 *
 * Like `ChapterFrame` it emits `data-skin` always, including `"none"`, and adds zero text nodes:
 * the wallpaper is a `background-image` data-URI carried in `--skin-wall`, not markup.
 *
 * Imported from `src/components/tools/**`, which `js-budget.test.ts`'s `EXCLUDED_PREFIXES` already
 * stops the walk at — so this marketing-directory component is reachable only through an excluded
 * file and the content JS budget does not move.
 */
export function SkinFrame({
    skin,
    seed,
    chapter,
    className,
    children,
}: {
    skin: Skin
    seed: number
    chapter: Chapter
    className?: string
    children: ReactNode
}) {
    return (
        <div data-skin={skin} className={className} style={skinVars(skin, seed, chapter) as CSSProperties}>
            {children}
        </div>
    )
}

export default SkinFrame
