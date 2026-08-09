import { describe, expect, it } from 'vitest'
import {
    buildRoomHistoryExport,
    redactAuditPayload,
    roomHistoryExportFilename,
    serializeRoomHistoryExport,
} from './history-export'

const at = (value: string) => new Date(value)

describe('room history export serialization', () => {
    it('orders every safe event field, maps device ordinals, and states the legacy cutoff', () => {
        const slug = 'ski-trip-Qx7_CAPABILITY'
        const exported = buildRoomHistoryExport(
            {
                id: 'room-id',
                name: `Archive of ${slug}`,
                currency: 'EUR',
                createdAt: at('2025-01-01T00:00:00.000Z'),
                auditEvents: [
                    {
                        id: 12n,
                        action: 'expense_deleted',
                        subjectType: 'expense',
                        subjectId: 'expense-id',
                        deviceOrdinal: 27,
                        actorMemberId: 'member-id',
                        actorMemberName: `Ana ${slug}`,
                        before: { description: 'Dinner' },
                        after: { deletedAt: '2026-08-03T12:01:00.000Z' },
                        detail: null,
                        createdAt: at('2026-08-03T12:01:00.000Z'),
                    },
                    {
                        id: 11n,
                        action: 'history_started',
                        subjectType: 'room',
                        subjectId: 'room-id',
                        deviceOrdinal: null,
                        actorMemberId: null,
                        actorMemberName: null,
                        before: null,
                        after: null,
                        detail: { reason: 'Earlier actions are unavailable.' },
                        createdAt: at('2026-08-03T12:00:00.000Z'),
                    },
                ],
            },
            slug,
            '2026-08-09T10:00:00.000Z'
        )

        expect(exported).toMatchObject({
            schema: 'peanut-split-room-history',
            version: 1,
            exportedAt: '2026-08-09T10:00:00.000Z',
            historyCoverage: {
                beginsAt: '2026-08-03T12:00:00.000Z',
                basis: 'history_started',
                earlierEvents: 'unavailable',
                cutoffEventId: '11',
            },
            redactions: {
                roomLink: 'removed',
                privateFields: 'removed',
                deviceFingerprint: 'not_exported',
            },
            eventCount: 2,
        })
        expect(exported.events.map((event) => event.id)).toEqual(['11', '12'])
        expect(exported.events[1]).toMatchObject({
            roomId: 'room-id',
            action: 'expense_deleted',
            deviceLabel: 'AA',
            before: { description: 'Dinner' },
            after: { deletedAt: '2026-08-03T12:01:00.000Z' },
        })
        expect(serializeRoomHistoryExport(exported).endsWith('\n')).toBe(true)
        expect(JSON.stringify(exported)).not.toContain(slug)
    })

    it('recursively removes secret-bearing fields and embedded capability values without erasing audit facts', () => {
        const slug = 'room-AbCd_1234'
        const redacted = redactAuditPayload(
            {
                slug,
                room_slug: slug,
                memberToken: 'member-proof',
                custom_token: 'another-proof',
                secret: 'secret-value',
                api_secret: 'api-secret-value',
                nested: [
                    {
                        url: `https://split.test/r/${slug}?from=export`,
                        note: `Upper-case echo: ${slug.toUpperCase()}`,
                        tokenRotated: true,
                    },
                ],
                [`key-${slug}`]: 'a capability-bearing object key',
                ordinary: { amountMinor: '1000' },
            },
            slug
        )
        const serialized = JSON.stringify(redacted)

        expect(serialized).not.toContain(slug)
        expect(serialized.toLowerCase()).not.toContain(slug.toLowerCase())
        expect(serialized).not.toContain('member-proof')
        expect(serialized).not.toContain('another-proof')
        expect(serialized).not.toContain('secret-value')
        expect(serialized).not.toContain('api-secret-value')
        expect(redacted).toEqual({
            nested: [
                {
                    url: 'https://split.test/r/[REDACTED_ROOM_CAPABILITY]?from=export',
                    note: 'Upper-case echo: [REDACTED_ROOM_CAPABILITY]',
                    tokenRotated: true,
                },
            ],
            ordinary: { amountMinor: '1000' },
        })
    })

    it('makes an injection-safe ASCII filename from the display name and strips an accidental capability echo', () => {
        const slug = 'summer-room-LiveCapability_123'
        const filename = roomHistoryExportFilename(`Málaga / ${slug}\r\ntrip`, slug)

        expect(filename).toBe('malaga-redacted-room-capability-trip-history.json')
        expect(filename).not.toContain(slug)
        expect(filename).not.toMatch(/["\\\r\n/]/)
    })
})
