import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ApiMember, ApiRoom } from '@/lib/api-types'

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) =>
        `${namespace}.${key}${values ? `:${Object.values(values).join(',')}` : ''}`,
}))

vi.mock('@/components/ui/BaseInput', () => ({
    BaseInput: ({ variant: _variant, ...props }: ComponentProps<'input'> & { variant?: string }) =>
        createElement('input', props),
}))

import { ExistingRoomImportContext, ExistingRoomImportFields } from './ExistingRoomImportFields'

const room: ApiRoom = {
    id: 'room-1',
    slug: 'summer-trip',
    name: 'Summer trip',
    emoji: null,
    currency: 'USD',
    coverUrl: null,
    theme: null,
    createdAt: '2026-08-04T00:00:00.000Z',
    archivedAt: null,
}

const members: ApiMember[] = [
    { id: 'ana', name: 'Ana', avatar: null, createdAt: '2026-08-04T00:00:00.000Z' },
    { id: 'cleo', name: 'Cleo', avatar: null, createdAt: '2026-08-04T00:00:00.000Z' },
]

describe('ExistingRoomImportContext', () => {
    it('names the exact target, fixes its settlement currency and discloses replay/overlap behavior', () => {
        const html = renderToStaticMarkup(<ExistingRoomImportContext room={room} />)

        expect(html).toContain('data-testid="import-target-room"')
        expect(html).toContain('Summer trip')
        expect(html).toContain('data-testid="import-target-currency">USD')
        expect(html).toContain('data-testid="import-repeat-warning"')
        expect(html).toContain('import.existing.repeatBody')
    })
})

describe('ExistingRoomImportFields', () => {
    it('renders one explicit target choice per source person and a name only for proposed additions', () => {
        const html = renderToStaticMarkup(
            <ExistingRoomImportFields
                roomName={room.name}
                members={members}
                drafts={[
                    { sourceName: 'Ana', memberId: 'ana', newMemberName: 'Ana' },
                    { sourceName: 'Bruno', memberId: null, newMemberName: 'Bruno' },
                ]}
                onChange={() => undefined}
                problem={null}
            />
        )

        expect(html.match(/data-testid="import-member-mapping"/g)).toHaveLength(2)
        expect(html.match(/data-testid="import-member-target"/g)).toHaveLength(2)
        expect(html.match(/data-testid="import-new-member-name"/g)).toHaveLength(1)
        expect(html).toContain('data-member="Ana"')
        expect(html).toContain('data-member="Bruno"')
        expect(html).toContain('<option value="ana" selected="">Ana</option>')
        expect(html).toContain('<option value="ana" disabled="">Ana</option>')
    })

    it('places mapping validation next to the reviewed roster', () => {
        const html = renderToStaticMarkup(
            <ExistingRoomImportFields
                roomName={room.name}
                members={members}
                drafts={[{ sourceName: 'Bruno', memberId: null, newMemberName: '' }]}
                onChange={() => undefined}
                problem="Every new person needs a name."
            />
        )

        expect(html).toContain('role="alert"')
        expect(html).toContain('data-testid="import-mapping-error"')
        expect(html).toContain('Every new person needs a name.')
    })
})
