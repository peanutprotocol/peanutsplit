import cors from '@fastify/cors'
import Fastify from 'fastify'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'

// Single Fastify instance the route modules attach themselves to, mirroring
// the peanut-api-ts shape the split routes were written against.
export const app = Fastify({
	logger: false,
	// Room slugs and member ids are all we ever take on a path.
	maxParamLength: 128,
}).withTypeProvider<TypeBoxTypeProvider>()

await app.register(cors, {
	origin: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
})
