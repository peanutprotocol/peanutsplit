import { SplitwiseAlternative, splitwiseAlternativeMetadata } from '@/components/marketing/SplitwiseAlternative'

const LOCALE = 'pt-br' as const

export const metadata = splitwiseAlternativeMetadata(LOCALE)

export default function Page() {
    return <SplitwiseAlternative locale={LOCALE} />
}
