import { brandCardResponse, ogImageExports } from '@/lib/content-og'
import { TEMPLATES_HUB } from '@/templates/shared'

export const runtime = 'nodejs'

export const alt = TEMPLATES_HUB.title
export const { size, contentType } = ogImageExports

export default async function TemplatesHubOgImage() {
    return brandCardResponse(['SPLIT', 'IT'], TEMPLATES_HUB.description)
}
