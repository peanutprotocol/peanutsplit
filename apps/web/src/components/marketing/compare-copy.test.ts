import { describe, expect, it } from 'vitest'
import sitemap from '@/app/sitemap'
import { LOCALES } from '@/i18n/locales'
import { localizedPath } from '@/i18n/paths'
import { findDroppedDiacritics } from '@/lib/diacritics'
import { absoluteUrl } from '@/lib/seo'
import { splitwiseAlternativeMetadata } from './SplitwiseAlternative'
import { comparisonCopy } from './compare-copy'

describe('localized Splitwise comparison', () => {
    it('keeps translated static copy free of dropped diacritics', () => {
        const strings = (value: unknown): string[] => {
            if (typeof value === 'string') return [value]
            if (Array.isArray(value)) return value.flatMap(strings)
            if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
            return []
        }

        for (const locale of ['es-419', 'pt-br'] as const) {
            expect(findDroppedDiacritics(strings(comparisonCopy[locale]).join('\n'), locale)).toEqual([])
        }
    })

    it('keeps competitor quotes byte-locked across locales', () => {
        const source = comparisonCopy.en
        for (const locale of LOCALES) {
            expect(comparisonCopy[locale].why.items.map((item) => item.quote)).toEqual(
                source.why.items.map((item) => item.quote)
            )
            expect(comparisonCopy[locale].migration.quote).toBe(source.migration.quote)
        }
    })

    it('builds body links, canonicals and hreflang from the same locale', () => {
        for (const locale of LOCALES) {
            const path = localizedPath('/splitwise-alternative', locale)
            expect(comparisonCopy[locale].migration.moreHref).toBe(localizedPath('/splitwise-daily-limit', locale))
            const metadata = splitwiseAlternativeMetadata(locale)
            expect(metadata.alternates?.canonical).toBe(absoluteUrl(path))
            expect(metadata.alternates?.languages).toEqual({
                en: absoluteUrl('/splitwise-alternative'),
                'es-419': absoluteUrl('/es-419/splitwise-alternative'),
                'pt-BR': absoluteUrl('/pt-br/splitwise-alternative'),
                'x-default': absoluteUrl('/splitwise-alternative'),
            })
        }
    })

    it('lists every locale in the sitemap with the same absolute alternates', () => {
        const entries = sitemap().filter((entry) => entry.url.endsWith('/splitwise-alternative'))
        expect(entries.map((entry) => entry.url)).toEqual(
            LOCALES.map((locale) => absoluteUrl(localizedPath('/splitwise-alternative', locale)))
        )
        const languages = {
            en: absoluteUrl('/splitwise-alternative'),
            'es-419': absoluteUrl('/es-419/splitwise-alternative'),
            'pt-BR': absoluteUrl('/pt-br/splitwise-alternative'),
            'x-default': absoluteUrl('/splitwise-alternative'),
        }
        for (const entry of entries) expect(entry.alternates?.languages).toEqual(languages)
    })
})
