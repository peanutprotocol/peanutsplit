import { expect, type Page } from '@playwright/test'
import { enterCreatedRoom } from '../e2e/helpers'

/**
 * What `scan.spec.ts` and `share-target.spec.ts` both need: a real image, a stubbed model, a quiet
 * install banner and a room to work in. Extracted the day the share target arrived — two entry
 * points into the same scan flow should not carry two copies of the way in.
 */

/** 8×12 white JPEG. Small enough to inline, real enough for `createImageBitmap` and the canvas
 *  downscale in `scan-image.ts` to be exercised for real. */
export const TINY_JPEG = Buffer.from(
    '/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAMAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKcAD//Z',
    'base64'
)

/** What the model "read": two real lines and one hallucinated footer. The third is the row the
 *  scan review exists to let somebody delete. */
export const PARSED = {
    items: [
        { label: 'Pizza', amountMinor: '1250', quantity: 1 },
        { label: 'Wine', amountMinor: '2000', quantity: 1 },
        { label: 'LOYALTY CARD 4417', amountMinor: '990', quantity: null },
    ],
    receiptTotalMinor: '4240',
    currency: 'EUR',
    merchant: 'Da Nino',
    date: null,
}

export interface Posted {
    imageBase64?: string
    mimeType?: string
    calls?: number
    bodies?: Array<{ imageBase64?: string; mimeType?: string }>
}

export interface StubbedModelResponse {
    status?: number
    json?: unknown
    delayMs?: number
}

export interface StubTheModelOptions {
    responses?: StubbedModelResponse[]
    capability?: unknown
    capabilityDelayMs?: number
}

/**
 * Intercept both verbs and REMEMBER what was posted. Nothing is asserted inside the handler on
 * purpose: a throw in there never fulfils the route, so the app sits on a request that will never
 * answer and every later failure is a timeout pointing at the wrong line.
 */
export async function stubTheModel(page: Page, posted: Posted, options: StubTheModelOptions = {}) {
    await page.route('**/api/rooms/*/receipt-parse', async (route) => {
        if (route.request().method() === 'GET') {
            if (options.capabilityDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, options.capabilityDelayMs))
            }
            await route.fulfill({ json: options.capability ?? { enabled: true } })
            return
        }

        let body: { imageBase64?: string; mimeType?: string } = {}
        try {
            body = JSON.parse(route.request().postData() ?? '{}') as typeof body
        } catch {
            // Recorded as "nothing was posted" and asserted on in the test.
        }
        posted.calls = (posted.calls ?? 0) + 1
        posted.bodies = [...(posted.bodies ?? []), body]
        Object.assign(posted, body)

        const responses = options.responses ?? []
        const response = responses.length > 0 ? responses[Math.min(posted.calls - 1, responses.length - 1)] : undefined
        if (response?.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, response.delayMs))
        }
        await route.fulfill({
            status: response?.status ?? 200,
            json: response?.json ?? PARSED,
        })
    })
}

export type CameraPermission = 'ready' | 'denied' | 'unavailable' | 'pending'

/**
 * Install a deterministic camera before navigation. The "ready" branch uses a real, empty
 * MediaStream so assigning it to video.srcObject still exercises the browser contract, while the
 * track and canplay event are controlled by the test. No host camera permission is requested.
 */
export async function mockCamera(page: Page, permission: CameraPermission) {
    await page.addInitScript(
        ({ mode, jpegBase64 }) => {
            const probe: {
                calls: number
                stops: number
                constraints: MediaStreamConstraints | null
                resolveNext: () => void
            } = {
                calls: 0,
                stops: 0,
                constraints: null as MediaStreamConstraints | null,
                resolveNext: () => {},
            }
            const pending: Array<() => void> = []
            const makeStream = () => {
                const stream = new MediaStream()
                const track = { stop: () => probe.stops++ }
                Object.defineProperty(stream, 'getTracks', {
                    configurable: true,
                    value: () => [track],
                })
                return stream
            }
            probe.resolveNext = () => pending.shift()?.()
            Object.defineProperty(window, '__scanCameraE2E', {
                configurable: true,
                value: probe,
            })

            if (mode === 'unavailable') {
                Object.defineProperty(navigator, 'mediaDevices', {
                    configurable: true,
                    value: undefined,
                })
                return
            }

            Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: {
                    getUserMedia: async (constraints: MediaStreamConstraints) => {
                        probe.calls++
                        probe.constraints = constraints
                        if (mode === 'denied') {
                            throw new DOMException('Camera permission denied by test', 'NotAllowedError')
                        }
                        if (mode === 'pending') {
                            return await new Promise<MediaStream>((resolve) => {
                                pending.push(() => resolve(makeStream()))
                            })
                        }
                        return makeStream()
                    },
                },
            })

            Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
                configurable: true,
                get: () => 640,
            })
            Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
                configurable: true,
                get: () => 480,
            })
            Object.defineProperty(HTMLMediaElement.prototype, 'play', {
                configurable: true,
                value() {
                    queueMicrotask(() => this.dispatchEvent(new Event('canplay')))
                    return Promise.resolve()
                },
            })

            // A fake video has no drawable pixels. Make drawing deterministic and
            // return a real, decodable JPEG from the frame canvas; the app then
            // decodes/resizes that File and serialises its own JPEG for the wire.
            Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
                configurable: true,
                value(type: string) {
                    return type === '2d'
                        ? {
                              fillStyle: '#000000',
                              fillRect() {},
                              drawImage() {},
                          }
                        : null
                },
            })
            Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
                configurable: true,
                value(callback: BlobCallback, type?: string) {
                    const binary = atob(jpegBase64)
                    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
                    callback(new Blob([bytes], { type: type ?? 'image/jpeg' }))
                },
            })
        },
        { mode: permission, jpegBase64: TINY_JPEG.toString('base64') }
    )
}

/**
 * Snooze the install banner for the run.
 *
 * On an iPhone user agent it arms a 20s idle timer and then opens a sheet over whatever is on
 * screen. These suites are deliberately slow — they wait on a decode, a round trip and three
 * screens — so they are where that timer reliably fires, and a second modal appearing
 * mid-assertion is noise, not signal.
 */
export async function snoozeInstallPrompt(page: Page) {
    await page.addInitScript(() => {
        window.localStorage.setItem('ps:pwa-dismiss-count', '3')
        window.localStorage.setItem('ps:pwa-dismissed-at', String(Date.now()))
    })
}

export async function makeRoom(page: Page, name: string) {
    await snoozeInstallPrompt(page)
    await page.goto('/new')
    await page.getByTestId('room-name').fill(name)
    await page.getByTestId('room-currency').selectOption('EUR')
    await page.getByTestId('creator-name').fill('Ana')
    await page.getByTestId('create-room').click()
    await enterCreatedRoom(page)
    await expect(page.locator('[data-testid="balance-card"][data-member="Ana"]')).toBeVisible({ timeout: 15_000 })
}
