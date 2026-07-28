/**
 * The one outbound email Split sends: a magic link. Resend's REST API over plain
 * `fetch` — a whole SDK for a single POST would be a dependency to audit, patch
 * and keep above the freshness floor for no reachable benefit.
 *
 * Unconfigured is a first-class outcome, not an error: with no key the module
 * reports `unconfigured`, the caller carries on, and in development it prints the
 * link to the server console so the flow is clickable end to end with zero setup.
 *
 * The production container has no egress. When `SPLIT_EMAIL_PROXY_URL` is set the
 * request goes through that pinned proxy instead of straight out — see the deploy
 * notes in the root README on why the network is closed rather than opened.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface SendResult {
    ok: boolean
    /** Machine-readable, for logs — never shown to the person who typed the address. */
    reason?: 'unconfigured' | 'rejected' | 'network' | 'provider-error'
    /**
     * The address itself is bad (typo, dead domain), so a retry cannot help and
     * anything we hold pointing at it — this link, and any future one — is dead
     * on arrival. Soft failures get the opposite treatment: try again later.
     */
    deadToken?: boolean
    id?: string
}

/** Resend's error `name` values for "that address can never receive mail". */
const HARD_BOUNCE_NAMES = new Set(['invalid_to_email', 'invalid_to_address'])

interface EmailConfig {
    apiKey: string
    from: string
}

/** Read per call, never at import: env arrives after the module graph in some
 *  runtimes, and a module-level snapshot would cache "unconfigured" forever. */
function emailConfig(): EmailConfig | null {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.SPLIT_EMAIL_FROM
    return apiKey && from ? { apiKey, from } : null
}

/** Undici's `ProxyAgent` is the only thing global `fetch` accepts as a route out,
 *  and it is imported lazily so the no-proxy path never pulls it into the bundle. */
async function proxyDispatcher(): Promise<unknown | null> {
    const proxyUrl = process.env.SPLIT_EMAIL_PROXY_URL
    if (!proxyUrl) return null
    try {
        const { ProxyAgent } = await import('undici')
        return new ProxyAgent(proxyUrl)
    } catch (err) {
        console.error('[auth] email proxy unavailable', err)
        return null
    }
}

export interface MagicLinkEmail {
    subject: string
    html: string
    text: string
}

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

const SUBJECT = 'Your Peanut Split link'
const PREHEADER = 'Opens your rooms on this device.'
const HEADLINE = 'Open your rooms here'
const BODY = 'Tap the button to bring your Split rooms onto this device. The link works once and expires in 30 minutes.'
const CTA = 'Open my rooms'
const FOOTER = "If you didn't ask for this, ignore it — nothing happens until the link is opened."

/**
 * A table shell rather than a layout: Outlook still ignores half of CSS, and this
 * mail has one job. The preheader is hidden text Gmail shows next to the subject
 * line — without it Gmail scrapes the first visible words instead, and the
 * padding of zero-width non-joiners stops the body copy leaking in behind it.
 */
export function renderMagicLinkEmail(url: string): MagicLinkEmail {
    const safeUrl = escapeHtml(url)
    const html = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(PREHEADER)}${'&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid #111111;border-radius:8px">
      <tr><td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111111">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(HEADLINE)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f3f">${escapeHtml(BODY)}</p>
        <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;background:#111111;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px">${escapeHtml(CTA)}</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b6b6b">${escapeHtml(FOOTER)}</p>
      </td></tr>
    </table>
  </td></tr>
</table>`

    // Same strings, so the two versions can never drift into saying different things.
    const text = `${HEADLINE}\n\n${BODY}\n\n${url}\n\n${FOOTER}\n`
    return { subject: SUBJECT, html, text }
}

/** Base URL is configuration, never a literal: staging, preview and production
 *  all mint links, and a hardcoded host sends every one of them to production. */
export const magicLinkUrl = (token: string): string => {
    const base = (process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
    return `${base}/api/auth/verify?token=${encodeURIComponent(token)}`
}

export async function sendMagicLink(to: string, url: string): Promise<SendResult> {
    const config = emailConfig()
    if (!config) {
        // The whole feature is meant to be inert without configuration — except
        // locally, where the console is the mailbox.
        if (process.env.NODE_ENV !== 'production') console.log(`[auth] magic link for ${to}: ${url}`)
        return { ok: false, reason: 'unconfigured' }
    }

    const { subject, html, text } = renderMagicLinkEmail(url)
    const dispatcher = await proxyDispatcher()

    let response: Response
    try {
        response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.from, to: [to], subject, html, text }),
            // `dispatcher` is undici's, not the fetch standard's — the cast is the
            // price of routing through the egress proxy without an http client.
            ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
        })
    } catch (err) {
        console.error('[auth] magic link send failed', err)
        return { ok: false, reason: 'network' }
    }

    const payload = (await response.json().catch(() => null)) as { id?: string; name?: string; message?: string } | null

    if (!response.ok) {
        const name = payload?.name ?? 'unknown'
        console.error(`[auth] magic link rejected (${response.status} ${name})`)
        return { ok: false, reason: 'rejected', deadToken: HARD_BOUNCE_NAMES.has(name) }
    }
    return { ok: true, id: payload?.id }
}
