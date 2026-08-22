import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToolCountry, toolCountryMetadata, toolCountryParams } from '@/lib/tool-routes'
import { ToolPage } from '@/components/tools/ToolPage'

/**
 * One page per official mileage rate — `/mileage-split-calculator/uk`.
 *
 * Nested under the root slug rather than beside it, because the first segment is the calculator's
 * own: a country page cannot exist without the tool it is a view of, and the URL says so.
 * `dynamicParams = false` pins the pair to the countries that have a rate, which is what 404s
 * `/mileage-split-calculator/narnia` and `/rent-split-calculator/uk` alike — no runtime check to
 * keep in step with the data.
 */
const LOCALE = 'en' as const

interface PageParams {
    params: Promise<Record<string, string>>
}

export const dynamicParams = false

export const generateStaticParams = toolCountryParams('page', 'country')

export async function generateMetadata(props: PageParams): Promise<Metadata> {
    const { page, country } = await props.params
    const found = getToolCountry(page, country)
    if (!found) notFound()
    return toolCountryMetadata(found)
}

export default async function ToolCountryRoute(props: PageParams) {
    const { page, country } = await props.params
    const found = getToolCountry(page, country)
    if (!found) notFound()
    return <ToolPage tool={found.tool} locale={LOCALE} variant={{ path: found.path, start: found.start }} />
}
