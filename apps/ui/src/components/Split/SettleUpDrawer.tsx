'use client'

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { MemberAvatar } from './MemberAvatar'
import { useRecordSettlement } from '@/hooks/query/split'
import { formatMoney, type CurrencyMap } from '@/utils/split-format'
import type { RoomState } from '@/services/split.types'

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	room: RoomState
	currencyMap: CurrencyMap
}

export function SettleUpDrawer({ open, onOpenChange, room, currencyMap }: Props) {
	const settle = useRecordSettlement(room.slug)
	const byId = Object.fromEntries(room.members.map((m) => [m.id, m]))

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle className="text-xl font-extrabold text-n-1">Settle up</DrawerTitle>
				</DrawerHeader>

				<div className="flex flex-col gap-3 px-4 pb-6">
					{room.suggestedTransfers.length === 0 ? (
						<div className="py-8 text-center text-lg font-semibold text-n-1">You’re all settled up 🥜</div>
					) : (
						<>
							<p className="text-sm text-grey-1">
								The fewest payments to square everyone up. Pay each other back in person or by bank,
								then mark it paid here.
							</p>
							{room.suggestedTransfers.map((t, i) => {
								const from = byId[t.fromMemberId]
								const to = byId[t.toMemberId]
								if (!from || !to) return null
								return (
									<div
										key={i}
										className="flex flex-col gap-3 rounded-sm border border-n-1 bg-white p-4"
									>
										<div className="flex items-center gap-2">
											{/* names truncate; the amount stays pinned + fully visible (never clipped) */}
											<div className="flex min-w-0 flex-1 items-center gap-1.5">
												<MemberAvatar
													name={from.displayName}
													colorSeed={from.colorSeed}
													size={30}
												/>
												<span className="min-w-0 truncate font-semibold text-n-1">
													{from.displayName}
												</span>
												<span className="shrink-0 text-grey-1">pays</span>
												<MemberAvatar
													name={to.displayName}
													colorSeed={to.colorSeed}
													size={30}
												/>
												<span className="min-w-0 truncate font-semibold text-n-1">
													{to.displayName}
												</span>
											</div>
											<span className="shrink-0 whitespace-nowrap text-lg font-extrabold text-n-1">
												{formatMoney(t.amountMinor, room.baseCurrency, currencyMap)}
											</span>
										</div>
										<Button
											variant="dark"
											className="w-full"
											loading={settle.isPending}
											onClick={() =>
												settle.mutate({
													fromMemberId: t.fromMemberId,
													toMemberId: t.toMemberId,
													amountMinor: t.amountMinor,
													method: 'MANUAL',
												})
											}
										>
											Mark as paid
										</Button>
									</div>
								)
							})}
							<p className="pt-1 text-center text-sm text-grey-1">
								⚡ Instant pay with Peanut — coming soon
							</p>
						</>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	)
}
