import * as Sentry from '@sentry/node'

type Level = 'info' | 'warn' | 'error'

const emit = (level: Level, obj: unknown, msg?: string) => {
	const line = { level, msg: msg ?? '', ...(typeof obj === 'object' && obj !== null ? obj : { value: obj }) }
	console[level === 'error' ? 'error' : 'log'](JSON.stringify(line, replacer))
}

// BigInt is all over the money paths; JSON.stringify throws on it by default.
const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)

export const logger = {
	info: (obj: unknown, msg?: string) => emit('info', obj, msg),
	warn: (obj: unknown, msg?: string) => emit('warn', obj, msg),
	error: (obj: unknown, msg?: string) => {
		emit('error', obj, msg)
		const err = (obj as { err?: unknown })?.err
		if (err instanceof Error) Sentry.captureException(err)
	},
}
