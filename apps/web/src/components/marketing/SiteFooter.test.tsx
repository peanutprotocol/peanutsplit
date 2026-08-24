import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteFooter } from './SiteFooter'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/ui/LocaleSwitcher', () => ({
    LocaleSwitcher: () => null,
}))

const prior = process.env.NEXT_PUBLIC_FOSS_RELEASED

afterEach(() => {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_FOSS_RELEASED
    else process.env.NEXT_PUBLIC_FOSS_RELEASED = prior
})

describe('SiteFooter source receipt', () => {
    it('stays absent until the public-source release', () => {
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        expect(renderToStaticMarkup(<SiteFooter showLocaleSwitcher={false} />)).not.toContain('href="/source"')
    })

    it('adds one internal receipt without restoring a Peanut promotion column', () => {
        process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
        const html = renderToStaticMarkup(<SiteFooter showLocaleSwitcher={false} />)

        expect(html.match(/href="\/source"/g)).toHaveLength(1)
        expect(html).not.toContain('peanut.me')
        expect(html).not.toContain('utm_')
    })
})
