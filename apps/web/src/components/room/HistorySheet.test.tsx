import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RoomState } from '@/lib/api-types'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        icon: _icon,
        loading: _loading,
        ...props
    }: ComponentProps<'button'> & { icon?: string; loading?: boolean }) => createElement('button', props, children),
}))
vi.mock('@/components/ui/CloseButton', () => ({ CloseButton: () => null }))
vi.mock('@/components/ui/Drawer', () => ({
    Drawer: ({ children }: { children?: ReactNode }) => children,
    DrawerContent: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerHeader: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerTitle: ({ children, ...props }: ComponentProps<'h1'>) => createElement('h1', props, children),
}))
vi.mock('@/components/ui/DrawerLayout', () => ({
    DrawerActions: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerBody: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
}))
vi.mock('@/lib/queries', () => ({
    useRoomHistory: () => ({
        data: undefined,
        isPending: false,
        isError: true,
        refetch: vi.fn(),
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
    }),
}))
vi.mock('./HistoryStats', () => ({
    HistoryStats: () => createElement('div', { 'data-testid': 'stats-still-visible' }),
}))

import { HistorySheet } from './HistorySheet'

const state: RoomState = {
    room: {
        id: 'room-id',
        slug: 'room-capability',
        name: 'Room',
        emoji: null,
        currency: 'EUR',
        coverUrl: null,
        theme: null,
        createdAt: '2026-01-01T00:00:00.000Z',
    },
    members: [],
    expenses: [],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
}

describe('HistorySheet', () => {
    it('keeps cached room stats and the full-log action available when activity loading fails', () => {
        const html = renderToStaticMarkup(
            <HistorySheet open onClose={() => undefined} slug={state.room.slug} state={state} />
        )

        expect(html).toContain('data-testid="stats-still-visible"')
        expect(html).toContain('role="alert"')
        expect(html).toContain('failed')
        expect(html).toContain('data-testid="history-download"')
        expect(html).toContain('downloadHint')
        expect(html).toContain('download')
    })
})
