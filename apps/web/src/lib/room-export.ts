import type { ApiExpense, ApiMember, ApiRoom, ApiSettlement, ApiTransfer, RoomState } from './api-types'

/**
 * A portable room snapshot. The bearer slug is deliberately absent: exported
 * files may be emailed, backed up or attached to a ticket, and none of those
 * copies should also be able to open the live room.
 */
export interface PortableRoom {
    schema: 'peanut-split-room'
    version: 1
    exportedAt: string
    room: Omit<ApiRoom, 'id' | 'slug' | 'coverUrl'>
    members: ApiMember[]
    expenses: ApiExpense[]
    settlements: ApiSettlement[]
    balances: Record<string, string>
    suggestedTransfers: ApiTransfer[]
}

export function portableRoom(state: RoomState, exportedAt = new Date().toISOString()): PortableRoom {
    const { id: _id, slug: _slug, coverUrl: _coverUrl, ...room } = state.room

    return {
        schema: 'peanut-split-room',
        version: 1,
        exportedAt,
        room,
        members: state.members,
        expenses: state.expenses,
        settlements: state.settlements,
        balances: state.balances,
        suggestedTransfers: state.suggestedTransfers,
    }
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
] as const

const row = (...cells: CsvCell[]): string => cells.map(csvCell).join(',')

/**
 * A normalized CSV: expenses, shares and settlements are separate records so
 * exact shares and frozen FX provenance are not flattened away.
 */
export function roomCsv(state: RoomState): string {
    const rows: string[] = [row(...CSV_HEADERS)]

    rows.push(
        row(
            'room',
            '',
            '',
            '',
            spreadsheetText(state.room.name),
            '',
            state.room.currency,
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
            state.room.createdAt,
            ''
        )
    )

    for (const member of state.members) {
        rows.push(
            row(
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
                member.createdAt,
                ''
            )
        )
    }

    for (const expense of state.expenses) {
        rows.push(
            row(
                'expense',
                expense.id,
                '',
                '',
                spreadsheetText(expense.description),
                expense.amountMinor,
                expense.currency,
                expense.baseAmountMinor,
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
                row(
                    'share',
                    '',
                    expense.id,
                    share.memberId,
                    '',
                    share.amountMinor,
                    state.room.currency,
                    '',
                    share.enteredAmountMinor,
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

    for (const settlement of state.settlements) {
        rows.push(
            row(
                'settlement',
                settlement.id,
                '',
                '',
                '',
                settlement.amountMinor,
                state.room.currency,
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

    for (const [memberId, amountMinor] of Object.entries(state.balances)) {
        rows.push(
            row(
                'balance',
                '',
                '',
                memberId,
                '',
                amountMinor,
                state.room.currency,
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

    for (const transfer of state.suggestedTransfers) {
        rows.push(
            row(
                'suggested_transfer',
                '',
                '',
                '',
                '',
                transfer.amountMinor,
                state.room.currency,
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

export function exportFilename(roomName: string, extension: 'csv' | 'json'): string {
    const stem =
        roomName
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48) || 'split-room'
    return `${stem}.${extension}`
}
