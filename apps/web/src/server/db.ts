import { PrismaClient } from '@prisma/client'

// Next dev hot-reloads modules; without the global cache every reload opens a
// fresh connection pool until Postgres refuses new connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
