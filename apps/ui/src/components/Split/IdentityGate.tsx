'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { BaseInput } from '@/components/ui/BaseInput'
import { MemberAvatar } from './MemberAvatar'
import { useAddMember } from '@/hooks/query/split'
import { setStoredMemberId } from '@/utils/split-identity'
import type { RoomState } from '@/services/split.types'
import { track, attribution } from '@/services/analytics'

/**
 * First-visit gate: possession of the link gets you in, but we still need to
 * know which member you are on this device. Pick an existing name or add
 * yourself — the choice is stored locally (trust-based, no auth).
 */
export function IdentityGate({ room, onPicked }: { room: RoomState; onPicked: (memberId: string) => void }) {
	const [name, setName] = useState('')
	const addMember = useAddMember(room.slug)

	const pick = (memberId: string) => {
		setStoredMemberId(room.slug, memberId)
		onPicked(memberId)
	}

	const handleAdd = async () => {
		const trimmed = name.trim()
		if (!trimmed || addMember.isPending) return
		// Use the id the server hands back — never diff the members array (racy
		// when several people tap Join at the same instant).
		const res = await addMember.mutateAsync(trimmed)
		track('member_joined', { newName: true, source: attribution() })
		pick(res.createdMemberId)
	}

	return (
		<div className="flex min-h-[inherit] flex-col justify-center gap-6 p-6">
			<div className="text-center">
				<div className="text-2xl font-extrabold text-n-1">Who are you?</div>
				<div className="mt-1 text-grey-1">
					Joining <span className="font-semibold text-n-1">{room.title || 'this room'}</span>
				</div>
			</div>

			{room.members.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className="text-sm font-semibold text-grey-1">Tap your name</div>
					<div className="flex flex-col gap-2">
						{room.members.map((m) => (
							<button
								key={m.id}
								onClick={() => {
									track('member_joined', { newName: false, source: attribution() })
									pick(m.id)
								}}
								className="flex items-center gap-3 rounded-sm border border-n-1 bg-white px-4 py-3 text-left transition hover:bg-primary-3/40"
							>
								<MemberAvatar name={m.displayName} colorSeed={m.colorSeed} />
								<span className="font-semibold text-n-1">{m.displayName}</span>
							</button>
						))}
					</div>
					<div className="my-1 text-center text-sm text-grey-1">or add yourself</div>
				</div>
			)}

			<div className="flex flex-col gap-3">
				<BaseInput
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
					placeholder="Your name"
					maxLength={80}
					autoFocus={room.members.length === 0}
				/>
				{addMember.isError && <div className="text-sm text-red">Couldn’t add you — try again.</div>}
				<Button
					variant="purple"
					shadowSize="4"
					className="w-full"
					loading={addMember.isPending}
					disabled={!name.trim()}
					onClick={handleAdd}
				>
					{room.members.length === 0 ? 'Start splitting' : 'Join'}
				</Button>
			</div>
		</div>
	)
}
