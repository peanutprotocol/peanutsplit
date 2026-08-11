import type { Metadata } from 'next'
import { ShareTarget } from '@/components/pwa/ShareTarget'
import { splitV2Enabled } from '@/lib/flags'

export const metadata: Metadata = {
    title: 'Add a bill — Peanut Split',
    // A POST landing pad. Nothing here should ever be crawled or followed.
    robots: { index: false, follow: false },
}

export default function ShareTargetPage() {
    return <ShareTarget enabled={splitV2Enabled()} />
}
