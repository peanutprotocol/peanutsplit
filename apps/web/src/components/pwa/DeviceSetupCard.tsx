import Image from 'next/image'
import type { ReactNode } from 'react'
import { peanutPointing } from '@/assets/mascot'

/** Shared room-card layout for the two optional device actions. */
export function DeviceSetupCard({ children }: { children: ReactNode }) {
    return (
        <div
            className="shadow-4 flex w-full items-start gap-3 rounded-sm border border-n-1 bg-white p-4"
            data-testid="device-setup-card"
        >
            <Image
                src={peanutPointing}
                alt=""
                aria-hidden="true"
                unoptimized
                className="size-12 shrink-0 object-contain"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
        </div>
    )
}
