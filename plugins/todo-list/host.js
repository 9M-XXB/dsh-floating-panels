/**
 * 待办列表 —— Host 半部（动态 Cordis 插件）
 *
 * 用法：在 DSH 会话中用 cordis_define 创建插件，把本文件完整内容填入 code.host。
 * 本文件内容是一个"返回 Cordis 插件的普通 JS 函数体"。
 *
 * 功能：
 *   - 注册 /todo 斜杠指令（对话输入框使用），支持 add/done/remove/clear/list
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
