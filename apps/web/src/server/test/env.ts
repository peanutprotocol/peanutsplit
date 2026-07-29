/** Test env. Loaded before any test module (and before Prisma is constructed),
 *  so handler tests hit the throwaway `peanut_split_test` database and FX never
 *  reaches the network. */
export const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://peanut:peanut@localhost:5432/peanut_split_test'

process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.SPLIT_FX_MODE = 'static'

process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
