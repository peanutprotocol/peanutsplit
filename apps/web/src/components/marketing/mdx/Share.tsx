import { buttonClassName } from '@/components/ui/button-style'
import { absoluteUrl } from '@/lib/seo'
import type { ContentRenderContext } from './blocks'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

/**
 * The share URL for one article: its own canonical, campaign-coded (SEO loop B).
 *
 * The canonical is not rebuilt here — `context.canonical` is the same `frontmatter.canonical ??
 * doc.href` that `articleMetadata`, `articleSchema` and `ArticleLayout` already resolve, and
 * `absoluteUrl` is the one function that turns such a path into an absolute URL. A second spelling
 * of either would be a URL that quietly disagrees with the `<link rel="canonical">` on the same
 * page, which is the specific way a share loop starts splitting its own signal.
 *
 * Slug-keyed, never locale-keyed: the three translations of an article share one campaign.
 */
function shareUrl(context: ContentRenderContext): string {
    return `${absoluteUrl(context.canonical)}?campaign=share-${context.slug}`
}

/**
 * "Send this to the group chat" — the block that hands a reader the article's own link (SEO loop B).
 *
 * A pure Server Component in `Script.tsx`'s mould, and native-only like it: absent from
 * mdx-policy.ts's COMPONENT_ATTRIBUTES, so a generated guide cannot author one
 * (`mdx-policy.test.tsx` proves it). Every word on screen arrives as an authored prop — `title`,
 * `body`, `buttonLabel` and the `doneLabel` the enhancer swaps in on a successful copy — so the
 * visual layer emits no text nodes of its own, the same gate `Calc.test.tsx` holds mechanically.
 *
 * The whole block is server HTML at the size the enhanced state uses, carrying `data-share-*`
 * attributes; `lib/share-enhancer-dom.ts` only ever attaches a listener once `ContentAnalytics`
 * mounts. `doneLabel` rides in as an attribute rather than a second DOM node because the enhancer
 * runs in plain DOM with no props of its own, and the alternative — the enhancer authoring
 * "Copied" — is exactly the words-from-the-engine rule this stage exists to hold.
 *
 * `context` is not MDX-authored: it is bound by closure in `localizedMdxComponents`, the way
 * `<ShortVersionSlot>`'s `faq` is. Without it (a guide, a fixture, a compile with no context) the
 * block renders nothing rather than throwing — a decoration must never take a page down.
 */
export function Share({
    title,
    body,
    buttonLabel,
    doneLabel,
    context,
}: {
    title: string
    body?: string
    buttonLabel: string
    doneLabel: string
    /** Not MDX-authored — bound in `localizedMdxComponents`. */
    context?: ContentRenderContext
}) {
    if (!context || !title || !buttonLabel || !doneLabel) return null

    return (
        <section className={`${COLUMN} my-10`}>
            <div
                className="split-share-card rounded-sm border border-n-1 bg-white p-5"
                data-share-block
                data-share-url={shareUrl(context)}
                data-share-done={doneLabel}
            >
                <h2 className="split-block-title text-h5">{title}</h2>
                {body && <p className="mt-2 text-sm leading-5 text-grey-1">{body}</p>}
                <button
                    type="button"
                    data-share-button
                    // `split-btn` rather than a hook of its own: the sticker skin's yellow pill is
                    // already keyed off that class (globals.css), and a share button that had to be
                    // repainted separately would drift from the CTA sitting two blocks above it.
                    className={buttonClassName({ shadowSize: '4', className: 'split-btn mt-4 justify-center text-h6' })}
                >
                    {buttonLabel}
                </button>
            </div>
        </section>
    )
}
