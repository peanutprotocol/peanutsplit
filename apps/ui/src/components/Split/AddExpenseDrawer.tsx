'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { BaseInput } from '@/components/ui/BaseInput'
import { MemberAvatar } from './MemberAvatar'
import { useAddExpense, useUpdateExpense, useRateQuery } from '@/hooks/query/split'
import { toMinorString, formatMoney, type CurrencyMap } from '@/utils/split-format'
import type { RoomState, CurrencyInfo, SplitKind, SplitExpense } from '@/services/split.types'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	room: RoomState
	meMemberId: string
	currencies: CurrencyInfo[]
	currencyMap: CurrencyMap
	/** When set, the drawer edits this expense (PATCH) instead of adding a new one. */
	editing?: SplitExpense | null
}

const FIELD = 'h-14' // one control height across the whole form

/** BigInt-safe minor→major (avoids Number float artifacts on money). */
function minorToMajor(minor: string, decimals: number): string {
	const neg = minor.startsWith('-')
	const abs = (neg ? minor.slice(1) : minor).replace(/^0+(?=\d)/, '') || '0'
	if (decimals === 0) return (neg ? '-' : '') + abs
	const padded = abs.padStart(decimals + 1, '0')
	const whole = padded.slice(0, -decimals)
	const frac = padded.slice(-decimals).replace(/0+$/, '')
	return (neg ? '-' : '') + whole + (frac ? '.' + frac : '')
}

export function AddExpenseDrawer({ open, onOpenChange, room, meMemberId, currencies, currencyMap, editing }: Props) {
	const addExpense = useAddExpense(room.slug)
	const updateExpense = useUpdateExpense(room.slug)
	const busy = addExpense.isPending || updateExpense.isPending
	const isError = addExpense.isError || updateExpense.isError

	const [description, setDescription] = useState('')
	const [amount, setAmount] = useState('')
	const [currency, setCurrency] = useState(room.baseCurrency)
	const [paidBy, setPaidBy] = useState(meMemberId)
	const [kind, setKind] = useState<SplitKind>('EQUAL')
	const [participants, setParticipants] = useState<Set<string>>(new Set(room.members.map((m) => m.id)))
	const [exact, setExact] = useState<Record<string, string>>({})

	// Guards against a rapid double-tap firing two submits before isPending
	// re-renders the disabled button (would create a duplicate expense).
	const submittingRef = useRef(false)
	// Member ids present when the split was seeded. Used to auto-include people
	// who JOIN while the drawer is open (the 8s poll would otherwise leave them
	// out of an EQUAL split, silently under-distributing) without ever re-adding
	// someone the user intentionally deselected.
	const seededIdsRef = useRef<Set<string>>(new Set())

	// (Re)initialize whenever the drawer opens — pre-fill in edit mode, reset otherwise.
	useEffect(() => {
		if (!open) return
		if (editing) {
			const dec = currencyMap[editing.currency]?.decimals ?? 2
			const baseDec = currencyMap[room.baseCurrency]?.decimals ?? 2
			const rate = Number(editing.fxRate) || 1
			setDescription(editing.description)
			setCurrency(editing.currency)
			setPaidBy(editing.paidByMemberId)
			setKind(editing.splitKind)
			setParticipants(new Set(editing.shares.map((s) => s.memberId)))
			seededIdsRef.current = new Set(editing.shares.map((s) => s.memberId))
			if (editing.splitKind === 'EXACT') {
				const ex: Record<string, string> = {}
				let sumMinor = 0n
				for (const s of editing.shares) {
					// Prefer the originally-typed amount (exact round-trip, no drift);
					// fall back to back-converting from base for rows created before
					// enteredAmountMinor existed.
					const curMinor =
						s.enteredAmountMinor != null
							? BigInt(s.enteredAmountMinor)
							: BigInt(Math.round((Number(s.amountMinor) / 10 ** baseDec / rate) * 10 ** dec))
					ex[s.memberId] = minorToMajor(curMinor.toString(), dec)
					sumMinor += curMinor
				}
				setExact(ex)
				// Total = sum of the reconstructed parts (foreign back-conversion is
				// lossy) so the "must add up" guard can never wedge an unedited save.
				setAmount(minorToMajor(sumMinor.toString(), dec))
			} else {
				setExact({})
				setAmount(minorToMajor(editing.amountMinor, dec))
			}
		} else {
			setDescription('')
			setAmount('')
			setCurrency(room.baseCurrency)
			setPaidBy(meMemberId)
			setKind('EQUAL')
			setParticipants(new Set(room.members.map((m) => m.id)))
			seededIdsRef.current = new Set(room.members.map((m) => m.id))
			setExact({})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, editing])

	// Someone joined while the drawer is open → add them to the split so an
	// EQUAL expense isn't silently under-distributed. Only adds brand-new members
	// (not in the seed), so it never overrides an intentional deselection.
	useEffect(() => {
		if (!open) return
		const fresh = room.members.filter((m) => !seededIdsRef.current.has(m.id))
		if (fresh.length === 0) return
		setParticipants((prev) => {
			const next = new Set(prev)
			fresh.forEach((m) => next.add(m.id))
			return next
		})
		fresh.forEach((m) => seededIdsRef.current.add(m.id))
	}, [room.members, open])

	const decimals = currencyMap[currency]?.decimals ?? 2
	const totalMinor = BigInt(toMinorString(amount, decimals))

	// Live estimated base-currency total for a foreign expense (display only).
	const foreign = currency !== room.baseCurrency
	const rateQ = useRateQuery(currency, room.baseCurrency, foreign && totalMinor > 0n)
	const baseDecimals = currencyMap[room.baseCurrency]?.decimals ?? 2
	const baseTotalMinor =
		rateQ.data && foreign && totalMinor > 0n
			? BigInt(Math.round((Number(totalMinor) / 10 ** decimals) * rateQ.data.rate * 10 ** baseDecimals))
			: null

	const exactSumMinor = useMemo(
		() =>
			room.members.reduce((sum, m) => {
				const v = exact[m.id]
				return v ? sum + BigInt(toMinorString(v, decimals)) : sum
			}, 0n),
		[exact, room.members, decimals]
	)
	const exactRemaining = totalMinor - exactSumMinor

	const canSubmit =
		totalMinor > 0n &&
		!busy &&
		(kind === 'EQUAL' ? participants.size > 0 : exactSumMinor > 0n && exactRemaining === 0n)

	const submit = async () => {
		if (!canSubmit || submittingRef.current) return
		submittingRef.current = true
		const base = {
			description: description.trim() || 'Expense',
			amountMinor: totalMinor.toString(),
			currency,
			paidByMemberId: paidBy,
			createdByMemberId: meMemberId,
		}
		const input =
			kind === 'EQUAL'
				? { ...base, splitKind: 'EQUAL' as const, participantMemberIds: [...participants] }
				: {
						...base,
						splitKind: 'EXACT' as const,
						exactShares: room.members
							.filter((m) => exact[m.id] && BigInt(toMinorString(exact[m.id], decimals)) > 0n)
							.map((m) => ({ memberId: m.id, amountMinor: toMinorString(exact[m.id], decimals) })),
					}
		try {
			if (editing) await updateExpense.mutateAsync({ expenseId: editing.id, input })
			else await addExpense.mutateAsync(input)
			onOpenChange(false)
		} catch {
			// mutation surfaces the error via isError; keep the drawer open to retry
		} finally {
			submittingRef.current = false
		}
	}

	const toggleParticipant = (id: string) => {
		setParticipants((prev) => {
			const next = new Set(prev)
			next.has(id) ? next.delete(id) : next.add(id)
			return next
		})
	}
	const allSelected = participants.size === room.members.length

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="text-xl font-extrabold text-n-1">
						{editing ? 'Edit expense' : 'Add expense'}
					</DrawerTitle>
				</DrawerHeader>

				<div className="flex flex-col gap-4 px-4 pb-2">
					<BaseInput
						className={FIELD}
						placeholder="What was it for?"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						maxLength={255}
					/>

					<div className="flex gap-2">
						<BaseInput
							className={twMerge(FIELD, 'flex-1')}
							placeholder="0.00"
							inputMode="decimal"
							maxLength={15}
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
						<select
							className={twMerge('input px-3', FIELD, 'w-24')}
							value={currency}
							onChange={(e) => setCurrency(e.target.value)}
						>
							{currencies.map((c) => (
								<option key={c.code} value={c.code}>
									{c.code}
								</option>
							))}
						</select>
					</div>
					{foreign && totalMinor > 0n && (
						<div className="-mt-2 text-sm text-grey-1">
							{baseTotalMinor != null
								? `≈ ${formatMoney(baseTotalMinor.toString(), room.baseCurrency, currencyMap)} · balances use ${room.baseCurrency} at an indicative rate`
								: `Balances use ${room.baseCurrency} at an indicative rate`}
						</div>
					)}

					<label className="flex flex-col gap-1">
						<span className="text-sm font-semibold text-grey-1">Paid by</span>
						<select
							className={twMerge('input px-3', FIELD)}
							value={paidBy}
							onChange={(e) => setPaidBy(e.target.value)}
						>
							{room.members.map((m) => (
								<option key={m.id} value={m.id}>
									{m.displayName}
									{m.id === meMemberId ? ' (you)' : ''}
								</option>
							))}
						</select>
					</label>

					<div className="flex rounded-sm border border-n-1 p-1">
						{(['EQUAL', 'EXACT'] as SplitKind[]).map((k) => (
							<button
								key={k}
								onClick={() => setKind(k)}
								className={twMerge(
									'flex-1 rounded-sm py-2 text-sm font-bold',
									kind === k ? 'bg-n-1 text-white' : 'text-n-1'
								)}
							>
								{k === 'EQUAL' ? 'Split equally' : 'Exact amounts'}
							</button>
						))}
					</div>

					{kind === 'EQUAL' && totalMinor > 0n && participants.size > 0 && (
						<div className="-mt-1 text-center text-sm font-semibold text-grey-1">
							{formatMoney((totalMinor / BigInt(participants.size)).toString(), currency, currencyMap)}{' '}
							each
						</div>
					)}

					<div className="flex flex-col gap-1">
						{kind === 'EQUAL' && (
							<div className="flex items-center justify-between pb-1">
								<span className="text-sm text-grey-1">Split between</span>
								<button
									className="text-sm font-semibold text-black underline"
									onClick={() =>
										setParticipants(
											allSelected ? new Set() : new Set(room.members.map((m) => m.id))
										)
									}
								>
									{allSelected ? 'Deselect all' : 'Select all'}
								</button>
							</div>
						)}
						{room.members.map((m) => (
							<div key={m.id} className="flex items-center gap-3 py-1">
								<MemberAvatar name={m.displayName} colorSeed={m.colorSeed} size={30} />
								<span className="flex-1 truncate text-n-1">{m.displayName}</span>
								{kind === 'EQUAL' ? (
									<input
										type="checkbox"
										className="size-5 accent-n-1"
										checked={participants.has(m.id)}
										onChange={() => toggleParticipant(m.id)}
									/>
								) : (
									<input
										className="input h-10 w-28 px-3 text-right"
										inputMode="decimal"
										maxLength={15}
										placeholder="0.00"
										value={exact[m.id] ?? ''}
										onChange={(e) => setExact((prev) => ({ ...prev, [m.id]: e.target.value }))}
									/>
								)}
							</div>
						))}
					</div>

					{kind === 'EXACT' && totalMinor > 0n && exactRemaining !== 0n && (
						<div className="text-sm text-red">
							{exactRemaining > 0n ? 'Unassigned' : 'Over by'}{' '}
							{formatMoney(
								(exactRemaining < 0n ? -exactRemaining : exactRemaining).toString(),
								currency,
								currencyMap
							)}
						</div>
					)}
					{isError && <div className="text-sm text-red">Couldn’t save the expense — check the amounts.</div>}
				</div>

				<DrawerFooter>
					<Button
						variant="purple"
						shadowSize="4"
						className="w-full"
						loading={busy}
						disabled={!canSubmit}
						onClick={submit}
					>
						{editing ? 'Save changes' : 'Add expense'}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}
