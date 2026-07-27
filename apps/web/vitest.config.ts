import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        passWithNoTests: true,
        // Points DATABASE_URL at peanut_split_test and pins FX to the static table.
        setupFiles: ['src/server/test/env.ts'],
        globalSetup: ['src/server/test/globalSetup.ts'],
        // Handler tests share one database — parallel files would truncate each other.
        fileParallelism: false,
    },
})
