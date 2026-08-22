import { describe, expect, it } from 'vitest'
import { marketingCacheable } from './marketing-cache'

describe('marketingCacheable', () => {
    it('names the indexable marketing surfaces in every indexed locale', () => {
        for (const path of [
            '/blog',
            '/blog/split-expenses-across-currencies',
            '/tools',
            '/tricount-alternative',
            '/rent-split-calculator',
            '/mileage-split-calculator/united-kingdom',
            '/es-419/blog',
            '/es-419/blog/split-expenses-across-currencies',
            '/pt-br/tricount-alternative',
        ]) {
            expect(marketingCacheable(path), path).toBe(true)
        }
    })

    it('leaves the cookie-localized shell, the gated guides and the per-request pages alone', () => {
        for (const path of [
            '/',
            '/app',
            '/new',
            '/r/trip-abc123',
            '/share-target',
            '/import',
            '/dev-ds',
            '/dev-ds/audit',
            '/healthcheck',
            '/readiness',
            '/opengraph-image',
            '/es-419/healthcheck',
            '/guides/splitwise-vs-settle-up',
            '/es-419/guides/ask-a-friend-to-pay-you-back',
            '/de/blog',
            '/blog/a/b/c',
            '/Blog',
        ]) {
            expect(marketingCacheable(path), path).toBe(false)
        }
    })
})
