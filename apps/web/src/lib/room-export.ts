import type { ApiExpense, ApiMember, ApiRoom, ApiSettlement, ApiTransfer, RoomState } from './api-types'
import { sanitizeExportValue } from './export-sanitizer'

/**
 * A portable room snapshot. The bearer slug is deliberately absent: exported
 * files may be emailed, backed up or attached to a ticket, and none of those
 * copies should also be able to open the live room.
 */
export interface PortableRoom {
    schema: 'peanut-split-room'
    /** V2 adds first-class PERCENTAGE/SHARES modes and per-share splitWeight. */
    version: 2
    exportedAt: string
    room: Omit<ApiRoom, 'id' | 'slug' | 'analyticsKey' | 'coverUrl'>
    members: ApiMember[]
    expenses: ApiExpense[]
    settlements: ApiSettlement[]
    balances: Record<string, string>
    suggestedTransfers: ApiTransfer[]
}

type SanitizedRoomState = Omit<RoomState, 'room'> & {
    room: Omit<ApiRoom, 'slug' | 'analyticsKey'>
}

export function portableRoom(state: RoomState, exportedAt = new Date().toISOString()): PortableRoom {
    const { id: _id, slug: liveSlug, analyticsKey: _analyticsKey, coverUrl: _coverUrl, ...room } = state.room

    const snapshot: PortableRoom = {
        schema: 'peanut-split-room',
        version: 2,
        exportedAt,
        room,
        members: state.members,
        expenses: state.expenses,
        settlements: state.settlements,
        balances: state.balances,
        suggestedTransfers: state.suggestedTransfers,
    }

    return sanitizeExportValue(snapshot, liveSlug) as PortableRoom
}

export function roomJson(state: RoomState, exportedAt?: string): string {
    return `${JSON.stringify(portableRoom(state, exportedAt), null, 2)}\n`
}

type CsvCell = string | null | undefined

const csvCell = (value: CsvCell): string => {
    const raw = value ?? ''
    return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

/** Quoted CSV cells can still execute as spreadsheet formulas. Apply this only
 * to user-authored text; money cells must remain numeric and machine-readable. */
const spreadsheetText = (value: string | null | undefined): string | null | undefined =>
    value && /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value

const CSV_HEADERS = [
    'record_type',
    'id',
    'parent_id',
    'member_id',
    'name_or_description',
    'amount_minor',
    'currency',
    'base_amount_minor',
    'entered_amount_minor',
    'split_weight',
    'fx_rate',
    'split_mode',
    'paid_by_id',
    'from_id',
    'to_id',
    'created_by_id',
    'method',
    'note',
    'date',
    'created_at',
    'receipt_url',
    'member_status',
    'removed_at',
] as const

const row = (...cells: CsvCell[]): string => cells.map(csvCell).join(',')
const dataRow = (...cells: CsvCell[]): string =>
    row(...cells, ...Array<CsvCell>(Math.max(0, CSV_HEADERS.length - cells.length)).fill(''))

/**
 * A normalized CSV: expenses, shares and settlements are separate records so
 * exact shares and frozen FX provenance are not flattened away.
 */
export function roomCsv(state: RoomState): string {
    // Sanitize the whole projected source before formula escaping or CSV
    // quoting, so every current and future free-text/URL field gets the same
    // capability treatment as portable JSON and history exports.
    const safeState = sanitizeExportValue(state, state.room.slug) as SanitizedRoomState
    const rows: string[] = [row(...CSV_HEADERS)]

    rows.push(
        dataRow(
            'room',
            '',
            '',
            '',
            spreadsheetText(safeState.room.name),
            '',
            safeState.room.currency,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            safeState.room.createdAt,
            ''
        )
    )

    for (const member of safeState.members) {
        rows.push(
            dataRow(
                'member',
                member.id,
                '',
                member.id,
                spreadsheetText(member.name),
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                member.createdAt,
                '',
                member.removedAt ? 'FORMER' : 'ACTIVE',
                member.removedAt ?? ''
            )
        )
    }

    for (const expense of safeState.expenses) {
        rows.push(
            dataRow(
                'expense',
                expense.id,
                '',
                '',
                spreadsheetText(expense.description),
                expense.amountMinor,
                expense.currency,
                expense.baseAmountMinor,
                '',
                '',
                expense.fxRate,
                expense.splitMode,
                expense.paidById,
                '',
                '',
                expense.createdById,
                '',
                '',
                expense.date,
                expense.createdAt,
                ''
            )
        )
        for (const share of expense.shares) {
            rows.push(
                dataRow(
                    'share',
                    '',
                    expense.id,
                    share.memberId,
                    '',
                    share.amountMinor,
                    safeState.room.currency,
                    '',
                    share.enteredAmountMinor,
                    share.splitWeight,
                    expense.fxRate,
                    expense.splitMode,
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    expense.date,
                    expense.createdAt,
                    ''
                )
            )
        }
    }

    for (const settlement of safeState.settlements) {
        rows.push(
            dataRow(
                'settlement',
                settlement.id,
                '',
                '',
                '',
                settlement.amountMinor,
                safeState.room.currency,
                '',
                '',
                '',
                '',
                '',
                '',
                settlement.fromId,
                settlement.toId,
                settlement.createdById,
                spreadsheetText(settlement.method),
                spreadsheetText(settlement.note),
                settlement.createdAt,
                settlement.createdAt,
                spreadsheetText(settlement.receiptUrl)
            )
        )
    }

    for (const [memberId, amountMinor] of Object.entries(safeState.balances)) {
        rows.push(
            dataRow(
                'balance',
                '',
                '',
                memberId,
                '',
                amountMinor,
                safeState.room.currency,
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                ''
            )
        )
    }

    for (const transfer of safeState.suggestedTransfers) {
        rows.push(
            dataRow(
                'suggested_transfer',
                '',
                '',
                '',
                '',
                transfer.amountMinor,
                safeState.room.currency,
                '',
                '',
                '',
                '',
                '',
                '',
                transfer.fromId,
                transfer.toId,
                '',
                '',
                '',
                '',
                '',
                ''
            )
        )
    }

    return `${rows.join('\r\n')}\r\n`
}

/**
 * The caller historically passed only the display name, which can itself
 * contain a pasted room link. Without the live slug there is no sound way to
 * distinguish that credential from ordinary words, so snapshot names stay
 * deliberately generic.
 */
export function exportFilename(_roomName: string, extension: 'csv' | 'json'): string {
    return `split-room.${extension}`
}
