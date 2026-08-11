import { ContentHub } from '@/components/marketing/ContentHub'
import { hubMetadata } from '@/lib/content-routes'

/**
 * The English guides hub. Both halves are shared — see ContentHub and
 * `hubMetadata`; this file only says which language it is.
 */
const LOCALE = 'en' as const

export const generateMetadata = hubMetadata(LOCALE)

export default function Page() {
    return <ContentHub locale={LOCALE} />
}
