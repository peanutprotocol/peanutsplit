module.exports = {
	testEnvironment: 'jsdom',
	roots: ['<rootDir>/src'],
	testMatch: ['**/*.test.ts', '**/*.test.tsx'],
	moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{ tsconfig: { module: 'commonjs', target: 'ES2022', jsx: 'react-jsx', esModuleInterop: true } },
		],
	},
}
