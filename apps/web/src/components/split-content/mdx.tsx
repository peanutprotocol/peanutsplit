import type { ReactNode } from 'react'
import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { localizedMdxComponents } from '@/components/marketing/mdx/components'
import { buttonClassName } from '@/components/ui/button-style'
import type { Locale } from '@/i18n/locales'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { remarkSplitMdxPolicy } from '@/lib/split-content/mdx-policy'

const COLUMN = 'mx-auto w-full max-w-xl px-5'

function checkedProductHref(href: string): string {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        throw new Error('Split content CTA href must be an absolute product URL')
    }
    if (url.origin !== CANONICAL_ORIGIN || url.pathname !== '/new' || url.username || url.password) {
        throw new Error('Split content CTA must point directly to the canonical /new')
    }
    return url.toString()
}

function ContentCTA({
    text,
    subtitle,
    href,
    variant,
}: {
    text: string
    subtitle?: string
    href: string
    variant?: string
}) {
    if (variant && variant !== 'card') throw new Error(`unsupported Split content CTA variant: ${variant}`)
    return (
        <section className={`${COLUMN} my-10`}>
            <div className="rounded-sm border border-n-1 bg-white p-5">
                {subtitle && <p className="text-sm leading-5 text-grey-1">{subtitle}</p>}
                <a
                    href={checkedProductHref(href)}
                    className={buttonClassName({ shadowSize: '4', className: 'mt-4 justify-center text-h6' })}
                >
                    {text}
                </a>
            </div>
        </section>
    )
}

export async function renderSplitGuideBody(
    body: string,
    { locale, guidePaths }: { locale: Locale; guidePaths: readonly string[] }
): Promise<ReactNode> {
    const { content } = await compileMDX({
        source: body,
        components: { ...localizedMdxComponents(locale), CTA: ContentCTA },
        options: {
            mdxOptions: {
                format: 'mdx',
                remarkPlugins: [remarkGfm, [remarkSplitMdxPolicy, { locale, guidePaths }]],
            },
        },
    })
    return content
}
