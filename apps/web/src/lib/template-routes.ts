import type { Metadata } from 'next'
import { pageMetadata, pageTitle } from '@/lib/seo'
import { TEMPLATES, TEMPLATES_PATH, templatePath } from '@/templates/registry'
import { TEMPLATES_HUB } from '@/templates/shared'
import type { RoomTemplate } from '@/templates/types'

/**
 * What `/t` and `/t/[template]` need for their heads. The mirror of `tool-routes.ts`, minus
 * everything about locale: templates are English, so no page here carries hreflang and there is
 * no prefixed twin to advertise.
 *
 * `type: 'website'` rather than `article` for the same reason a calculator is: a template has no
 * publication date, and an OG article timestamp on a page that is never published is metadata
 * nobody can keep true.
 */
const LOCALE = 'en' as const

export const templateStaticParams = () => TEMPLATES.map((template) => ({ template: template.slug }))

export const templateMetadata = (template: RoomTemplate): Metadata =>
    pageMetadata({
        title: pageTitle(template.meta.title),
        description: template.meta.description,
        path: templatePath(template),
        type: 'website',
        locale: LOCALE,
    })

export const templatesHubMetadata = (): Metadata =>
    pageMetadata({
        title: pageTitle(TEMPLATES_HUB.title),
        description: TEMPLATES_HUB.description,
        path: TEMPLATES_PATH,
        type: 'website',
        locale: LOCALE,
    })
