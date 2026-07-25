import { execFileSync } from 'node:child_process'
import { TEST_DATABASE_URL } from '@/server/test/env'

/** Bring the test database up to the current migrations once per run, so
 *  `pnpm test` works from a clean checkout without a manual step. */
export default function setup() {
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        stdio: 'pipe',
    })
}
