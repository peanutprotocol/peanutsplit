import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomState } from '@/lib/api-types'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
let openImporter: (() => void) | undefined

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) =>
        `${namespace}.${key}${values ? `:${Object.values(values).join(',')}` : ''}`,
}))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        shadowSize: _shadowSize,
        variant: _variant,
        ...props
    }: ComponentProps<'button'> & { shadowSize?: string; variant?: string; 'data-testid'?: string }) => {
        if (props['data-testid'] === 'open-splitwise-import') openImporter = props.onClick as () => void
        return createElement('button', props, children)
    },
}))
vi.mock('@/components/ui/CloseButton', () => ({ CloseButton: () => null }))
vi.mock('@/components/ui/Drawer', () => ({
    Drawer: ({ children }: { children?: ReactNode }) => children,
    DrawerContent: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerHeader: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerTitle: ({ children, ...props }: ComponentProps<'h2'>) => createElement('h2', props, children),
}))
vi.mock('@/components/ui/DrawerLayout', () => ({
    DrawerBody: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    drawerContentClass: '',
    drawerHeaderClass: '',
}))
vi.mock('@/components/ui/SettingRow', () => ({
    SettingRow: ({ label, value }: { label: string; value: string }) => createElement('div', null, `${label}|${value}`),
}))

import { RoomExport } from './RoomExport'

const state: RoomState = {
    room: {
        id: 'room-1',
        slug: 'summer/trip?secret=yes',
        name: 'Summer trip',
        emoji: null,
        currency: 'USD',
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

describe('RoomExport current-room importer', () => {
    beforeEach(() => {
        push.mockReset()
        openImporter = undefined
    })

    it('launches the importer under the exact room path instead of the global create-room tool', () => {
        const html = renderToStaticMarkup(<RoomExport state={state} />)

        expect(html).toContain('room.export.importBody')
        expect(openImporter).toBeTypeOf('function')
        openImporter?.()
        expect(push).toHaveBeenCalledWith('/r/summer%2Ftrip%3Fsecret%3Dyes/import')
        expect(push).not.toHaveBeenCalledWith('/import')
    })

    it('presents a custom-currency room as export-only before opening any importer', () => {
        const html = renderToStaticMarkup(
            <RoomExport state={{ ...state, room: { ...state.room, currency: 'BEER' } }} />
        )

        expect(html).toContain('room.header.exportOnly|room.header.exportFormats')
        expect(html).toContain('import.existing.customCurrencyUnsupportedTitle')
        expect(html).toContain('import.existing.customCurrencyUnsupportedBody:BEER')
        expect(html).not.toContain('data-testid="open-splitwise-import"')
        expect(openImporter).toBeUndefined()
    })
})
