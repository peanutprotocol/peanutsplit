import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomState } from '@/lib/api-types'

const mocks = vi.hoisted(() => ({
    snapshot: vi.fn(),
    liveRoom: vi.fn(),
    refetch: vi.fn(),
    retryClick: undefined as (() => void) | undefined,
    identity: null as { memberId: string; token: string; name: string } | null,
    importTarget: undefined as unknown,
}))

vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: ComponentProps<'a'>) => createElement('a', { ...props, href }, children),
}))
vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) =>
        `${namespace}.${key}${values ? `:${Object.values(values).join(',')}` : ''}`,
}))
vi.mock('@/lib/queries', () => ({
    useRoomSnapshot: (...args: unknown[]) => mocks.snapshot(...args),
    // A regression to the live room hook stays renderable so the assertion can
    // report the actual SSE/polling contract violation rather than a mock error.
    useRoomState: (...args: unknown[]) => mocks.liveRoom(...args),
}))
vi.mock('@/lib/use-identity', () => ({
    useRoomIdentity: () => ({ identity: mocks.identity, loaded: true, claim: vi.fn(), forget: vi.fn() }),
}))
vi.mock('@/lib/themes', () => ({ themeVars: () => ({}) }))
vi.mock('@/components/import/SplitwiseImport', () => ({
    SplitwiseImport: ({ targetRoom }: { targetRoom: unknown }) => {
        mocks.importTarget = targetRoom
        return createElement('div', { 'data-testid': 'splitwise-import-stub' })
    },
}))
vi.mock('@/components/room/RoomEmblem', () => ({ RoomEmblem: () => null }))
vi.mock('@/components/room/RoomStates', () => ({
    RoomNotFound: () => createElement('div', { 'data-testid': 'room-not-found' }),
}))
vi.mock('@/components/ui/Icon', () => ({ Icon: () => null }))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        onClick,
        shadowSize: _shadowSize,
        variant: _variant,
        ...props
    }: ComponentProps<'button'> & { shadowSize?: string; variant?: string }) => {
        mocks.retryClick = onClick as (() => void) | undefined
        return createElement('button', { ...props, onClick }, children as ReactNode)
    },
}))

import { ExistingRoomImportScreen } from './ExistingRoomImportScreen'

const state: RoomState = {
    room: {
        id: 'room-1',
        slug: 'summer-trip',
        name: 'Summer trip',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-08-04T00:00:00.000Z',
    },
    members: [],
    expenses: [],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
}

const loaded = (data: RoomState = state) => ({ data, error: null, isPending: false, refetch: mocks.refetch })

describe('ExistingRoomImportScreen room read', () => {
    beforeEach(() => {
        mocks.snapshot.mockReset()
        mocks.liveRoom.mockReset()
        mocks.refetch.mockReset()
        mocks.retryClick = undefined
        mocks.identity = null
        mocks.importTarget = undefined
        mocks.snapshot.mockReturnValue(loaded())
        mocks.liveRoom.mockReturnValue(loaded())
    })

    it('uses the one-shot snapshot and never mounts the realtime/polling room hook', () => {
        const html = renderToStaticMarkup(<ExistingRoomImportScreen slug="summer-trip" />)

        expect(mocks.snapshot).toHaveBeenCalledWith('summer-trip')
        expect(mocks.liveRoom).not.toHaveBeenCalled()
        expect(html).toContain('data-testid="splitwise-import-stub"')
    })

    it('passes the current member id for a visible Split Pro You mapping suggestion', () => {
        mocks.identity = { memberId: 'member-konrad', token: 'token-konrad', name: 'Konrad' }

        renderToStaticMarkup(<ExistingRoomImportScreen slug="summer-trip" />)

        expect(mocks.importTarget).toEqual({
            state,
            memberId: 'member-konrad',
            memberToken: 'token-konrad',
        })
    })

    it('explains a custom target currency before mounting the file importer', () => {
        mocks.snapshot.mockReturnValue(loaded({ ...state, room: { ...state.room, currency: 'BEER' } }))

        const html = renderToStaticMarkup(<ExistingRoomImportScreen slug="summer-trip" />)

        expect(html).toContain('data-testid="import-custom-currency-unsupported"')
        expect(html).toContain('role="alert"')
        expect(html).toContain('import.existing.customCurrencyUnsupportedTitle')
        expect(html).toContain('import.existing.customCurrencyUnsupportedBody:BEER')
        expect(html).not.toContain('data-testid="splitwise-import-stub"')
    })

    it('keeps the recoverable load-error screen wired to an explicit retry', () => {
        mocks.snapshot.mockReturnValue({
            data: undefined,
            error: new Error('connection interrupted'),
            isPending: false,
            refetch: mocks.refetch,
        })

        const html = renderToStaticMarkup(<ExistingRoomImportScreen slug="summer-trip" />)

        expect(html).toContain('import.existing.loadFailed')
        expect(html).toContain('import.existing.tryAgain')
        expect(mocks.retryClick).toBeTypeOf('function')
        mocks.retryClick?.()
        expect(mocks.refetch).toHaveBeenCalledTimes(1)
    })
})
