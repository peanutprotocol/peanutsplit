import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import net, { type AddressInfo } from 'node:net'
import { openTunnel } from '@/server/push-native/tunnel'

/** Local stand-ins: a TCP echo server as the "push service" and a CONNECT proxy
 *  in front of it. No request leaves the machine. */
const servers: { close(): unknown }[] = []

afterEach(async () => {
    for (const server of servers.splice(0)) server.close()
})

const listen = async <T extends net.Server>(server: T): Promise<number> => {
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return (server.address() as AddressInfo).port
}

const echoServer = () => listen(net.createServer((socket) => socket.pipe(socket)))

function connectProxy(options: { refuse?: boolean } = {}) {
    const seen: { url?: string; auth?: string } = {}
    const server = http.createServer((_req, res) => res.writeHead(405).end())
    server.on('connect', (req, client: net.Socket) => {
        seen.url = req.url
        seen.auth = req.headers['proxy-authorization']
        if (options.refuse) {
            client.end('HTTP/1.1 403 Forbidden\r\n\r\n')
            return
        }
        const [host, port] = (req.url ?? '').split(':')
        const upstream = net.connect(Number(port), host, () => {
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            upstream.pipe(client)
            client.pipe(upstream)
        })
        upstream.on('error', () => client.destroy())
    })
    return { seen, port: listen(server) }
}

const roundTrip = (socket: net.Socket, text: string) =>
    new Promise<string>((resolve) => {
        socket.once('data', (chunk) => resolve(chunk.toString('utf8')))
        socket.write(text)
    })

describe('openTunnel', () => {
    it('asks the proxy for the target host and port, then carries bytes both ways', async () => {
        const target = await echoServer()
        const proxy = connectProxy()
        const socket = await openTunnel(`http://127.0.0.1:${await proxy.port}`, '127.0.0.1', target)

        expect(proxy.seen.url).toBe(`127.0.0.1:${target}`)
        expect(proxy.seen.auth).toBeUndefined()
        expect(await roundTrip(socket, 'hello through the tunnel')).toBe('hello through the tunnel')
        socket.destroy()
    })

    it('sends basic proxy credentials from the proxy URL', async () => {
        const target = await echoServer()
        const proxy = connectProxy()
        const socket = await openTunnel(`http://split%40box:p%3Ass@127.0.0.1:${await proxy.port}`, '127.0.0.1', target)

        expect(proxy.seen.auth).toBe(`Basic ${Buffer.from('split@box:p:ss').toString('base64')}`)
        socket.destroy()
    })

    it('rejects when the proxy refuses the CONNECT', async () => {
        const proxy = connectProxy({ refuse: true })
        await expect(openTunnel(`http://127.0.0.1:${await proxy.port}`, 'api.push.apple.com', 443)).rejects.toThrow(
            'proxy refused CONNECT: 403'
        )
        expect(proxy.seen.url).toBe('api.push.apple.com:443')
    })

    it('rejects when the proxy is not there', async () => {
        const closed = net.createServer()
        const port = await listen(closed)
        closed.close()
        await expect(openTunnel(`http://127.0.0.1:${port}`, 'api.push.apple.com', 443)).rejects.toThrow()
    })
})
