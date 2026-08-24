import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TemplatePage } from '@/components/templates/TemplatePage'
import { templateMetadata, templateStaticParams } from '@/lib/template-routes'
import { readUtm, type Query } from '@/lib/utm'
import { getTemplate } from '@/templates/registry'

/**
 * One template room, at the URL that gets pasted into somebody else's community.
 *
 * `/t` rather than a root-level slug: these are a product surface with a fixed shape, and a short
 * shared segment keeps the six of them out of `[page]`, which already resolves a slug across two
 * content collections and the tool registry.
 *
 * The query string is read for one reason — the campaign the reader arrived on, forwarded to the
 * CTA so the room they open belongs to the post that sent them. Nothing else on the page varies
 * with it, and `readUtm` narrows every value before it reaches an href.
 */
export const dynamicParams = false

export const generateStaticParams = templateStaticParams

interface PageProps {
    params: Promise<{ template: string }>
    searchParams: Promise<Query>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const template = getTemplate((await params).template)
    return template ? templateMetadata(template) : {}
}

export default async function RoomTemplateRoute({ params, searchParams }: PageProps) {
    const template = getTemplate((await params).template)
    if (!template) notFound()
    return <TemplatePage template={template} utm={readUtm(await searchParams)} />
}
