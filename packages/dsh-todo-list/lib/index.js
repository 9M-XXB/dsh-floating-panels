/**
 * dsh-todo-list —— Host 半部（真实 profile 插件）
 *
 * - 待办存储：本地 JSON（~/.dsh-todo-store.json，首次启动自动创建，绝不进入仓库/上传 GitHub）
 * - HTTP 路由（webServer，前缀 /dsh-todo）：list / add / toggle / remove / clear
 * - 注册 /todo 斜杠指令（ctx.commands）
 * - 注册 5 个模型工具（ctx.tools + defineTool）：todo_list / todo_add / todo_update / todo_remove / todo_clear
 */
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-todo-list'
export const inject = ['webServer', 'commands', 'tools']

const STORE_PATH = join(homedir(), '.dsh-todo-store.json')
const ROUTE_PREFIX = '/dsh-todo'

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}) }
    catch (err) { reject(err) }
  })
  req.on('error', reject)
})

export async function apply(ctx) {
  let seq = 0
  let items = [] // { id, text, done, createdAt }

  const findItem = (id) => items.find((it) => it.id === id)
  const save = async () => {
    try { await writeFile(STORE_PATH, JSON.stringify(items), 'utf8') }
    catch (err) { console.error('todo store save failed:', err instanceof Error ? err.message : String(err)) }
  }
  const load = async () => {
    try {
      const text = await readFile(STORE_PATH, 'utf8')
      const data = JSON.parse(text)
      if (Array.isArray(data)) {
        items = data.filter((it) => it && typeof it.id === 'string' && typeof it.text === 'string' && typeof it.done === 'boolean')
        seq = items.reduce((m, it) => {
          const n = Number(String(it.id).replace(/^t/, ''))
          return Number.isFinite(n) ? Math.max(m, n) : m
        }, 0)
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // 首次启动：自动创建空存储
        try { await writeFile(STORE_PATH, '[]', 'utf8') } catch (e) { /* ignore */ }
      } else {
        console.error('todo store load failed:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  const addItem = (text) => {
    const item = { id: 't' + (++seq), text, done: false, createdAt: Date.now() }
    items = [...items, item]
    save()
    return item
  }
  const toggleItem = (id) => {
    if (!findItem(id)) return null
    items = items.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
    save()
    return findItem(id)
  }
  const updateItem = (id, patch) => {
    const cur = findItem(id)
    if (!cur) return null
    const next = {
      ...cur,
      text: typeof patch.text === 'string' && patch.text ? patch.text : cur.text,
      done: typeof patch.done === 'boolean' ? patch.done : cur.done,
    }
    items = items.map((x) => (x.id === id ? next : x))
    save()
    return next
  }
  const removeItem = (id) => {
    if (!findItem(id)) return false
    items = items.filter((x) => x.id !== id)
    save()
    return true
  }
  const clearDone = () => {
    const removed = items.filter((x) => x.done).length
    items = items.filter((x) => !x.done)
    save()
    return removed
  }
  const snapshot = () => items.map((it) => ({ id: it.id, text: it.text, done: it.done, createdAt: it.createdAt }))

  // 启动时先加载持久化数据，再注册指令/工具/路由，避免竞态覆盖
  await load()

  // ---------- /todo 斜杠指令 ----------
  ctx.effect(() => ctx.commands.register({
    name: 'todo',
    description: '添加或管理待办列表（浮动面板同步显示，本地持久化）',
    input: { hint: '[内容 | add 内容 | done <id> | remove <id> | clear | list]' },
    handler: (invocation) => {
      const input = invocation.rawInput.trim()
      if (!input) {
        return { kind: 'error', text: '用法：/todo <内容> 添加待办；/todo done <id> 完成/取消；/todo remove <id> 删除；/todo clear 清除已完成；/todo list 列出全部' }
      }
      const space = input.indexOf(' ')
      const cmd = space === -1 ? input : input.slice(0, space)
      const rest = space === -1 ? '' : input.slice(space + 1).trim()
      if (cmd === 'list') {
        if (items.length === 0) return { kind: 'success', text: '待办列表为空' }
        const lines = items.slice(0, 30).map((it) => (it.done ? '☑' : '☐') + ' ' + it.id + ' ' + it.text)
        const tail = items.length > 30 ? '\n…共 ' + items.length + ' 项' : '\n共 ' + items.length + ' 项'
        return { kind: 'success', text: lines.join('\n') + tail }
      }
      if (cmd === 'clear') {
        const n = clearDone()
        return { kind: 'success', text: n > 0 ? '已清除 ' + n + ' 项已完成待办，剩余 ' + items.length + ' 项' : '没有已完成的待办' }
      }
      if (cmd === 'done' || cmd === 'remove') {
        if (!rest) return { kind: 'error', text: '用法：/todo ' + cmd + ' <id>（id 见面板或 /todo list）' }
        if (cmd === 'done') {
          const it = toggleItem(rest)
          if (!it) return { kind: 'error', text: '找不到待办 ' + rest }
          return { kind: 'success', text: it.done ? '☑ 已完成：' + it.text : '☐ 恢复未完成：' + it.text }
        }
        if (removeItem(rest)) return { kind: 'success', text: '已删除待办 ' + rest }
        return { kind: 'error', text: '找不到待办 ' + rest }
      }
      if (cmd === 'add') {
        if (!rest) return { kind: 'error', text: '用法：/todo add <内容>' }
        const it = addItem(rest)
        return { kind: 'success', text: '✅ 已添加待办（' + it.id + '）：' + it.text + '（当前共 ' + items.length + ' 项）' }
      }
      const it = addItem(input)
      return { kind: 'success', text: '✅ 已添加待办（' + it.id + '）：' + it.text + '（当前共 ' + items.length + ' 项）' }
    },
  }), 'dsh-todo-list: /todo command')

  // ---------- 动态模型工具 ----------
  const textRender = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

  const tools = [
    {
      name: 'todo_list',
      description: '列出待办列表的全部条目（id、内容、完成状态、创建时间）。',
      parameters: {},
      output: { schema: { type: 'json' }, render: textRender },
      execute: () => ({ ok: true, items: snapshot() }),
    },
    {
      name: 'todo_add',
      description: '向待办列表添加一条新的待办事项。',
      parameters: { text: { type: 'string', required: true, description: '待办内容' } },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        const text = typeof args.text === 'string' ? args.text.trim() : ''
        if (!text) return { ok: false, error: '内容不能为空' }
        const it = addItem(text)
        return { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt }, total: items.length }
      },
    },
    {
      name: 'todo_update',
      description: '更改一条待办：可修改内容文本和/或完成状态。id 来自 todo_list。',
      parameters: {
        id: { type: 'string', required: true, description: '待办 id（如 t1）' },
        text: { type: 'string', description: '新的待办内容；省略则不改文本' },
        done: { type: 'boolean', description: '完成状态 true/false；省略则不改状态' },
      },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        const id = typeof args.id === 'string' ? args.id : ''
        const it = updateItem(id, {
          text: typeof args.text === 'string' ? args.text.trim() : undefined,
          done: typeof args.done === 'boolean' ? args.done : undefined,
        })
        if (!it) return { ok: false, error: '找不到待办 ' + id }
        return { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt } }
      },
    },
    {
      name: 'todo_remove',
      description: '删除一条待办。id 来自 todo_list。',
      parameters: { id: { type: 'string', required: true, description: '待办 id（如 t1）' } },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        const id = typeof args.id === 'string' ? args.id : ''
        if (!removeItem(id)) return { ok: false, error: '找不到待办 ' + id }
        return { ok: true, removed: id, total: items.length }
      },
    },
    {
      name: 'todo_clear',
      description: '清除待办：默认只清除已完成的；only_done 为 false 时清空全部。',
      parameters: { only_done: { type: 'boolean', description: 'true=仅清除已完成（默认），false=清空全部' } },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        if (args && args.only_done === false) {
          const n = items.length
          items = []
          save()
          return { ok: true, removed: n, total: 0 }
        }
        const n = clearDone()
        return { ok: true, removed: n, total: items.length }
      },
    },
  ]
  for (const tool of tools) {
    ctx.effect(() => ctx.tools.register(defineTool(tool)), 'dsh-todo-list: tool ' + tool.name)
  }

  // ---------- HTTP 路由（Client↔Host RPC） ----------
  const sendJson = (res, value) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(value))
  }
  const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === undefined || addr === ''

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
        if (method === 'GET' && pathname === ROUTE_PREFIX + '/list') {
          sendJson(res, { ok: true, items: snapshot() })
          return
        }
        if (method === 'POST') {
          const body = await readBody(req)
          if (pathname === ROUTE_PREFIX + '/add') {
            const text = body && typeof body.text === 'string' ? body.text.trim() : ''
            if (!text) { sendJson(res, { ok: false, error: '内容不能为空' }); return }
            const it = addItem(text)
            sendJson(res, { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt } })
            return
          }
          if (pathname === ROUTE_PREFIX + '/toggle') {
            const id = body && typeof body.id === 'string' ? body.id : ''
            const it = toggleItem(id)
            if (!it) { sendJson(res, { ok: false, error: '找不到该待办' }); return }
            sendJson(res, { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt } })
            return
          }
          if (pathname === ROUTE_PREFIX + '/remove') {
            const id = body && typeof body.id === 'string' ? body.id : ''
            if (!removeItem(id)) { sendJson(res, { ok: false, error: '找不到该待办' }); return }
            sendJson(res, { ok: true })
            return
          }
          if (pathname === ROUTE_PREFIX + '/clear') {
            sendJson(res, { ok: true, removed: clearDone() })
            return
          }
        }
        sendJson(res, { ok: false, error: 'not found' })
      } catch (error) {
        sendJson(res, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'dsh-todo-list: routes')
}
