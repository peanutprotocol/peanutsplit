import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RoomState } from '@/lib/api-types'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

vi.mock('@/components/pwa/PushOptIn', () => ({ PushOptIn: () => null }))
vi.mock('@/components/room/PeopleSection', () => ({ PeopleSection: () => null }))
vi.mock('@/components/room/RoomEmblem', () => ({
    RoomEmblem: ({ value }: { value: string | null }) => createElement('span', { 'data-room-emblem': value ?? 'auto' }),
}))
vi.mock('@/components/room/RoomExport', () => ({ RoomExport: () => null }))
vi.mock('@/components/room/ThemePicker', () => ({ ThemePicker: () => null }))
vi.mock('@/components/ui/BaseInput', () => ({
    BaseInput: (props: ComponentProps<'input'>) => createElement('input', props),
}))
vi.mock('@/components/ui/Button', () => ({
    Button: ({
        children,
        icon: _icon,
        shadowSize: _shadowSize,
        ...props
    }: ComponentProps<'button'> & { icon?: string; shadowSize?: string }) => createElement('button', props, children),
}))
vi.mock('@/components/ui/CloseButton', () => ({ CloseButton: () => null }))
vi.mock('@/components/ui/Drawer', () => ({
    Drawer: ({ children }: { children?: ReactNode }) => children,
    DrawerContent: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerHeader: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerTitle: ({ children, ...props }: ComponentProps<'h2'>) => createElement('h2', props, children),
}))
vi.mock('@/components/ui/DrawerLayout', () => ({
    DrawerActions: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerBody: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    drawerContentClass: '',
    drawerHeaderClass: '',
}))
vi.mock('@/components/ui/Doodle', () => ({
    Doodle: ({ name }: { name: string }) => createElement('span', { 'data-rendered-doodle': name }),
}))
vi.mock('@/components/ui/Icon', () => ({
    Icon: ({ name }: { name: string }) => createElement('span', { 'data-room-picker-icon': name }),
}))
vi.mock('@/components/ui/SettingRow', () => ({
    SettingRow: ({
        label,
        value,
        trailing,
        testId,
    }: {
        label: string
        value?: string
        trailing?: ReactNode
        testId: string
    }) => createElement('div', { 'data-testid': testId }, label, value, trailing),
}))
vi.mock('@/components/ui/SlideToConfirm', () => ({ SlideToConfirm: () => null }))
vi.mock('@/lib/analytics', () => ({ roomProps: () => ({}), track: () => undefined }))
vi.mock('@/lib/clipboard', () => ({ copyText: async () => true }))
vi.mock('@/lib/error-messages', () => ({ useErrorMessage: () => () => 'error' }))
vi.mock('@/lib/queries', () => ({
    useSetEmblem: () => ({ isPending: false, mutate: vi.fn() }),
    useSetRoomName: () => ({ isPending: false, mutate: vi.fn() }),
    useSetTheme: () => ({ isPending: false, mutate: vi.fn() }),
}))
vi.mock('@/lib/use-settings', () => ({ useFeedback: () => () => undefined }))
vi.mock('./DeviceSheet', () => ({ DeviceSheet: () => null }))
vi.mock('./FeedbackReportDrawer', () => ({ FeedbackReportDrawer: () => null }))
vi.mock('./HistorySheet', () => ({ HistorySheet: () => null }))
vi.mock('./RoomDrawingEditor', () => ({ RoomDrawingEditor: () => null }))

import { ROOM_DOODLES } from './DoodlePicker'
import { SettingsSheet } from './SettingsSheet'

const state: RoomState = {
    room: {
        id: 'room-1',
        slug: 'summer-trip',
        name: 'Summer trip',
        emoji: null,
        currency: 'USD',
        coverUrl: null,
        theme: null,
        createdAt: '2026-08-03T10:00:00.000Z',
    },
    members: [],
    expenses: [],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
}

const renderSettings = () =>
    renderToStaticMarkup(
        <SettingsSheet
            open
            onClose={() => undefined}
            room={state.room}
            members={state.members}
            state={state}
            identity={null}
            me={null}
            onShare={() => undefined}
            onForgetIdentity={() => undefined}
            onOpenCharacter={() => undefined}
        />
    )

describe('SettingsSheet room drawing picker', () => {
    it('wires the private problem report into room settings', () => {
        const html = renderSettings()

        expect(html).toContain('data-testid="feedback-report-row"')
        expect(html).toContain('room.header.reportProblem')
        expect(html).toContain('room.header.reportProblemHint')
    })

    it('offers the custom drawing after every preset inside room settings', () => {
        const html = renderSettings()
        const offeredDrawings = [...html.matchAll(/data-doodle="([^"]+)"/g)].map((match) => match[1])
        const radioGroupEnd = html.indexOf('</div>', html.indexOf('role="radiogroup"'))

        expect(offeredDrawings).toEqual([...ROOM_DOODLES, 'custom'])
        expect(radioGroupEnd).toBeGreaterThan(-1)
        expect(html.indexOf('data-testid="room-card"')).toBeLessThan(html.indexOf('data-doodle="custom"'))
        expect(html.indexOf('data-doodle="custom"')).toBeGreaterThan(radioGroupEnd)
        expect(html).toContain('aria-label="room.create.drawYourOwn"')
    })

    it('does not present the custom room drawing as a pencil room icon', () => {
        const html = renderSettings()

        expect(html).not.toContain('data-room-picker-icon="pencil"')
        expect(html).not.toContain('data-rendered-doodle="iconpencil"')
    })
})
