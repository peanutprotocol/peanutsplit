/** Pure-function money-math tests. Transformed to CJS so the suite doesn't
 *  need the experimental ESM VM loader — nothing under test imports ESM-only
 *  packages. */
module.exports = {
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true } }],
	},
}
