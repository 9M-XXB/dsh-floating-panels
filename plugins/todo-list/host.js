/**
 * 待办列表 —— Host 半部（动态 Cordis 插件）
 *
 * 用法：在 DSH 会话中用 cordis_define 创建插件，把本文件完整内容填入 code.host。
 * 本文件内容是一个"返回 Cordis 插件的普通 JS 函数体"。
 *
 * 功能：
 *   - 注册 /todo 斜杠指令（对话输入框使用），支持 add/done/remove/clear/list
 *   - 注册 5 个动态模型工具（harness 可自动调用）：
 *       todo_list / todo_add / todo_update / todo_remove / todo_clear
 *   - 提供包私有 RPC（Client→Host，JSON）：list / add / toggle / remove / clear
 *   - 待办数据保存在进程内（fiber 共享），插件重启后清空
 */
return {
  apply(ctx) {
    // ---------- 待办存储（fiber 内共享，进程内；插件重启后清空） ----------
    let seq = 0
    let items = [] // { id, text, done, createdAt }
    const findItem = (id) => items.find((it) => it.id === id)
    const addItem = (text) => {
      const item = { id: 't' + (++seq), text, done: false, createdAt: Date.now() }
      items = [...items, item]
      return item
    }
    const toggleItem = (id) => {
      if (!findItem(id)) return null
      items = items.map((x) => (x.id === id ? { ...x, done: !x.done } : x))
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
      return next
    }
    const removeItem = (id) => {
      if (!findItem(id)) return false
      items = items.filter((x) => x.id !== id)
      return true
    }
    const clearDone = () => {
      const removed = items.filter((x) => x.done).length
      items = items.filter((x) => !x.done)
      return removed
    }
    const snapshot = () => items.map((it) => ({ id: it.id, text: it.text, done: it.done, createdAt: it.createdAt }))

    // ---------- /todo 斜杠指令（在对话输入框使用） ----------
    const commands = ctx.get('commands')
    if (commands !== undefined) {
      ctx.effect(() => commands.register({
        name: 'todo',
        description: '添加或管理待办列表（浮动面板同步显示）',
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
          // 默认：整行作为内容添加
          const it = addItem(input)
          return { kind: 'success', text: '✅ 已添加待办（' + it.id + '）：' + it.text + '（当前共 ' + items.length + ' 项）' }
        },
      }))
    }

    // ---------- 动态模型工具（harness 可在后续步骤中自动调用） ----------
    const registerTool = (def) => {
      const tool = harness.defineTool(def)
      ctx.effect(() => harness.registerTool(ctx, tool))
    }
    const textRender = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

    registerTool({
      name: 'todo_list',
      description: '列出待办列表的全部条目（id、内容、完成状态、创建时间）。',
      parameters: {},
      output: { schema: { type: 'json' }, render: textRender },
      execute: () => ({ ok: true, items: snapshot() }),
    })

    registerTool({
      name: 'todo_add',
      description: '向待办列表添加一条新的待办事项。',
      parameters: {
        text: { type: 'string', required: true, description: '待办内容' },
      },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        const text = typeof args.text === 'string' ? args.text.trim() : ''
        if (!text) return { ok: false, error: '内容不能为空' }
        const it = addItem(text)
        return { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt }, total: items.length }
      },
    })

    registerTool({
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
    })

    registerTool({
      name: 'todo_remove',
      description: '删除一条待办。id 来自 todo_list。',
      parameters: {
        id: { type: 'string', required: true, description: '待办 id（如 t1）' },
      },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        const id = typeof args.id === 'string' ? args.id : ''
        if (!removeItem(id)) return { ok: false, error: '找不到待办 ' + id }
        return { ok: true, removed: id, total: items.length }
      },
    })

    registerTool({
      name: 'todo_clear',
      description: '清除待办：默认只清除已完成的；only_done 为 false 时清空全部。',
      parameters: {
        only_done: { type: 'boolean', description: 'true=仅清除已完成（默认），false=清空全部' },
      },
      output: { schema: { type: 'json' }, render: textRender },
      execute: (args) => {
        if (args && args.only_done === false) {
          const n = items.length
          items = []
          return { ok: true, removed: n, total: 0 }
        }
        const n = clearDone()
        return { ok: true, removed: n, total: items.length }
      },
    })

    // ---------- 面板 RPC（Client→Host） ----------
    const handle = (method, handler) => ctx.effect(() => harness.handle(method, handler))

    handle('list', async () => ({ ok: true, items: snapshot() }))
    handle('add', async (args) => {
      const text = args && typeof args.text === 'string' ? args.text.trim() : ''
      if (!text) return { ok: false, error: '内容不能为空' }
      const it = addItem(text)
      return { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt } }
    })
    handle('toggle', async (args) => {
      const id = args && typeof args.id === 'string' ? args.id : ''
      const it = toggleItem(id)
      if (!it) return { ok: false, error: '找不到该待办' }
      return { ok: true, item: { id: it.id, text: it.text, done: it.done, createdAt: it.createdAt } }
    })
    handle('remove', async (args) => {
      const id = args && typeof args.id === 'string' ? args.id : ''
      if (!removeItem(id)) return { ok: false, error: '找不到该待办' }
      return { ok: true }
    })
    handle('clear', async () => ({ ok: true, removed: clearDone() }))
  },
}
