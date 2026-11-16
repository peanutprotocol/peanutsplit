#!/usr/bin/env node
/**
 * Serves the store-app export the way Capacitor does, for local and CI cold-start checks.
 * Usage: node scripts/native/serve-export.mjs <dir> <port>
 *
 * Capacitor's rule (iOS Router.swift, Android WebViewLocalServer.java:399): a path whose last
 * segment contains a dot is that file or a 404; every other path gets the ROOT index.html. A
 * folder's own index.html is never served. The boot-path script in layout.native.tsx depends on
 * this, so a plain static server would hide the bugs this one exists to show.
 */

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const [dirArg, portArg] = process.argv.slice(2)
if (!dirArg || !portArg) {
    console.error('usage: serve-export.mjs <dir> <port>')
    process.exit(1)
}
const root = resolve(dirArg)
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
}

createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
        const lastSegment = pathname.split('/').pop() ?? ''
        const file = lastSegment.includes('.') ? normalize(join(root, pathname)) : join(root, 'index.html')
        if (!file.startsWith(root)) throw new Error('outside the export')
        const body = await readFile(file)
        response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
        response.writeHead(404).end()
    }
}).listen(Number(portArg), '127.0.0.1', () => console.log(`serving ${root} on http://localhost:${portArg}`))
