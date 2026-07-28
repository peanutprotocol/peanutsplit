/**
 * The two halves of spending a magic link.
 *
 * GET is deliberately inert. Corporate mail scanners, link expanders and inbox
 * previewers fetch every URL in a message before a human has seen it — a GET
 * that logged you in would be spent by a robot, and the person clicking would
 * land on "this link has expired" every time. So GET reads nothing, writes
 * nothing, and renders one button.
 *
 * POST is the half with consequences. Scanners do not submit forms.
 */
import { ApiError, errorResponse } from '@/server/http'
import { VERIFY_LIMIT, completeLogin } from '@/server/accounts'
import { enforceRateLimit } from '@/server/rateLimit'
import { setSessionForUser } from '@/server/session'

export const dynamic = 'force-dynamic'

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

/** Self-contained: no layout, no client bundle, no fetch. The page exists for
 *  the two seconds between opening the mail and being signed in. */
const confirmPage = (token: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Open your rooms</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111}
main{max-width:420px;padding:32px;text-align:center}
h1{font-size:22px;margin:0 0 12px}
p{font-size:15px;line-height:1.6;color:#3f3f3f;margin:0 0 24px}
button{width:100%;padding:14px 24px;font:inherit;font-weight:600;color:#fff;background:#111;border:0;border-radius:6px;cursor:pointer}
</style>
</head>
<body>
<main>
<h1>Open your rooms</h1>
<p>Tap to finish signing in on this device.</p>
<form method="POST">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit">Open my rooms</button>
</form>
</main>
</body>
</html>`

export function GET(request: Request): Response {
    const token = new URL(request.url).searchParams.get('token') ?? ''
    return new Response(confirmPage(token), {
        status: 200,
        // No caching anywhere: the page carries a live credential in its markup.
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    })
}

/** The form posts to the URL it was served from, so the token arrives twice —
 *  in the body it submitted and in the query string it inherited. Either will do. */
async function tokenFrom(request: Request): Promise<string> {
    try {
        const form = await request.formData()
        const fromBody = form.get('token')
        if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody
    } catch {
        // Not a form submission — fall through to the query string.
    }
    return new URL(request.url).searchParams.get('token') ?? ''
}

/**
 * Not `respond()`-wrapped: success is a redirect carrying a `Set-Cookie`, which
 * is not a JSON body. Failures still leave in the standard envelope.
 */
export async function POST(request: Request): Promise<Response> {
    try {
        enforceRateLimit(request, VERIFY_LIMIT, 'auth-verify')
        const userId = await completeLogin(await tokenFrom(request))
        // 303 so the browser follows with a GET — a refresh on the landing page
        // must not re-submit a token that is already spent.
        const redirect = new Response(null, { status: 303, headers: { Location: '/?login=1' } })
        return await setSessionForUser(userId, redirect)
    } catch (err) {
        if (err instanceof ApiError) return errorResponse(err.code, err.message, err.status)
        console.error('[auth] verify failed', err)
        return errorResponse('INTERNAL', 'something went wrong on our side', 500)
    }
}
