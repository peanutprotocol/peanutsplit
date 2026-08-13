import { describe, expect, it } from 'vitest'
import enMessages from '@/i18n/messages/en.json'
import esMessages from '@/i18n/messages/es-419.json'
import ptBrMessages from '@/i18n/messages/pt-br.json'
import { LOCALES, type Locale } from '@/i18n/locales'
import { CANONICAL_ORIGIN } from '@/lib/domains'
import { ORGANIZATION_ID } from '@/lib/seo'
import { getSplitGuide } from './artifact'
import { splitGuideCrumbs, splitGuideSchemas } from './metadata'

/**
 * The guide trail is hardcoded because the layout must stay synchronous. That is only safe while
 * the hardcoded labels are the ones `/blog` renders — otherwise the same trail reads two ways on
 * two pages of the same site, and nothing would catch it.
 */
const CATALOGS: Record<Locale, { content: { home: string; guides: string } }> = {
    en: enMessages,
    'es-419': esMessages,
    'pt-br': ptBrMessages,
}

// Every locale ships this slug, so one guide covers all three trails.
const SLUG = 'ask-a-friend-to-pay-you-back'

describe('Split guide breadcrumbs', () => {
    it.each(LOCALES)('speaks %s in the same words the hub does', (locale) => {
        const guide = getSplitGuide(locale, SLUG)
        expect(guide, locale).not.toBeNull()
        const crumbs = splitGuideCrumbs(guide!)

        expect(crumbs.map((crumb) => crumb.name)).toEqual([
            CATALOGS[locale].content.home,
            CATALOGS[locale].content.guides,
            guide!.title,
        ])
        expect(crumbs.map((crumb) => crumb.href)).toEqual([
            '/',
            locale === 'en' ? '/blog' : `/${locale}/blog`,
            guide!.href,
        ])
    })

    it('feeds the JSON-LD the same three levels, ending at the guide', () => {
        const guide = getSplitGuide('pt-br', SLUG)!
        const { breadcrumbs } = splitGuideSchemas(guide)

        expect(breadcrumbs.itemListElement).toEqual([
            { '@type': 'ListItem', position: 1, name: 'Início', item: CANONICAL_ORIGIN },
            { '@type': 'ListItem', position: 2, name: 'Guias', item: `${CANONICAL_ORIGIN}/pt-br/blog` },
            { '@type': 'ListItem', position: 3, name: guide.title, item: `${CANONICAL_ORIGIN}${guide.href}` },
        ])
    })
})

describe('Split guide article schema', () => {
    it('names the site organization once, for both author and publisher', () => {
        const { article } = splitGuideSchemas(getSplitGuide('en', SLUG)!)

        expect(article.author).toMatchObject({ '@id': ORGANIZATION_ID, name: 'Peanut Split' })
        expect(article.publisher).toMatchObject({ '@id': ORGANIZATION_ID, name: 'Peanut Split' })
        expect(article.image).toBe(`${CANONICAL_ORIGIN}/icons/icon-512.png`)
        expect(article.dateModified).toBe(article.datePublished)
    })
})
