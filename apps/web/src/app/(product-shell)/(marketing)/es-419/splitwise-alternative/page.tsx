import { SplitwiseAlternative, splitwiseAlternativeMetadata } from '@/components/marketing/SplitwiseAlternative'

const LOCALE = 'es-419' as const

export const metadata = splitwiseAlternativeMetadata(LOCALE)

export default function Page() {
    return <SplitwiseAlternative locale={LOCALE} />
}
