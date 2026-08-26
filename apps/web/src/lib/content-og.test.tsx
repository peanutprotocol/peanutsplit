/**
 * The one implementation behind all fifteen content unfurls.
 *
 * Two incidents came out of this corner already — `a28313f` (fifteen guides sharing as a grey box)
 * and `d15918b` (`/tools` promising `summary_large_image` and shipping nothing) — and
 * `og-card-parity.test.ts` now pins the route inventory that would have caught both. What it
 * cannot see is what this module puts ON the card: the sanitizer, the fallbacks and the title.
 *
 * `drawable()` is not exported, so every claim about it is made through `brandCardResponse` and the
 * three route builders. `ImageResponse` is wrapped rather than replaced: the wrapper records the
 * `BrandCard` element and then calls the real constructor, so the same test can read the exact
 * string the sanitizer produced AND rasterize it. That matters — `new ImageResponse()` renders
 * lazily, and Satori fails on a bad element tree at render time, not construction time.
 *
 * The es-419 and pt-br titles are the only inputs that exercise the sanitizer at all, and nothing
 * anywhere requested one before this file.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { brandCardResponse, contentOgImage, hubOgImage, ogImageExports, splitGuideOgImage } from '@/lib/content-og'
import { listAllTranslations } from '@/lib/content'
import { listSplitGuides } from '@/lib/split-content/artifact'
import { OG_CONTENT_TYPE, OG_SIZE } from '@/server/og/card'
import { INDEXED_LOCALES } from '@/i18n/locales'

const captured = vi.hoisted(() => [] as { lines: readonly [string, string]; tagline: string }[])

vi.mock('next/og', async (importOriginal) => {
    const actual = await importOriginal<typeof import('next/og')>()
    class CapturingImageResponse extends actual.ImageResponse {
        constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
            captured.push(args[0].props as (typeof captured)[number])
            super(...args)
        }
    }
    return { ...actual, ImageResponse: CapturingImageResponse }
})

/**
 * `getTranslations` needs a request scope that a unit test does not have. The catalog it reads is
 * the real one, through the same next-intl translator `i18n/t.ts` binds for non-component code, so
 * the hub's tagline below is the shipped Spanish string and not a fixture.
 */
vi.mock('next-intl/server', () => ({
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
        const { getTranslator } = await import('@/i18n/t')
        const t = await getTranslator(locale)
        return (key: string) => t(`${namespace}.${key}`)
    },
}))

/** The `BrandCard` props of the most recent render — `lines` as passed, `tagline` post-sanitizer. */
const cardFor = async (render: Promise<unknown>) => {
    captured.length = 0
    await render
    return captured[0]
}

const sanitize = async (raw: string): Promise<string> =>
    (await cardFor(brandCardResponse(['SPLIT', 'GUIDES'], raw))).tagline

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/**
 * Rasterize for real and measure where the white sheet sits.
 *
 * The sheet is the only large white area on the card and it is height-to-content, so the first and
 * last rows that are mostly white are the frame's top and bottom edges. A sheet that reaches row 0
 * or row 629 has eaten the coloured field; one that reaches past `height - WORDMARK_HEIGHT` has
 * covered "PEANUT SPLIT".
 */
const WORDMARK_HEIGHT = 96

const rasterize = async (tagline: string) => {
    const response = await brandCardResponse(['SPLIT', 'GUIDES'], tagline)
    const png = Buffer.from(await response.arrayBuffer())
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const whiteRows: boolean[] = []
    for (let y = 0; y < info.height; y++) {
        let white = 0
        for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * info.channels
            if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++
        }
        // The sheet spans most of the canvas width; a 400px run is far past any glyph or blob.
        whiteRows.push(white > 400)
    }
    return {
        png,
        digest: createHash('sha256').update(png).digest('hex'),
        width: info.width,
        height: info.height,
        sheetTop: whiteRows.indexOf(true),
        sheetBottom: whiteRows.lastIndexOf(true),
    }
}

describe('ogImageExports', () => {
    /**
     * `d15918b`: `/tools` declared `summary_large_image` and shipped no image. Thirteen of the
     * fifteen routes now re-export their `size` and `contentType` from here rather than restating
     * them, so a value that drifts from the frame drifts on every one of those routes at once —
     * and `og-card-parity.test.ts` only checks that the route files exist.
     */
    it('re-exports exactly what the frame declares', () => {
        expect(ogImageExports.size).toBe(OG_SIZE)
        expect(ogImageExports.contentType).toBe(OG_CONTENT_TYPE)
        expect(ogImageExports.size).toEqual({ width: 1200, height: 630 })
        expect(ogImageExports.contentType).toBe('image/png')
    })

    /** `runtime` is deliberately absent: Next parses it out of the AST and rejects a re-export. */
    it('does not offer a runtime to re-export', () => {
        expect(ogImageExports).not.toHaveProperty('runtime')
    })
})

describe('drawable', () => {
    /**
     * The Spanish cards. Every accented codepoint here is inside Roboto's cmap, so the sanitizer
     * has to leave the title alone — a pass that ate `ó` would ship "Cmo dividir gastos" to every
     * es-419 share, and no other test requests a Spanish title.
     */
    it('keeps Spanish accents and inverted punctuation verbatim', async () => {
        expect(await sanitize('Cómo dividir gastos sin cuenta')).toBe('Cómo dividir gastos sin cuenta')
        expect(await sanitize('¿Cuánto pagó cada uno? ¡Ya está!')).toBe('¿Cuánto pagó cada uno? ¡Ya está!')
        expect(await sanitize('Límite gratis de Splitwise: 4 gastos al día')).toBe(
            'Límite gratis de Splitwise: 4 gastos al día'
        )
    })

    /** The Portuguese cards, same claim: tildes, cedilla and the em dash the copy uses. */
    it('keeps Portuguese tildes, cedilla and the em dash verbatim', async () => {
        expect(await sanitize('Divisão de despesas em São Paulo — João e o açaí')).toBe(
            'Divisão de despesas em São Paulo — João e o açaí'
        )
        expect(await sanitize('Limite grátis do Splitwise: 4 despesas ao dia')).toBe(
            'Limite grátis do Splitwise: 4 despesas ao dia'
        )
    })

    /** Typographic punctuation is in the body cmap. Stripping it would leave "It s a quote". */
    it('keeps curly quotes and the ellipsis glyph', async () => {
        expect(await sanitize('It’s a “quote” and an ellipsis…')).toBe('It’s a “quote” and an ellipsis…')
    })

    /**
     * The module docstring says accents are safe "up to Latin-1" and that anything past it is
     * dropped. That is not what the code does — `BODY_CHARS` carries Latin Extended-A and the
     * whole Cyrillic block, and the pinned Roboto "all" WOFF draws them. The comment is stale, the
     * behaviour is right, and this pins the behaviour so a future "fix" to match the comment fails
     * here instead of silently blanking a Ukrainian or Polish title.
     */
    it('keeps Cyrillic and Latin Extended, which the comment says it drops', async () => {
        expect(await sanitize('Київ 2026')).toBe('Київ 2026')
        expect(await sanitize('Jak dzielić wydatki')).toBe('Jak dzielić wydatki')
    })

    /** An emoji in a title costs the emoji and nothing else — the words either side stay one space apart. */
    it('drops an emoji and closes the gap it leaves', async () => {
        expect(await sanitize('Ski trip \u{1F3BF} 2026')).toBe('Ski trip 2026')
        expect(await sanitize('Split \u{1F95C} it')).toBe('Split it')
    })

    /** An unfurl with an empty tagline is the grey-box share again, so there is a floor. */
    it('falls back to the brand name when nothing drawable is left', async () => {
        expect(await sanitize('')).toBe('Peanut Split')
        expect(await sanitize('   \n\t ')).toBe('Peanut Split')
        expect(await sanitize('東京旅行')).toBe('Peanut Split')
        expect(await sanitize('\u{1F95C}\u{1F95C}')).toBe('Peanut Split')
    })

    /**
     * BUG — recorded, not endorsed. `drawable()` maps an unmappable character to a SPACE;
     * `sanitizeForFont()` in `server/og/roomCard.ts:154` deletes it. So the two sanitizers disagree
     * on the same input: the room card renders "SplitNow", the content card renders "Split Now".
     * A character in the middle of a word splits the word in half.
     */
    it('splits a word in half around a character it cannot draw (bug)', async () => {
        expect(await sanitize('Split東京Now')).toBe('Split Now')
        expect(await sanitize('caf\u{1F95C}e')).toBe('caf e')
    })

    /**
     * BUG — recorded, not endorsed. Decomposed (NFD) text is the realistic way this bites: a
     * combining acute is U+0301, which is outside `BODY_CHARS`, so precomposed "niño" survives and
     * the decomposed spelling of the same word renders as "nin o" on the card. Nothing in the
     * content pipeline normalizes a frontmatter title to NFC, and es-419/pt-br copy is exactly
     * where NFD arrives from. `roomCard.ts:179` normalizes before it folds; this path does not.
     */
    it('breaks decomposed accents into a mid-word space (bug)', async () => {
        // Escapes, not literals: the two spellings are indistinguishable in a source file.
        expect(await sanitize('nin\u0303o')).toBe('nin o')
        expect(await sanitize('Cafe\u0301')).toBe('Cafe')
        // The precomposed spellings of the same two words, for contrast.
        expect(await sanitize('ni\u00F1o')).toBe('ni\u00F1o')
        expect(await sanitize('Caf\u00E9')).toBe('Caf\u00E9')
    })

    /**
     * BUG — recorded, not endorsed. `sanitizeForFont()` falls back when under 70% of the meaningful
     * characters survive, precisely so a name does not ship half-eaten. `drawable()` has no such
     * guard: it only falls back when the string is emptied outright, so a title that is mostly
     * undrawable ships as whatever fragment happened to be Latin.
     */
    it('ships a fragment of a mostly-undrawable title rather than falling back (bug)', async () => {
        expect(await sanitize('東京旅行Split東京旅行')).toBe('Split')
        expect(await sanitize('東京 2026 旅行')).toBe('2026')
    })
})

describe('the route builders', () => {
    /**
     * The root `/[page]` slot serves more than one collection, so the builder has to find which one
     * owns the slug. A builder that read only the first collection would 'Peanut Split' every
     * `capture` page served from the root — a card that renders but says nothing about the page.
     */
    it('finds the slug in whichever collection owns it, and picks that collection lines', async () => {
        expect(
            await cardFor(
                contentOgImage(['blog'], 'en', 'slug')({ params: Promise.resolve({ slug: 'split-expenses-offline' }) })
            )
        ).toEqual({ lines: ['SPLIT', 'GUIDES'], tagline: 'Splitting expenses offline, with no signal' })

        expect(
            await cardFor(
                contentOgImage(
                    ['alternatives', 'capture'],
                    'es-419',
                    'page'
                )({
                    params: Promise.resolve({ page: 'splitwise-alternative' }),
                })
            )
        ).toEqual({ lines: ['SPLIT', 'IT'], tagline: 'Alternativa a Splitwise gratis, sin registro' })
    })

    /**
     * A slug with no doc still has to produce artwork. `dynamicParams = false` means Next should
     * never route one here, but a card route that threw on a miss would turn a stale share into a
     * 500 rather than a brand card.
     */
    it('answers an unknown slug with the brand card', async () => {
        const card = await cardFor(
            contentOgImage(['blog'], 'en', 'slug')({ params: Promise.resolve({ slug: 'nope' }) })
        )
        expect(card).toEqual({ lines: ['SPLIT', 'IT'], tagline: 'Peanut Split' })
    })

    /** The guide card carries the guide's own title, sanitizer and all. */
    it('puts the real guide title on the guide card', async () => {
        expect(
            await cardFor(
                splitGuideOgImage('es-419')({ params: Promise.resolve({ slug: 'why-do-i-owe-someone-i-never-paid' }) })
            )
        ).toEqual({ lines: ['SPLIT', 'GUIDES'], tagline: 'Por qué le debes a alguien a quien nunca le pagaste' })
    })

    /**
     * Unlike the content builder, a guide slug outside the manifest is a 404 — the page it decorates
     * is one too, and an image endpoint that answers for any slug is a surface the page contract
     * never promised.
     */
    it('404s a guide slug the manifest does not list', async () => {
        await expect(
            splitGuideOgImage('es-419')({ params: Promise.resolve({ slug: 'not-a-real-guide' }) })
        ).rejects.toThrow()
    })

    /**
     * `/es-419/blog` and `/pt-br/blog` had no `opengraph-image` and shared as blank cards. The
     * tagline is the hub's own catalog line, so it must arrive translated and with its accents —
     * an English tagline here is the same bug wearing a card.
     */
    it('gives each translated hub its own localized tagline', async () => {
        expect(await cardFor(hubOgImage('es-419')())).toEqual({
            lines: ['SPLIT', 'GUIDES'],
            tagline: 'Cómo dividir gastos sin cuenta, sin instalar nada y sin suscripción.',
        })
        expect(await cardFor(hubOgImage('pt-br')())).toEqual({
            lines: ['SPLIT', 'GUIDES'],
            tagline: 'Como dividir despesas sem conta, sem instalar nada e sem assinatura.',
        })
    })
})

describe('the rasterized card', () => {
    /**
     * The only test that proves the element tree Satori is handed is legal. A missing
     * `display: flex` or a `gap` in `BrandCard` or the shared frame is a render-time throw, and
     * construction alone proves nothing because `ImageResponse` renders lazily.
     */
    it('renders a real PNG at exactly the size the routes declare', async () => {
        const card = await rasterize('Cómo dividir gastos sin cuenta, sin instalar nada')
        expect([...card.png.subarray(0, 4)]).toEqual(PNG_MAGIC)
        expect({ width: card.width, height: card.height }).toEqual(OG_SIZE)
        // Satori fails soft on a broken tree; a near-empty PNG is what that looks like.
        expect(card.png.byteLength).toBeGreaterThan(20_000)
    }, 30_000)

    /**
     * Accents reach the pixels, not just the props. Roboto draws `é`, so `Café` and `Cafe` cannot
     * rasterize to the same bytes — if the accent were being dropped somewhere between the
     * sanitizer and the shaper, these two digests would match and every assertion above would still
     * pass.
     */
    it('draws an accent rather than swallowing it between the sanitizer and the shaper', async () => {
        const [accented, plain, again] = await Promise.all([rasterize('Café'), rasterize('Cafe'), rasterize('Café')])
        expect(accented.digest).not.toBe(plain.digest)
        // Deterministic, which is what makes the comparison above mean anything.
        expect(accented.digest).toBe(again.digest)
    }, 30_000)

    /**
     * The tripwire for the class of defect ROADMAP.md:498 logs against `/r/<slug>/opengraph-image`:
     * a long name that overflows the card. It is worse here — `drawable()` has no ceiling at all,
     * where every other OG sanitizer truncates (`MAX_NAME_CHARS`, `MAX_MEMBER_CHARS`). The only
     * thing keeping content cards inside the frame today is that nobody has authored a long title,
     * so the corpus is what gets checked: render the longest title that can actually reach a card
     * and require the sheet to still float on the field with the wordmark uncovered.
     */
    it('keeps the frame intact for the longest title actually shipped', async () => {
        const titles = [
            ...listAllTranslations().map((doc) => doc.frontmatter.title),
            ...INDEXED_LOCALES.flatMap((locale) => listSplitGuides(locale).map((guide) => guide.title)),
        ]
        expect(titles.length).toBeGreaterThan(20)
        const longest = titles.reduce((a, b) => (b.length > a.length ? b : a))

        const card = await rasterize(longest)
        expect(card.sheetTop).toBeGreaterThan(0)
        expect(card.sheetBottom).toBeLessThan(OG_SIZE.height - WORDMARK_HEIGHT)
    }, 30_000)

    /**
     * BUG — recorded, not endorsed. What happens once a title IS long, so the cost of the missing
     * ceiling is written down rather than guessed at. At a few hundred characters the sheet grows
     * until it covers the field, the blobs and the wordmark edge to edge, and past roughly 480 the
     * overflow is off-canvas: the same bytes come out whether or not more text is appended, so the
     * end of the title is drawn nowhere. Truncating in `drawable()` the way `sanitizeForFont()`
     * does would make both of these lines fail.
     */
    it('lets a long title eat the whole card and then silently clips it (bug)', async () => {
        const long = 'palabra '.repeat(60).trim()
        expect(long.length).toBe(479)

        const card = await rasterize(long)
        expect(card.sheetTop).toBe(0)
        expect(card.sheetBottom).toBe(OG_SIZE.height - 1)

        const longer = await rasterize(`${long} zzzz`)
        expect(longer.digest).toBe(card.digest)
    }, 30_000)
})
