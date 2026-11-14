/**
 * A TCP tunnel through the egress proxy, for APNs.
 *
 * Production has no egress except the pinned proxy in `SPLIT_PUSH_PROXY_URL`.
 * Web Push and FCM are HTTP/1.1 and go through `egressFetch`; APNs needs
 * HTTP/2, and Node's `http2.connect` has no proxy option. So this opens an
 * HTTP CONNECT tunnel and returns the raw socket; the caller wraps it in TLS
 * and hands it to `http2.connect({ createConnection })`.
 */
import http from 'node:http'
import type { Socket } from 'node:net'

const CONNECT_TIMEOUT_MS = 10_000

export function openTunnel(proxyUrl: string, host: string, port: number): Promise<Socket> {
    const proxy = new URL(proxyUrl)
    const headers: Record<string, string> = { Host: `${host}:${port}` }
    if (proxy.username) {
        const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`
        headers['Proxy-Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`
    }
    return new Promise((resolve, reject) => {
        const request = http.request({
            host: proxy.hostname,
            port: proxy.port || 80,
            method: 'CONNECT',
            path: `${host}:${port}`,
            headers,
            timeout: CONNECT_TIMEOUT_MS,
        })
        request.once('connect', (response, socket) => {
            if (response.statusCode === 200) {
                // The connect timeout must not outlive the handshake: an idle
                // HTTP/2 session on this socket is normal.
                socket.setTimeout(0)
                return resolve(socket)
            }
            socket.destroy()
            reject(new Error(`proxy refused CONNECT: ${response.statusCode}`))
        })
        request.once('timeout', () => request.destroy(new Error('proxy CONNECT timed out')))
        request.once('error', reject)
        request.end()
    })
}
