import '@/server/test/env'
import { prisma } from '@/server/db'

/** Wipe everything between tests. Room cascades to members/expenses/shares/
 *  settlements; FxRate and User are independent roots. */
export async function truncateAll(): Promise<void> {
    await prisma.$executeRawUnsafe('TRUNCATE "split"."Room", "split"."FxRate", "split"."User" CASCADE')
}

export { prisma }
