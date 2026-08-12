#!/usr/bin/env node

/**
 * Persistent, headed Chromium gate for Split's real installability contract.
 *
 * Playwright's ordinary contexts are incognito, so Chrome reports `in-incognito` even when the
 * application is healthy. Run this against a production build (or production itself) under a
 * display server:
 *
 *   xvfb-run -a node scripts/verify-pwa-installability.mjs \
 *     https://peanutsplit.com /r/<existing-room-slug> https://split.peanut.me
 *
 * A loopback base automatically presents `x-forwarded-host: peanutsplit.com`, matching the trusted
 * proxy contract used by the production-build PWA boundary suite. This exercises the final build
 * locally without weakening the runtime rule that production localhost is not a canonical host.
 *
 * The room slug is read-only and redacted from output. The optional third URL verifies that the
 * compatibility alias redirects instead of serving a second install identity.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const [, , baseArgument, roomArgument, aliasArgument] = process.argv

if (!baseArgument || !roomArgument) {
    console.error('Usage: node scripts/verify-pwa-installability.mjs <base-url> </r/existing-slug> [alias-base-url]')
    process.exit(2)
}

if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    console.error('A headed display is required. Run this command through `xvfb-run -a`.')
    process.exit(2)
}

const base = new URL(baseArgument)
base.pathname = '/'
base.search = ''
base.hash = ''

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])
const isLoopback = (url) => LOOPBACK_HOSTS.has(url.hostname)
const canonicalRequestHeaders = isLoopback(base) ? { 'x-forwarded-host': 'peanutsplit.com' } : {}

const roomUrl = new URL(roomArgument, base)
if (roomUrl.origin !== base.origin || !/^\/r\/[^/]+\/?$/.test(roomUrl.pathname)) {
    console.error('The room argument must be a direct /r/<slug> path on the base origin.')
    process.exit(2)
}
roomUrl.search = ''
roomUrl.hash = ''
roomUrl.pathname = roomUrl.pathname.replace(/\/$/, '')

const redactedPath = (pathname) => pathname.replace(/^(\/r\/)[^/]+/, '$1[redacted]')
const redactSecrets = (value) => String(value).replaceAll(roomUrl.pathname, redactedPath(roomUrl.pathname))
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function invariant(condition, message) {
    if (!condition) throw new Error(message)
}

async function initialHeadContract(url) {
    const response = await fetch(url, {
        headers: {
            ...canonicalRequestHeaders,
            'user-agent':
                'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/127.0 Mobile Safari/537.36',
        },
        redirect: 'manual',
    })
    invariant(response.status === 200, `${redactedPath(url.pathname)} returned HTTP ${response.status}`)
    const html = await response.text()
    const headEnd = html.indexOf('</head>')
    invariant(headEnd > 0, `${redactedPath(url.pathname)} has no complete initial <head>`)
    const initialHead = html.slice(0, headEnd)
    invariant(
        initialHead.includes('<link rel="manifest" href="/manifest.webmanifest"'),
        `${redactedPath(url.pathname)} has no manifest link before </head>`
    )
    invariant(
        initialHead.includes('<meta name="application-name" content="Split"'),
        `${redactedPath(url.pathname)} has no Split application name before </head>`
    )
    invariant(
        (html.match(/rel="manifest"/g) ?? []).length === 1,
        `${redactedPath(url.pathname)} must expose exactly one manifest link`
    )
}

async function readInstallability(page, cdp, url) {
    const previousDocumentId = await page.evaluate(() => window.__splitPwaAudit?.documentId ?? null)
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45_000 })

    // Chrome's installability calculation and beforeinstallprompt delivery are asynchronous.
    await page.waitForFunction(() => document.querySelector('link[rel="manifest"]')?.parentElement?.tagName === 'HEAD')
    await page.waitForFunction(
        (prior) => window.__splitPwaAudit?.documentId !== prior && window.__splitPwaAudit?.beforeInstallPromptCount > 0,
        previousDocumentId,
        { timeout: Number(process.env.PWA_BIP_TIMEOUT_MS ?? 15_000) }
    )
    await sleep(250)

    const [installability, appManifest, documentState] = await Promise.all([
        cdp.send('Page.getInstallabilityErrors'),
        cdp.send('Page.getAppManifest'),
        page.evaluate(() => ({
            titleIsSplit: document.title === 'Split',
            manifestParent: document.querySelector('link[rel="manifest"]')?.parentElement?.tagName ?? null,
            manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
            beforeInstallPromptCount: window.__splitPwaAudit?.beforeInstallPromptCount ?? 0,
            serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
        })),
    ])

    const errors = installability.installabilityErrors ?? []
    const manifest = JSON.parse(appManifest.data ?? '{}')
    invariant(errors.length === 0, `${redactedPath(url.pathname)} installability errors: ${JSON.stringify(errors)}`)
    invariant(
        appManifest.url === new URL('/manifest.webmanifest', base).href,
        'Chrome discovered the wrong manifest URL'
    )
    invariant(
        manifest.name === 'Split' && manifest.short_name === 'Split',
        'The installed application must be named Split'
    )
    invariant(manifest.id === '/', `Manifest id must be /, received ${JSON.stringify(manifest.id)}`)
    invariant(
        manifest.start_url === '/app',
        `Manifest start_url must be /app, received ${JSON.stringify(manifest.start_url)}`
    )
    invariant(manifest.scope === '/', `Manifest scope must be /, received ${JSON.stringify(manifest.scope)}`)
    invariant(documentState.manifestParent === 'HEAD', `${redactedPath(url.pathname)} manifest is outside <head>`)
    invariant(
        documentState.serviceWorkerControlled,
        `${redactedPath(url.pathname)} is not controlled by the production service worker`
    )
    invariant(
        documentState.beforeInstallPromptCount > 0,
        `${redactedPath(url.pathname)} emitted no beforeinstallprompt`
    )

    return {
        path: redactedPath(url.pathname),
        titleIsSplit: documentState.titleIsSplit,
        manifestParent: documentState.manifestParent,
        manifestUrl: appManifest.url,
        manifest: {
            name: manifest.name,
            short_name: manifest.short_name,
            id: manifest.id,
            start_url: manifest.start_url,
        },
        installabilityErrors: errors,
        beforeInstallPromptCount: documentState.beforeInstallPromptCount,
        serviceWorkerControlled: documentState.serviceWorkerControlled,
    }
}

async function verifyAliasOrigin(aliasBaseArgument) {
    const alias = new URL(aliasBaseArgument)
    alias.pathname = '/'
    alias.search = ''
    alias.hash = ''
    const aliasRequest = isLoopback(alias) ? { headers: { 'x-forwarded-host': 'split.peanut.me' } } : {}

    const manifestResponse = await fetch(new URL('/manifest.webmanifest', alias), {
        ...aliasRequest,
        redirect: 'manual',
    })
    invariant(
        manifestResponse.status === 308 &&
            manifestResponse.headers.get('location') === 'https://peanutsplit.com/manifest.webmanifest',
        `Alias manifest must redirect to the canonical origin (received HTTP ${manifestResponse.status})`
    )

    const documentResponse = await fetch(new URL('/app', alias), { ...aliasRequest, redirect: 'manual' })
    invariant(
        documentResponse.status === 308 && documentResponse.headers.get('location') === 'https://peanutsplit.com/app',
        `Alias /app must redirect to the canonical origin (received HTTP ${documentResponse.status})`
    )

    return { manifestStatus: manifestResponse.status, appStatus: documentResponse.status }
}

const profile = await mkdtemp(join(tmpdir(), 'split-pwa-audit-'))
let context

try {
    context = await chromium.launchPersistentContext(profile, {
        headless: false,
        ignoreHTTPSErrors: true,
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: canonicalRequestHeaders,
    })
    await context.addInitScript(() => {
        window.__splitPwaAudit = {
            documentId: `${performance.timeOrigin}-${Math.random()}`,
            beforeInstallPromptCount: 0,
        }
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault()
            window.__splitPwaAudit.beforeInstallPromptCount += 1
        })
    })

    const page = context.pages()[0] ?? (await context.newPage())
    const cdp = await context.newCDPSession(page)
    await cdp.send('Page.enable')

    // Bootstrap the real production worker, then reload until the app document is controlled.
    const appUrl = new URL('/app?manage=1', base)
    await page.goto(appUrl.href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable')
        await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => window.setTimeout(() => reject(new Error('service worker timeout')), 15_000)),
        ])
    })
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 })
    }

    // Satisfy Chrome's documented engagement inputs instead of depending on automation-specific
    // shortcuts: one trusted gesture and 30 seconds viewed on this origin. The time is paid once;
    // Chrome carries the engagement across the subsequent room and recap documents.
    await page.mouse.click(8, 8)
    await sleep(Number(process.env.PWA_ENGAGEMENT_MS ?? 31_000))

    const room = new URL(roomUrl)
    const recap = new URL(`${room.pathname.replace(/\/$/, '')}/recap`, base)
    await Promise.all([initialHeadContract(appUrl), initialHeadContract(room), initialHeadContract(recap)])

    const results = []
    const app = await readInstallability(page, cdp, appUrl)
    invariant(app.titleIsSplit, '/app document title must be Split')
    results.push(app)
    results.push(await readInstallability(page, cdp, room))
    results.push(await readInstallability(page, cdp, recap))
    const alias = aliasArgument ? await verifyAliasOrigin(aliasArgument) : null

    console.log(JSON.stringify({ ok: true, origin: base.origin, pages: results, alias }, null, 2))
} catch (error) {
    // Playwright navigation errors include the target URL. Never print the room credential.
    const message = error instanceof Error ? error.message : error
    throw new Error(redactSecrets(message))
} finally {
    await context?.close()
    // `profile` is the exact mkdtemp result above, never a caller-controlled broad path.
    await rm(profile, { recursive: true, force: true })
}
