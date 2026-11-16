// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseFormValues } from '@/lib/expense-form'
import type { ParsedReceipt } from '@/lib/api-types'

/**
 * The store app's AI consent gate (Apple 5.1.2(i)): no receipt photo goes to
 * POST /api/rooms/:slug/receipt-parse before the person taps Allow. The web build has no gate.
 */

const parse = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        icon: _icon,
        loading: _loading,
        shadowSize: _shadowSize,
        variant: _variant,
        ...props
    }: ComponentProps<'button'> & { icon?: string; loading?: boolean; shadowSize?: string; variant?: string }) =>
        createElement('button', props, children),
}))
vi.mock('@/components/ui/CloseButton', () => ({ CloseButton: () => null }))
vi.mock('@/lib/api', () => ({ api: { receipt: { parse } }, isApiError: () => false }))
vi.mock('@/lib/analytics', () => ({ track: () => undefined, roomProps: () => ({}) }))
vi.mock('@/lib/error-messages', () => ({ useErrorMessage: () => () => 'error' }))
vi.mock('@/lib/sounds', () => ({ playSound: () => undefined, warmAudio: () => undefined }))
vi.mock('./scan-image', () => ({
    prepareReceiptImage: async (file: File) => file,
    ImageTooLargeError: class extends Error {},
    ImageUnreadableError: class extends Error {},
}))
vi.mock('./ScanCamera', () => ({ ScanCamera: () => createElement('div', { 'data-testid': 'scan-camera' }) }))
vi.mock('./ScanningAnimation', () => ({ ScanningAnimation: () => null }))
vi.mock('./ScanReview', () => ({ ScanReview: () => createElement('div', { 'data-testid': 'scan-review' }) }))
vi.mock('./ScanAssign', () => ({ ScanAssign: () => null }))

const receipt: ParsedReceipt = {
    merchant: null,
    date: null,
    currency: 'EUR',
    items: [],
    adjustments: [],
    totalMinor: null,
} as unknown as ParsedReceipt

const baseValues = {} as ExpenseFormValues

let container: HTMLDivElement
let root: Root
let setScanConsent: (value: boolean) => void

beforeEach(() => {
    vi.resetModules()
    parse.mockReset()
    parse.mockResolvedValue(receipt)
    window.localStorage.clear()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(async () => {
    await act(async () => root.unmount())
    document.body.innerHTML = ''
    vi.unstubAllEnvs()
})

async function renderScan({ native, initialFile = null }: { native: boolean; initialFile?: File | null }) {
    vi.stubEnv('NEXT_PUBLIC_NATIVE_BUILD', native ? '1' : '0')
    const { ScanFlow } = await import('./ScanFlow')
    const { useSettings } = await import('@/lib/use-settings')
    const onCancel = vi.fn()
    // What the room settings switch calls (`setting-scan-consent` → setScanConsent).
    function Harness() {
        setScanConsent = useSettings().setScanConsent
        return createElement(ScanFlow, {
            initialFile,
            slug: 'ski-trip-kunc-syrup-drum',
            token: 'member-token',
            members: [],
            roomCurrency: 'EUR',
            currencies: [],
            baseValues,
            onCancel,
            onApply: () => undefined,
        })
    }
    await act(async () => root.render(createElement(Harness)))
    await settle()
    return { onCancel }
}

/** Lets effects, the read promise and the state updates after it run. */
async function settle() {
    for (let i = 0; i < 5; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const click = async (id: string) => {
    await act(async () => byTestId(id)!.click())
    await settle()
}
const storedConsent = () => JSON.parse(window.localStorage.getItem('ps:settings') ?? '{}').scanConsent
const photo = () => new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })

describe('ScanFlow AI consent gate in the store app', () => {
    it('asks before a shared photo is read, and uploads nothing until Allow', async () => {
        await renderScan({ native: true, initialFile: photo() })

        expect(byTestId('scan-consent')).not.toBeNull()
        expect(byTestId('scan-camera')).toBeNull()
        expect(parse).not.toHaveBeenCalled()
    })

    it('reads the photo exactly once after Allow and remembers the answer', async () => {
        await renderScan({ native: true, initialFile: photo() })

        await click('scan-consent-allow')

        expect(parse).toHaveBeenCalledTimes(1)
        expect(parse.mock.calls[0][0]).toBe('ski-trip-kunc-syrup-drum')
        expect(byTestId('scan-consent')).toBeNull()
        expect(byTestId('scan-review')).not.toBeNull()
        expect(storedConsent()).toBe(true)
    })

    it('closes on Not now without uploading or storing consent', async () => {
        const { onCancel } = await renderScan({ native: true, initialFile: photo() })

        await click('scan-consent-not-now')

        expect(onCancel).toHaveBeenCalledTimes(1)
        expect(parse).not.toHaveBeenCalled()
        expect(storedConsent()).toBeUndefined()
    })

    it('skips the question once consent is stored, and asks again after it is turned off', async () => {
        window.localStorage.setItem('ps:settings', JSON.stringify({ scanConsent: true }))
        await renderScan({ native: true })

        expect(byTestId('scan-consent')).toBeNull()
        expect(byTestId('scan-camera')).not.toBeNull()

        await act(async () => setScanConsent(false))
        await settle()

        expect(byTestId('scan-consent')).not.toBeNull()
        expect(storedConsent()).toBe(false)
        expect(parse).not.toHaveBeenCalled()
    })
})

describe('ScanFlow on the web', () => {
    it('never asks and reads a shared photo straight away', async () => {
        await renderScan({ native: false, initialFile: photo() })

        expect(byTestId('scan-consent')).toBeNull()
        expect(parse).toHaveBeenCalledTimes(1)
    })
})
