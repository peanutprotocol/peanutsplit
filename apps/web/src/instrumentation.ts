/**
 * Server-process lifecycle hooks.
 *
 * Install handoffs are capabilities, not history. The route enforces its
 * 24-hour access TTL synchronously; this hourly sweep additionally bounds how
 * long an abandoned, inaccessible hash row remains in a quiet deployment.
 */

const INSTALL_HANDOFF_PRUNE_INTERVAL_MS = 60 * 60 * 1000
const TIMER_KEY = '__splitInstallHandoffPruneTimer'

type TimerGlobal = typeof globalThis & {
    [TIMER_KEY]?: ReturnType<typeof setInterval>
}

export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return

    const runtime = globalThis as TimerGlobal
    if (runtime[TIMER_KEY]) return
    const { pruneExpiredInstallHandoffs } = await import('@/server/installHandoff')

    const prune = () => {
        void pruneExpiredInstallHandoffs().catch((error: unknown) => {
            console.error(
                '[split] install handoff retention sweep failed',
                error instanceof Error ? `${error.name}: ${error.message.slice(0, 160)}` : 'unknown'
            )
        })
    }
    const timer = setInterval(prune, INSTALL_HANDOFF_PRUNE_INTERVAL_MS)
    timer.unref?.()
    runtime[TIMER_KEY] = timer
}
