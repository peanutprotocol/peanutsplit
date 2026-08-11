import type { Metadata } from 'next'
import { HandoffSender } from '@/components/handoff/HandoffSender'

export const metadata: Metadata = {
    title: 'Peanut Split',
    // A machine-to-machine page. Nothing here should ever be crawled or followed.
    robots: { index: false, follow: false },
}

/**
 * The legacy origin's end of the localStorage handoff — loaded in a hidden iframe by
 * split.peanut.me, never meant for a person. The one line of text is for the human who
 * pastes the URL anyway; `cutover-redirects.ts` exempts this path on both hosts so the
 * iframe can never be bounced to an origin whose storage is not the one being moved.
 */
export default function HandoffPage() {
    return (
        <main className="p-6 text-sm text-grey-1">
            <p>This page moves saved rooms to split.peanut.me automatically. There is nothing to do here.</p>
            <HandoffSender />
        </main>
    )
}
