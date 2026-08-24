/** Test env. Loaded before any test module (and before Prisma is constructed),
 *  so handler tests hit the throwaway `peanut_split_test` database and FX never
 *  reaches the network. */
export const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgresql://split:split@localhost:5433/peanut_split_test'

process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.SPLIT_FX_MODE = 'static'

process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
// The branch's ordinary suite exercises the release-candidate surface. Dedicated flag and route
// tests delete this value to prove that an incomplete deployment still fails closed.
process.env.NEXT_PUBLIC_FOSS_RELEASED = '1'
process.env.NEXT_PUBLIC_SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567'
process.env.NEXT_PUBLIC_BUILD_COMMIT = process.env.NEXT_PUBLIC_SOURCE_COMMIT
process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_URL = `https://github.com/peanutprotocol/peanutsplit/releases/download/v0.0.0-test/peanutsplit-source-${process.env.NEXT_PUBLIC_SOURCE_COMMIT}.tar.gz`
process.env.NEXT_PUBLIC_SOURCE_ARCHIVE_SHA256 = 'a'.repeat(64)
