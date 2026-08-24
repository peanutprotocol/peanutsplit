import { prisma } from '@/server/db'
import { labelForOrdinal } from '@/server/history'
import { notFound } from '@/server/http'
import { ROOM_CAPABILITY_REDACTION, redactRoomCapability, sanitizeExportValue } from '@/lib/export-sanitizer'

export { ROOM_CAPABILITY_REDACTION, redactRoomCapability } from '@/lib/export-sanitizer'

export const ROOM_HISTORY_EXPORT_SCHEMA = 'peanut-split-room-history' as const
export const ROOM_HISTORY_EXPORT_VERSION = 1 as const

type HistoryCoverageBasis = 'room_created' | 'room_imported' | 'history_started' | 'unknown'
type EarlierEvents = 'none' | 'unavailable' | 'unknown'

interface HistoryExportSourceEvent {
    id: bigint
    action: string
    subjectType: string | null
    subjectId: string | null
    deviceOrdinal: number | null
    actorMemberId: string | null
    actorMemberName: string | null
    before: unknown
    after: unknown
    detail: unknown
    createdAt: Date
}

interface HistoryExportSourceRoom {
    id: string
    name: string
    currency: string
    createdAt: Date
    auditEvents: HistoryExportSourceEvent[]
}

export interface RoomHistoryExportEvent {
    id: string
    roomId: string
    action: string
    subjectType: string | null
    subjectId: string | null
    /** A stable room-local alias. The persisted device hash never enters the export query. */
    deviceLabel: string | null
    actorMemberId: string | null
    actorMemberName: string | null
    before: unknown
    after: unknown
    detail: unknown
    createdAt: string
}

export interface RoomHistoryExport {
    schema: typeof ROOM_HISTORY_EXPORT_SCHEMA
    version: typeof ROOM_HISTORY_EXPORT_VERSION
    exportedAt: string
    room: {
        id: string
        name: string
        currency: string
        createdAt: string
    }
    historyCoverage: {
        /** The first point from which PeanutSplit can make a completeness claim. */
        beginsAt: string | null
        basis: HistoryCoverageBasis
        earlierEvents: EarlierEvents
        /** Present only for legacy rooms whose earlier actions could not be reconstructed. */
        cutoffEventId: string | null
    }
    redactions: {
        roomLink: 'removed'
        privateFields: 'removed'
        deviceFingerprint: 'not_exported'
    }
    eventCount: number
    /** Complete append-only sequence at export time, in database order (oldest first). */
    events: RoomHistoryExportEvent[]
}

/** Compatibility name retained for the history-export callers and tests. */
export const redactAuditPayload = sanitizeExportValue

const historyCoverage = (events: readonly HistoryExportSourceEvent[]): RoomHistoryExport['historyCoverage'] => {
    const cutoff = events.find((event) => event.action === 'history_started')
    if (cutoff) {
        return {
            beginsAt: cutoff.createdAt.toISOString(),
            basis: 'history_started',
            earlierEvents: 'unavailable',
            cutoffEventId: cutoff.id.toString(),
        }
    }

    const first = events[0]
    if (first?.action === 'room_created' || first?.action === 'room_imported') {
        return {
            beginsAt: first.createdAt.toISOString(),
            basis: first.action,
            earlierEvents: 'none',
            cutoffEventId: null,
        }
    }

    return {
        beginsAt: first?.createdAt.toISOString() ?? null,
        basis: 'unknown',
        earlierEvents: 'unknown',
        cutoffEventId: null,
    }
}

export function buildRoomHistoryExport(
    room: HistoryExportSourceRoom,
    liveSlug: string,
    exportedAt = new Date().toISOString()
): RoomHistoryExport {
    // Callers normally supply Prisma's ordered relation, but sorting here keeps
    // the pure serializer's contract true for tests and future data sources too.
    const events = [...room.auditEvents].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    const value: RoomHistoryExport = {
        schema: ROOM_HISTORY_EXPORT_SCHEMA,
        version: ROOM_HISTORY_EXPORT_VERSION,
        exportedAt,
        room: {
            id: room.id,
            name: room.name,
            currency: room.currency,
            createdAt: room.createdAt.toISOString(),
        },
        historyCoverage: historyCoverage(events),
        redactions: {
            roomLink: 'removed',
            privateFields: 'removed',
            deviceFingerprint: 'not_exported',
        },
        eventCount: events.length,
        events: events.map((event) => ({
            id: event.id.toString(),
            roomId: room.id,
            action: event.action,
            subjectType: event.subjectType,
            subjectId: event.subjectId,
            deviceLabel: labelForOrdinal(event.deviceOrdinal),
            actorMemberId: event.actorMemberId,
            actorMemberName: event.actorMemberName,
            before: event.before,
            after: event.after,
            detail: event.detail,
            createdAt: event.createdAt.toISOString(),
        })),
    }

    return redactAuditPayload(value, liveSlug) as RoomHistoryExport
}

export function serializeRoomHistoryExport(value: RoomHistoryExport): string {
    return `${JSON.stringify(value, null, 2)}\n`
}

/** ASCII-only attachment name derived from the display name, never the bearer slug. */
export function roomHistoryExportFilename(roomName: string, liveSlug: string): string {
    const stem =
        redactRoomCapability(roomName, liveSlug)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48)
            .replace(/-$/g, '') || 'room'
    return `${stem}-history.json`
}

export async function roomHistoryExportBySlug(
    slug: string,
    exportedAt = new Date().toISOString()
): Promise<{ body: string; filename: string }> {
    // Explicit selection is a security boundary: actorDeviceHash and the live
    // slug are never materialized in the export object in the first place.
    const room = await prisma.room.findUnique({
        where: { slug },
        select: {
            id: true,
            name: true,
            currency: true,
            createdAt: true,
            auditEvents: {
                orderBy: { id: 'asc' },
                select: {
                    id: true,
                    action: true,
                    subjectType: true,
                    subjectId: true,
                    deviceOrdinal: true,
                    actorMemberId: true,
                    actorMemberName: true,
                    before: true,
                    after: true,
                    detail: true,
                    createdAt: true,
                },
            },
        },
    })
    if (!room) throw notFound('room not found')

    return {
        body: serializeRoomHistoryExport(buildRoomHistoryExport(room, slug, exportedAt)),
        filename: roomHistoryExportFilename(room.name, slug),
    }
}
