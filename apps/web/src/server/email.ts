/**
 * The one outbound email Split sends: a magic link. Two interchangeable
 * transports over plain `fetch` — an SDK for a single POST would be a dependency
 * to audit, patch and keep above the freshness floor for no reachable benefit:
 *
 * - **OneSignal** (`SPLIT_ONESIGNAL_APP_ID` + `SPLIT_ONESIGNAL_API_KEY`) — the
 *   company account already exists, so this is the low-friction default. The
 *   key MUST belong to a separate Split-only OneSignal app, never Peanut's:
 *   this container is semi-trusted, and Peanut's key can reach Peanut's entire
 *   audience. A Split-scoped key can only ever email Split's own recipients.
 * - **Resend** (`RESEND_API_KEY`) — kept as the fallback transport.
 *
 * OneSignal wins when both are configured. Unconfigured is a first-class
 * outcome, not an error: with no key the module reports `unconfigured`, the
 * caller carries on, and in development it prints the link to the server
 * console so the flow is clickable end to end with zero setup.
 *
 * The production container has no egress. When `SPLIT_EMAIL_PROXY_URL` is set the
 * request goes through that pinned proxy instead of straight out — see the deploy
 * notes in the root README on why the network is closed rather than opened.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const ONESIGNAL_ENDPOINT = 'https://api.onesignal.com/notifications'

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

type EmailConfig =
    | { provider: 'onesignal'; appId: string; apiKey: string; from: string }
    | { provider: 'resend'; apiKey: string; from: string }

/** Read per call, never at import: env arrives after the module graph in some
 *  runtimes, and a module-level snapshot would cache "unconfigured" forever. */
function emailConfig(): EmailConfig | null {
    const from = process.env.SPLIT_EMAIL_FROM
    if (!from) return null
    const appId = process.env.SPLIT_ONESIGNAL_APP_ID
    const oneSignalKey = process.env.SPLIT_ONESIGNAL_API_KEY
    if (appId && oneSignalKey) return { provider: 'onesignal', appId, apiKey: oneSignalKey, from }
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) return { provider: 'resend', apiKey: resendKey, from }
    return null
}

/** `"Peanut Split <hi@x.com>"` → name/address, because OneSignal wants them as
 *  two fields while Resend takes the combined form verbatim. */
export function parseFrom(from: string): { name: string | null; address: string } {
    const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from)
    if (match) return { name: match[1] || null, address: match[2] }
    return { name: null, address: from.trim() }
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

    const request =
        config.provider === 'onesignal'
            ? {
                  endpoint: ONESIGNAL_ENDPOINT,
                  // include_email_tokens targets the address directly and creates
                  // the (Split-app-scoped) email record if it doesn't exist —
                  // exactly right for a transactional send to someone we've
                  // never emailed before.
                  body: {
                      app_id: config.appId,
                      include_email_tokens: [to],
                      email_subject: subject,
                      email_body: html,
                      email_from_name: parseFrom(config.from).name ?? 'Peanut Split',
                      email_from_address: parseFrom(config.from).address,
                  },
              }
            : {
                  endpoint: RESEND_ENDPOINT,
                  body: { from: config.from, to: [to], subject, html, text },
              }

    let response: Response
    try {
        response = await fetch(request.endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(request.body),
            // `dispatcher` is undici's, not the fetch standard's — the cast is the
            // price of routing through the egress proxy without an http client.
            ...(dispatcher ? ({ dispatcher } as Record<string, unknown>) : {}),
        })
    } catch (err) {
        console.error('[auth] magic link send failed', err)
        return { ok: false, reason: 'network' }
    }

    const payload = (await response.json().catch(() => null)) as {
        id?: string
        name?: string
        message?: string
        errors?: unknown
    } | null

    // OneSignal answers 200 with an `errors` payload for a bad address rather
    // than a non-2xx status — treat any errors object as a rejection.
    const oneSignalErrors = config.provider === 'onesignal' ? payload?.errors : undefined
    if (!response.ok || oneSignalErrors) {
        const name = payload?.name ?? 'unknown'
        const dead =
            config.provider === 'onesignal'
                ? JSON.stringify(oneSignalErrors ?? '').includes('invalid_email')
                : HARD_BOUNCE_NAMES.has(name)
        console.error(
            `[auth] magic link rejected (${config.provider} ${response.status} ${
                oneSignalErrors ? JSON.stringify(oneSignalErrors).slice(0, 200) : name
            })`
        )
        return { ok: false, reason: 'rejected', deadToken: dead }
    }
    return { ok: true, id: payload?.id }
}
