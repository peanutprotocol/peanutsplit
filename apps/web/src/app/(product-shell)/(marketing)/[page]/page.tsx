import type { Metadata } from 'next'
import { articleMetadata, articlePage, articleStaticParams } from '@/lib/content-routes'
import { ROOT_COLLECTIONS } from '@/lib/content'
import { toolMetadata, toolStaticParams } from '@/lib/tool-routes'
import { ToolPage } from '@/components/tools/ToolPage'
import { getTool } from '@/tools/registry'
import { mileageCountryLinks } from '@/tools/mileage-split-calculator.countries'

/**
 * English pages served from a root-level slug — comparison pages, intent-capture pages and the
 * calculators, because that is the shape of the query ("tricount alternative", "split a bill
 * without an app", "bill split calculator") and a folder in front of it would bury the head term.
 *
 * One dynamic segment serves all three: Next allows a single dynamic name at a path position, so
 * `[page]` resolves the slug across `ROOT_COLLECTIONS` and the tool registry rather than being told
 * which one to read. Safe beside the static segments — Next matches `blog`, `new`, `api` and
 * friends first, and `dynamicParams = false` pins the rest to what is registered.
 *
 * **Tools are asked first, and that ordering is enforced rather than relied on.** `static-pages.ts`
 * reserves every tool slug, so a markdown file that took one would be hidden from the loader, the
 * hub and the sitemap the same way a file called `new.md` is — and `content.test.ts` fails on the
 * collision instead of letting the first match quietly win.
 *
 * The alternative was a second route folder per tool, which would have kept this file at four
 * lines and cost a directory, a metadata export and an OG route every time a calculator ships.
 * Adding a tool is adding one config file, and this is where that promise is paid for.
 */
const LOCALE = 'en' as const

const toolParams = toolStaticParams('page', LOCALE)
const articleParams = articleStaticParams(ROOT_COLLECTIONS, LOCALE, 'page')
const articleMeta = articleMetadata(ROOT_COLLECTIONS, LOCALE, 'page')
const ArticleRoute = articlePage(ROOT_COLLECTIONS, LOCALE, 'page')

interface PageParams {
    params: Promise<Record<string, string>>
}

export const dynamicParams = false

export function generateStaticParams() {
    return [...toolParams(), ...articleParams()]
}

export async function generateMetadata(props: PageParams): Promise<Metadata> {
    const tool = getTool((await props.params).page, LOCALE)
    return tool ? toolMetadata(tool, LOCALE) : articleMeta(props)
}

export default async function RootSlugPage(props: PageParams) {
    const tool = getTool((await props.params).page, LOCALE)
    // The calculator with a country family lists it; every other tool is handed undefined.
    return tool ? (
        <ToolPage tool={tool} locale={LOCALE} rates={mileageCountryLinks(tool.slug, LOCALE)} />
    ) : (
        ArticleRoute(props)
    )
}
