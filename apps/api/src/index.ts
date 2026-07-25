import 'dotenv/config'
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
	Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? 'development' })
}

const { app } = await import('./app')
const { logger } = await import('./utils')
await import('./routes/webhooks/peanut')
await import('./routes/split/index')

app.get('/health', async () => ({ ok: true }))

const port = Number(process.env.PORT ?? 5051)

try {
	await app.listen({ port, host: '0.0.0.0' })
	logger.info({ port }, 'peanut-split api listening')
} catch (err) {
	logger.error({ err }, 'failed to start')
	process.exit(1)
}
