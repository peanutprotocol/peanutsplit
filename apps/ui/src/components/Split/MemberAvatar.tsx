'use client'

import { memberColor, initials } from '@/utils/split-format'

export function MemberAvatar({ name, colorSeed, size = 36 }: { name: string; colorSeed: number; size?: number }) {
	return (
		<div
			className="flex flex-none items-center justify-center rounded-full border border-n-1 font-bold text-n-1"
			style={{ width: size, height: size, background: memberColor(colorSeed), fontSize: Math.round(size * 0.36) }}
			title={name}
		>
			{initials(name)}
		</div>
	)
}
