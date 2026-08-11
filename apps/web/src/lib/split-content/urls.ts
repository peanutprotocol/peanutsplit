import type { Locale } from '@/i18n/locales'

const DEFAULT_APP_ORIGIN = 'https://split.peanut.me'
const DEFAULT_CONTENT_ORIGIN = 'https://peanut.me'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function configuredOrigin(name: 'APP_ORIGIN' | 'CONTENT_ORIGIN', fallback: string): string {
    const raw = process.env[name] || fallback
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new Error(`${name} must be an absolute HTTPS origin`)
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${name} must be an absolute HTTPS origin with no path, credentials, query, or fragment`)
    }
    return url.origin
}

function absoluteAt(origin: string, pathname: string): string {
    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
        throw new Error('Split URL builders require a root-relative path')
    }
    return `${origin}${pathname === '/' ? '' : pathname}`
}

export function appOrigin(): string {
    return configuredOrigin('APP_ORIGIN', DEFAULT_APP_ORIGIN)
}

export function contentOrigin(): string {
    return configuredOrigin('CONTENT_ORIGIN', DEFAULT_CONTENT_ORIGIN)
}

export function appUrl(pathname: string): string {
    return absoluteAt(appOrigin(), pathname)
}

export function contentUrl(pathname: string): string {
    return absoluteAt(contentOrigin(), pathname)
}

export function guidePath(locale: Locale, slug: string): string {
    if (!SLUG.test(slug)) throw new Error(`invalid Split content slug: ${slug}`)
    return `/${locale}/split/guides/${slug}`
}

export function guideUrl(locale: Locale, slug: string): string {
    return contentUrl(guidePath(locale, slug))
}
