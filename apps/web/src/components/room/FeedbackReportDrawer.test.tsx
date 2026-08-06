import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RoomState } from '@/lib/api-types'

vi.mock('next-intl', () => ({
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
        `${namespace}.${key}${values ? `:${Object.values(values).join(',')}` : ''}`,
}))
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
    DrawerTitle: ({ children, ...props }: ComponentProps<'h2'>) => createElement('h2', props, children),
}))
vi.mock('@/components/ui/DrawerLayout', () => ({
    DrawerActions: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
    DrawerBody: ({ children, ...props }: ComponentProps<'div'>) => createElement('div', props, children),
}))
vi.mock('@/components/ui/SettingToggle', () => ({
    SettingToggle: ({
        label,
        hint,
        checked,
        testId,
    }: {
        label: string
        hint?: string
        checked: boolean
        testId: string
    }) => createElement('button', { role: 'switch', 'aria-checked': checked, 'data-testid': testId }, label, hint),
}))
vi.mock('@/lib/api', () => ({ api: { feedback: { report: vi.fn() } } }))
vi.mock('@/lib/error-messages', () => ({ useErrorMessage: () => () => 'error' }))
vi.mock('@/lib/use-settings', () => ({ useFeedback: () => () => undefined }))

import { FeedbackReportDrawer } from './FeedbackReportDrawer'

const state: RoomState = {
    room: {
        id: 'room-1',
        slug: 'private-room-slug',
        name: 'Ski trip',
        emoji: null,
        currency: 'ARS',
        coverUrl: null,
        theme: null,
        createdAt: '2026-08-06T10:00:00.000Z',
    },
    members: [],
    expenses: [],
    settlements: [],
    balances: {},
    suggestedTransfers: [],
}

describe('FeedbackReportDrawer consent defaults', () => {
    it('starts with every data attachment and final consent off', () => {
        const html = renderToStaticMarkup(<FeedbackReportDrawer open onClose={() => undefined} state={state} />)

        for (const testId of ['feedback-device-toggle', 'feedback-room-toggle', 'feedback-consent-toggle']) {
            expect(html).toContain(`data-testid="${testId}"`)
        }
        expect(html.match(/aria-checked="false"/g)).toHaveLength(3)
        expect(html).not.toContain('private-room-slug')
        expect(html).toContain('room.feedback.scopeNote:Ski trip')
        expect(html).toContain('room.feedback.consentHint')
        expect(html).toContain('data-testid="feedback-submit"')
        expect(html).toMatch(/<button disabled=""[^>]*data-testid="feedback-submit"/)
        expect(html).toContain('room.feedback.attachmentsIntro')
    })
})
