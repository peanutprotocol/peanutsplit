import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SplitGuideLayout } from '@/components/split-content/GuideLayout'
import { renderSplitGuideBody } from '@/components/split-content/mdx'
import type { Locale } from '@/i18n/locales'
import { getSplitGuide, guideAlternates, listSplitGuides, splitGuidePaths } from './artifact'
import { splitGuideMetadata } from './metadata'

interface GuideRouteProps {
    params: Promise<{ slug: string }>
}

export function splitGuideStaticParams(locale: Locale, root?: string): Array<{ slug: string }> {
    return listSplitGuides(locale, root).map((guide) => ({ slug: guide.slug }))
}

export async function splitGuideMetadataFor(
    locale: Locale,
    slug: string,
    root?: string,
    indexable?: boolean
): Promise<Metadata> {
    const guide = getSplitGuide(locale, slug, root)
    if (!guide) return {}
    return splitGuideMetadata(guide, guideAlternates(slug, root), indexable)
}

export function splitGuideRoute(locale: Locale) {
    return async function SplitGuidePage({ params }: GuideRouteProps) {
        const { slug } = await params
        const guide = getSplitGuide(locale, slug)
        if (!guide) notFound()
        const body = await renderSplitGuideBody(guide.body, {
            locale: guide.locale,
            guidePaths: splitGuidePaths(),
        })
        return <SplitGuideLayout guide={guide}>{body}</SplitGuideLayout>
    }
}

export function splitGuideRouteMetadata(locale: Locale) {
    return async function generateMetadata({ params }: GuideRouteProps): Promise<Metadata> {
        return splitGuideMetadataFor(locale, (await params).slug)
    }
}

export function splitGuideRouteStaticParams(locale: Locale) {
    return function generateStaticParams() {
        return splitGuideStaticParams(locale)
    }
}
