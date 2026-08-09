import { prisma } from '@/server/db'
import { labelForOrdinal } from '@/server/history'
import { notFound } from '@/server/http'

export const ROOM_HISTORY_EXPORT_SCHEMA = 'peanut-split-room-history' as const
export const ROOM_HISTORY_EXPORT_VERSION = 1 as const
export const ROOM_CAPABILITY_REDACTION = '[REDACTED_ROOM_CAPABILITY]' as const

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

/**
 * Audit payloads are deliberately extensible JSON. Scrub recursively rather
 * than trusting today's writers: an older or future event must not turn a room
 * capability, member proof, push credential, or device fingerprint into a
 * durable file in somebody's Downloads directory.
 *
 * Conservative name/fragment matching catches future variants such as
 * `push_auth_token`; a narrow allowlist keeps harmless audit facts such as
 * `tokenRotated: true`.
 */
const SECRET_FIELD_NAMES = new Set([
    'slug',
    'roomslug',
    'capability',
    'roomcapability',
    'token',
    'tokens',
    'membertoken',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'authtoken',
    'secrettoken',
    'secret',
    'secrets',
    'clientsecret',
    'apikey',
    'privatekey',
    'authorization',
    'auth',
    'cookie',
    'cookies',
    'credential',
    'credentials',
    'password',
    'passcode',
    'keys',
    'p256dh',
    'endpoint',
    'useragent',
    'actordevicehash',
    'devicehash',
])
const SECRET_FIELD_FRAGMENT = /(token|secret|password|passcode|credential|authorization|cookie|privatekey|apikey)/
const SAFE_SECURITY_METADATA_FIELDS = new Set(['tokenrotated'])

const normalizedFieldName = (key: string): string =>
    key
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
const secretField = (key: string): boolean => {
    const normalized = normalizedFieldName(key)
    return (
        !SAFE_SECURITY_METADATA_FIELDS.has(normalized) &&
        (SECRET_FIELD_NAMES.has(normalized) || SECRET_FIELD_FRAGMENT.test(normalized))
    )
}
const regexEscape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replace the live bearer value wherever it was embedded (for example in a URL or note). */
export function redactRoomCapability(value: string, liveSlug: string): string {
    if (!liveSlug) return value
    const variants = [...new Set([liveSlug, encodeURIComponent(liveSlug)])]
    return variants.reduce(
        (redacted, variant) =>
            variant ? redacted.replace(new RegExp(regexEscape(variant), 'gi'), ROOM_CAPABILITY_REDACTION) : redacted,
        value
    )
}

export function redactAuditPayload(value: unknown, liveSlug: string): unknown {
    if (typeof value === 'string') return redactRoomCapability(value, liveSlug)
    if (Array.isArray(value)) return value.map((item) => redactAuditPayload(item, liveSlug))
    if (value === null || typeof value !== 'object') return value

    const entries: [string, unknown][] = []
    for (const [key, item] of Object.entries(value)) {
        if (secretField(key) || redactRoomCapability(key, liveSlug) !== key) continue
        entries.push([key, redactAuditPayload(item, liveSlug)])
    }
    // Object.fromEntries creates a data property for hostile keys such as
    // `__proto__`; assigning those keys onto `{}` would mutate its prototype.
    return Object.fromEntries(entries)
}

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
