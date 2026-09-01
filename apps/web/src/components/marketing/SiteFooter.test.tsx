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
        // One, not two: privacy is Split's own page now, so Terms is the last peanut.me link here.
        expect(html.match(/peanut\.me/g)).toHaveLength(1)
        expect(html).not.toContain('utm_')
    })

    it('keeps the Terms and Privacy notices with or without the release', () => {
        delete process.env.NEXT_PUBLIC_FOSS_RELEASED
        const html = renderToStaticMarkup(<SiteFooter showLocaleSwitcher={false} />)

        expect(html).toContain('href="https://peanut.me/en/terms"')
        expect(html).toContain('href="/privacy"')
        expect(html).not.toContain('utm_')
        expect(html).not.toContain('peanut-logo')
    })
})
