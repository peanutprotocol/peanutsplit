import type { Metadata } from 'next'
import { TemplatesHub } from '@/components/templates/TemplatesHub'
import { templatesHubMetadata } from '@/lib/template-routes'

export const metadata: Metadata = templatesHubMetadata()

export default function TemplatesHubRoute() {
    return <TemplatesHub />
}
