'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { roomArt } from '@/utils/room-art'
import { Button } from '@/components/ui/Button'
import Loading from '@/components/ui/Loading'
import {
	useRoomQuery,
	useCurrenciesQuery,
	useDeleteExpense,
	useRestoreExpense,
	useDeleteSettlement,
} from '@/hooks/query/split'
import { getStoredMemberId, rememberRoom } from '@/utils/split-identity'
import { toCurrencyMap, formatMoney, CREDIT_GREEN, DEBT_RED } from '@/utils/split-format'
import type { SplitExpense } from '@/services/split.types'
import { IdentityGate } from './IdentityGate'
import { AddExpenseDrawer } from './AddExpenseDrawer'
import { SettleUpDrawer } from './SettleUpDrawer'
import { MemberAvatar } from './MemberAvatar'

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-peanut-repeat-normal min-h-screen">
			<div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-white/90">{children}</div>
		</div>
	)
}

export function RoomView({ slug }: { slug: string }) {
	const roomQ = useRoomQuery(slug)
	const currenciesQ = useCurrenciesQuery()
	const deleteExpense = useDeleteExpense(slug)
	const restoreExpense = useRestoreExpense(slug)
	const deleteSettlement = useDeleteSettlement(slug)

	const [meId, setMeId] = useState<string | null>(null)
	const [addOpen, setAddOpen] = useState(false)
	const [editing, setEditing] = useState<SplitExpense | null>(null)
	const [settleOpen, setSettleOpen] = useState(false)
	const [copied, setCopied] = useState(false)
	const [undo, setUndo] = useState<{ message: string; expenseId: string } | null>(null)
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
	const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => setMeId(getStoredMemberId(slug)), [slug])
	const room = roomQ.data
	useEffect(() => {
		if (room) rememberRoom(room.slug, room.title)
	}, [room])
	useEffect(() => () => void (undoTimer.current && clearTimeout(undoTimer.current)), [])

	const currencies = currenciesQ.data ?? []
	const currencyMap = useMemo(() => toCurrencyMap(currencies), [currencies])
	const byId = useMemo(() => Object.fromEntries((room?.members ?? []).map((m) => [m.id, m])), [room])
	const art = useMemo(() => roomArt(room?.title ?? null), [room?.title])

	if (roomQ.isLoading) {
		return (
			<Shell>
				<div className="flex flex-1 items-center justify-center">
					<Loading />
				</div>
			</Shell>
		)
	}
	if (roomQ.isError || !room) {
		return (
			<Shell>
				<div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
					<div className="text-2xl font-extrabold text-n-1">Room not found</div>
					<div className="text-grey-1">This link may be wrong or the room was removed.</div>
					<a href="/room" className="text-black underline">
						Start a new room
					</a>
				</div>
			</Shell>
		)
	}

	const meInRoom = !!meId && room.members.some((m) => m.id === meId)
	if (!meInRoom) {
		return (
			<Shell>
				<IdentityGate room={room} onPicked={setMeId} />
			</Shell>
		)
	}

	const myNet = BigInt(room.balances.find((b) => b.memberId === meId)?.netMinor ?? '0')

	// Signed relationship to ME from the simplified graph: + they owe me, − I owe them.
	const relToMe = new Map<string, bigint>()
	for (const t of room.suggestedTransfers) {
		if (t.toMemberId === meId)
			relToMe.set(t.fromMemberId, (relToMe.get(t.fromMemberId) ?? 0n) + BigInt(t.amountMinor))
		if (t.fromMemberId === meId)
			relToMe.set(t.toMemberId, (relToMe.get(t.toMemberId) ?? 0n) - BigInt(t.amountMinor))
	}

	const fmt = (minor: bigint) => formatMoney((minor < 0n ? -minor : minor).toString(), room.baseCurrency, currencyMap)

	const share = async () => {
		const url = window.location.href
		// Native share sheet on mobile (the primary invite path); fall back to
		// clipboard, then to a manual prompt so it never silently no-ops.
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({ title: room.title || 'Split room', url })
				return
			} catch {
				return // user dismissed the sheet
			}
		}
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			window.prompt('Copy this link to invite people', url)
		}
	}

	const removeExpense = (e: SplitExpense) => {
		deleteExpense.mutate(e.id)
		if (undoTimer.current) clearTimeout(undoTimer.current)
		setUndo({ message: `Deleted “${e.description}”`, expenseId: e.id })
		undoTimer.current = setTimeout(() => setUndo(null), 6000)
	}
	const doUndo = () => {
		if (undo) restoreExpense.mutate(undo.expenseId)
		if (undoTimer.current) clearTimeout(undoTimer.current)
		setUndo(null)
	}

	return (
		<Shell>
			{/* header — the room's own artwork, derived from its name, so a room
			    looks like the trip it is rather than like every other room */}
			<div
				className="relative flex items-start justify-between gap-3 overflow-hidden border-b border-n-1 p-4"
				style={{ background: `linear-gradient(135deg, ${art.palette.from}, ${art.palette.to})` }}
			>
				<div aria-hidden className="pointer-events-none absolute inset-0 select-none">
					{art.scatter.map((v, i) => (
						<span
							key={i}
							className="absolute opacity-20"
							style={{
								left: `${6 + v * 86}%`,
								top: `${(i * 29 + v * 60) % 70}%`,
								fontSize: `${22 + (i % 3) * 14}px`,
							}}
						>
							{art.motif}
						</span>
					))}
				</div>
				<div className="relative min-w-0 flex-1">
					<div
						className="line-clamp-2 break-words text-xl font-extrabold leading-tight"
						style={{ color: art.palette.ink }}
					>
						<span className="mr-1.5">{art.motif}</span>
						{room.title || 'Split room'}
					</div>
					<div className="mt-0.5 text-sm font-medium opacity-70" style={{ color: art.palette.ink }}>
						{room.members.length} {room.members.length === 1 ? 'person' : 'people'} · {room.baseCurrency}
					</div>
				</div>
				<Button variant="stroke" size="medium" className="relative w-auto shrink-0 px-4" onClick={share}>
					{copied ? 'Copied!' : 'Share'}
				</Button>
			</div>

			<div className="flex flex-1 flex-col gap-5 overflow-auto p-4 pb-48">
				{/* your balance hero */}
				<div className="rounded-sm border border-n-1 bg-white p-5 text-center shadow-[4px_4px_0_0_#000]">
					{myNet === 0n ? (
						<div className="text-lg font-bold text-n-1">
							{room.expenses.length === 0
								? 'Add your first expense to get started 🥜'
								: 'You’re all settled up 🥜'}
						</div>
					) : (
						<>
							<div className="text-sm font-semibold text-grey-1">
								{myNet > 0n ? 'You are owed' : 'You owe'}
							</div>
							<div
								className="text-3xl font-extrabold"
								style={{ color: myNet > 0n ? CREDIT_GREEN : DEBT_RED }}
							>
								{fmt(myNet)}
							</div>
						</>
					)}
				</div>

				{/* balances — everyone else, relative to YOU */}
				{room.members.some((m) => m.id !== meId) && (
					<div className="flex flex-col gap-1">
						<div className="text-sm font-semibold text-grey-1">Balances</div>
						{room.members
							.filter((m) => m.id !== meId)
							.map((m) => {
								const rel = relToMe.get(m.id) ?? 0n
								return (
									<div key={m.id} className="flex items-center gap-3 py-2.5">
										<MemberAvatar name={m.displayName} colorSeed={m.colorSeed} size={32} />
										<span className="flex-1 truncate text-n-1">{m.displayName}</span>
										{rel === 0n ? (
											<span className="text-sm text-grey-1">settled up</span>
										) : (
											<span
												className="text-sm font-bold"
												style={{ color: rel > 0n ? CREDIT_GREEN : DEBT_RED }}
											>
												{rel > 0n ? 'owes you' : 'you owe'} {fmt(rel)}
											</span>
										)}
									</div>
								)
							})}
					</div>
				)}

				{/* expenses feed */}
				<div className="flex flex-col gap-2">
					<div className="text-sm font-semibold text-grey-1">Expenses</div>
					{room.expenses.length === 0 ? (
						<div className="rounded-sm border border-dashed border-grey-1 p-6 text-center text-grey-1">
							No expenses yet. Add the first one below.
						</div>
					) : (
						room.expenses.map((e) => {
							const payer = byId[e.paidByMemberId]
							const converted = e.currency !== room.baseCurrency
							// Personalized share on the row (Splitwise-style) so you see your
							// stake without opening the expense. Amounts are in base currency.
							const iPaid = e.paidByMemberId === meId
							const myShare = BigInt(e.shares.find((s) => s.memberId === meId)?.amountMinor ?? '0')
							const inSplit = e.shares.some((s) => s.memberId === meId)
							const iLent = BigInt(e.baseAmountMinor) - myShare // others' share of what I paid
							return (
								<div
									key={e.id}
									className="flex items-center gap-3 rounded-sm border border-n-1 bg-white p-3"
								>
									<button
										onClick={() => {
											setEditing(e)
											setAddOpen(true)
										}}
										className="min-w-0 flex-1 text-left"
										aria-label={`Edit ${e.description}`}
									>
										<div className="truncate font-semibold text-n-1">{e.description}</div>
										<div className="text-sm text-grey-1">
											{payer ? payer.displayName : 'someone'} paid{' '}
											{formatMoney(e.amountMinor, e.currency, currencyMap)}
											{converted &&
												` · ${formatMoney(e.baseAmountMinor, room.baseCurrency, currencyMap)}`}
										</div>
										{iPaid && iLent > 0n ? (
											<div className="mt-0.5 text-xs font-bold" style={{ color: CREDIT_GREEN }}>
												you lent {fmt(iLent)}
											</div>
										) : !iPaid && inSplit ? (
											<div className="mt-0.5 text-xs font-bold" style={{ color: DEBT_RED }}>
												you owe {fmt(myShare)}
											</div>
										) : !inSplit ? (
											<div className="mt-0.5 text-xs font-medium text-grey-1">not involved</div>
										) : null}
									</button>
									<button
										onClick={() => removeExpense(e)}
										className="flex size-11 shrink-0 items-center justify-center rounded-sm text-grey-1 hover:text-red"
										aria-label="Delete expense"
									>
										✕
									</button>
								</div>
							)
						})
					)}
				</div>

				{/* settlements — visible record, undoable */}
				{room.settlements.length > 0 && (
					<div className="flex flex-col gap-2">
						<div className="text-sm font-semibold text-grey-1">Settled up</div>
						{room.settlements.map((s) => {
							const from = byId[s.fromMemberId]
							const to = byId[s.toMemberId]
							// A Peanut settlement is Peanut telling us the payment
							// completed; a manual one is somebody saying so. They
							// should not look alike.
							const confirmed = s.method === 'PEANUT'
							return (
								<div
									key={s.id}
									className={twMerge(
										'flex items-center gap-2 rounded-sm p-3',
										confirmed
											? 'border border-n-1 bg-primary-3'
											: 'border border-dashed border-grey-1 bg-white/60'
									)}
								>
									<span className="flex-1 text-sm text-n-1">
										{confirmed ? '🥜' : '✓'} {from ? from.displayName : 'someone'} paid{' '}
										{to ? to.displayName : 'someone'}{' '}
										<span className="font-bold">
											{formatMoney(s.amountMinor, room.baseCurrency, currencyMap)}
										</span>
										{confirmed && (
											<span className="mt-0.5 block text-xs font-semibold text-grey-1">
												Confirmed by Peanut
											</span>
										)}
									</span>
									<button
										onClick={() => {
											// A confirmed payment is a fact about
											// money that moved. Removing it should
											// take a deliberate second action.
											if (confirmed && confirmDelete !== s.id) {
												setConfirmDelete(s.id)
												return
											}
											setConfirmDelete(null)
											deleteSettlement.mutate(s.id)
										}}
										className="flex size-10 shrink-0 items-center justify-center rounded-sm text-grey-1 hover:text-red"
										aria-label={confirmed ? 'Remove confirmed payment' : 'Undo settlement'}
									>
										{confirmed && confirmDelete === s.id ? (
											<span className="text-xs font-bold text-red">sure?</span>
										) : (
											'✕'
										)}
									</button>
								</div>
							)
						})}
					</div>
				)}
			</div>

			{/* undo snackbar */}
			{undo && (
				<div className="fixed inset-x-0 bottom-24 z-40 mx-auto flex w-full max-w-xl px-4">
					<div className="flex w-full items-center gap-3 rounded-sm bg-n-1 px-4 py-3 text-white shadow-[4px_4px_0_0_#000]">
						<span className="flex-1 truncate text-sm">{undo.message}</span>
						<button onClick={doUndo} className="font-bold underline">
							Undo
						</button>
					</div>
				</div>
			)}

			{/* sticky actions */}
			<div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-xl border-t border-n-1 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
				<div className="flex gap-2">
					<Button
						variant="purple"
						shadowSize="4"
						className="flex-1"
						onClick={() => {
							setEditing(null)
							roomQ.refetch() // fresh member list so a just-joined person isn't left out of the split
							setAddOpen(true)
						}}
					>
						Add expense
					</Button>
					<Button variant="stroke" className="flex-1" onClick={() => setSettleOpen(true)}>
						Settle up
					</Button>
				</div>
			</div>

			<AddExpenseDrawer
				open={addOpen}
				onOpenChange={(o) => {
					setAddOpen(o)
					if (!o) setEditing(null)
				}}
				room={room}
				meMemberId={meId!}
				currencies={currencies}
				currencyMap={currencyMap}
				editing={editing}
			/>
			<SettleUpDrawer open={settleOpen} onOpenChange={setSettleOpen} room={room} currencyMap={currencyMap} />
		</Shell>
	)
}
