/**
 * dsh-file-explorer —— Host 半部（真实 profile 插件）
 *
 * - 文件系统操作直接用 node:fs（readdir / stat / readFile）
 * - HTTP 路由（webServer，前缀 /dsh-fex）：root / list / read
 */
import { readdir, stat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'

export const name = 'dsh-file-explorer'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-fex'
const MAX_PREVIEW = 65536

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
    catch (err) { reject(err) }
  })
  req.on('error', reject)
})

export function apply(ctx) {
  const fmtSize = (n) => {
    if (n == null || n < 0) return ''
    if (n < 1024) return n + ' B'
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
    return (n / 1048576).toFixed(1) + ' MB'
  }

  const sendJson = (res, value) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === undefined || addr === ''

  const listDir = async (path) => {
    const names = await readdir(path, { withFileTypes: true })
    const entries = []
    for (const ent of names) {
      let type = 'file'
      let size = null
      if (ent.isDirectory()) type = 'directory'
      else if (ent.isSymbolicLink()) type = 'other'
      const full = join(path, ent.name)
      if (type === 'file') {
        try {
          const info = await stat(full)
          size = info.size
        } catch (err) { /* ignore */ }
      }
      entries.push({ name: ent.name, type, size, path: full })
    }
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name)
    })
    return entries
  }

  const readFilePreview = async (path, maxBytes) => {
    const info = await stat(path)
    if (info.isDirectory()) return { ok: false, error: '不是普通文件' }
    let buffer
    try {
      buffer = await readFile(path)
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    const truncated = buffer.length > maxBytes
    const slice = truncated ? buffer.subarray(0, maxBytes) : buffer
    const text = new TextDecoder('utf-8').decode(slice)
    let binary = false
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 0) { binary = true; break }
    }
    if (!binary && text.indexOf('\uFFFD') >= 0) binary = true
    return { ok: true, content: binary ? '' : text, binary, truncated, size: info.size }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      if (!isLoopback(req.socket && req.socket.remoteAddress)) {
        sendJson(res, { ok: false, error: '仅允许本机访问' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const pathname = url.pathname
      const method = req.method ?? 'GET'
      try {
        if (method === 'GET' && pathname === ROUTE_PREFIX + '/root') {
          sendJson(res, { ok: true, root: homedir() })
          return
        }
        if (method === 'GET' && pathname === ROUTE_PREFIX + '/list') {
          const path = url.searchParams.get('path') || homedir()
          const entries = await listDir(path)
          sendJson(res, { ok: true, path, entries })
          return
        }
        if (method === 'GET' && pathname === ROUTE_PREFIX + '/read') {
          const path = url.searchParams.get('path') || ''
          if (!path) { sendJson(res, { ok: false, error: '缺少文件路径' }); return }
          let maxBytes = MAX_PREVIEW
          const raw = url.searchParams.get('maxBytes')
          if (raw) maxBytes = Math.max(1024, Math.min(1048576, Math.floor(Number(raw) || MAX_PREVIEW)))
          sendJson(res, await readFilePreview(path, maxBytes))
          return
        }
        sendJson(res, { ok: false, error: 'not found' })
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'dsh-file-explorer: routes')
}
