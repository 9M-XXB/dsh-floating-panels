/**
 * 待办列表 —— Client 半部（动态 Cordis 插件）
 *
 * 用法：在 DSH 会话中用 cordis_define 创建插件，把本文件完整内容填入 code.client。
 * 本文件内容是一个"返回 Cordis 插件的普通 JS 函数体"（无 JSX/TS/import）。
 *
 * 功能：
 *   - 浮动面板（shell.overlay，additive）：拖拽 / 缩放 / 📌 固定 / ✕ 关闭
 *   - 顶部输入框 + 回车快速添加
 *   - 每条待办：☐/☑ 点击切换完成（完成后删除线）、时间戳、✕ 删除
 *   - 🗑 清除已完成；标题栏显示 已完成/总数
 *   - 每 1.5 秒轮询 Host 同步——对话中 /todo 添加的内容自动出现在面板
 *   - 侧边栏底部 ☑ 开关按钮（sidebar.footer.action）
 */
return {
  inject: ['slots', 'timer'],
  apply(ctx) {
    styles.insert(`
.dsh-todo-float {
  position: fixed;
  width: 320px;
  height: min(420px, 60vh);
  min-width: 240px;
  min-height: 180px;
  resize: both;
  overflow: hidden;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  user-select: none;
}
.dsh-todo-float-head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  cursor: move;
  touch-action: none;
  user-select: none;
  flex: none;
}
.dsh-todo-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.dsh-todo-actions { display: flex; gap: 2px; flex: none; }
.dsh-todo-btn {
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  padding: 3px 6px;
  cursor: pointer;
}
.dsh-todo-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-todo-btn:disabled { opacity: 0.5; cursor: default; }
.dsh-todo-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-todo-input-row {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
.dsh-todo-input {
  flex: 1;
  min-width: 0;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  outline: none;
}
.dsh-todo-input:focus { border-color: var(--dsw-alias-border-l2); }
.dsh-todo-body { flex: 1; min-height: 0; overflow: auto; }
.dsh-todo-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
}
.dsh-todo-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-todo-check {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  flex: none;
}
.dsh-todo-check:hover { color: var(--dsw-alias-label-primary); }
.dsh-todo-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-todo-done { text-decoration: line-through; color: var(--dsw-alias-label-secondary); }
.dsh-todo-time { color: var(--dsw-alias-label-secondary); font-size: 11px; flex: none; }
.dsh-todo-del {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  flex: none;
}
.dsh-todo-del:hover { color: var(--dsw-alias-state-error-primary); }
.dsh-todo-dim { color: var(--dsw-alias-label-secondary); }
.dsh-todo-err { color: var(--dsw-alias-state-error-primary); }
.dsh-todo-empty { padding: 10px; }
.dsh-todo-hint {
  padding: 4px 8px 6px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  flex: none;
}
.dsh-todo-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  max-width: 100%;
}
.dsh-todo-toggle:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-todo-toggle-active { color: var(--dsw-alias-brand-primary); }
`)

    // ---------- 面板开关状态（fiber 内共享） ----------
    let panelOpen = true
    const panelListeners = new Set()
    const subscribePanel = (fn) => { panelListeners.add(fn); return () => { panelListeners.delete(fn) } }
    const setPanelOpen = (v) => { panelOpen = v; panelListeners.forEach((fn) => fn()) }

    function usePanelOpen() {
      const [open, setOpen] = React.useState(panelOpen)
      React.useEffect(() => subscribePanel(() => setOpen(panelOpen)), [])
      return open
    }

    // ---------- 拖拽位置（fiber 内共享） ----------
    let pos = { x: 660, y: 84 }

    const fmtTime = (ts) => {
      try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) } catch (e) { return '' }
    }

    function TodoPanel() {
      const open = usePanelOpen()
      const [, setTick] = React.useState(0)
      const dragRef = React.useRef(null)
      const [pinned, setPinned] = React.useState(false)
      const [items, setItems] = React.useState(null)
      const [input, setInput] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      const load = React.useCallback(() => {
        host.call('list', {}).then((res) => {
          if (!res || !res.ok) { setError((res && res.error) || '加载失败'); return }
          setError(null)
          setItems((cur) => {
            if (cur && JSON.stringify(cur) === JSON.stringify(res.items)) return cur
            return res.items || []
          })
        }, () => setError('加载失败'))
      }, [])

      React.useEffect(() => { load() }, [load])

      // 轮询同步：对话中用 /todo 添加的内容会自动出现在面板
      React.useEffect(() => {
        if (!open) return
        load()
        const timer = ctx.timer.interval(load, 1500)
        return timer
      }, [open, load])

      const add = () => {
        const text = input.trim()
        if (!text || busy) return
        setBusy(true)
        host.call('add', { text }).then((res) => {
          if (res && res.ok) { setInput(''); load() }
        }, () => {}).finally(() => setBusy(false))
      }
      const toggle = (id) => { host.call('toggle', { id }).then(load, () => {}) }
      const remove = (id) => { host.call('remove', { id }).then(load, () => {}) }
      const clearDone = () => { host.call('clear', {}).then(load, () => {}) }

      const onHeadDown = (e) => {
        if (pinned) return
        dragRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }
        const el = e.currentTarget
        if (el && typeof el.setPointerCapture === 'function') {
          try { el.setPointerCapture(e.pointerId) } catch (err) {}
        }
      }
      const onHeadMove = (e) => {
        if (pinned) return
        const d = dragRef.current
        if (!d) return
        pos = { x: Math.max(0, d.ox + e.clientX - d.px), y: Math.max(0, d.oy + e.clientY - d.py) }
        setTick((t) => t + 1)
      }
      const onHeadUp = () => { dragRef.current = null }

      const total = items ? items.length : 0
      const doneCount = items ? items.filter((i) => i.done).length : 0

      let body
      if (error) {
        body = React.createElement('div', { className: 'dsh-todo-err dsh-todo-empty' }, error)
      } else if (items === null) {
        body = React.createElement('div', { className: 'dsh-todo-dim dsh-todo-empty' }, '加载中…')
      } else if (items.length === 0) {
        body = React.createElement('div', { className: 'dsh-todo-dim dsh-todo-empty' }, '暂无待办。在对话中输入 /todo <内容> 添加，或在上方输入框直接添加。')
      } else {
        body = React.createElement('div', { className: 'dsh-todo-body' },
          items.map((item) => React.createElement('div', { className: 'dsh-todo-row', key: item.id },
            React.createElement('button', { className: 'dsh-todo-check', title: item.done ? '标记为未完成' : '标记为完成', onClick: () => toggle(item.id) }, item.done ? '☑' : '☐'),
            React.createElement('span', { className: 'dsh-todo-text' + (item.done ? ' dsh-todo-done' : ''), title: item.text }, item.text),
            React.createElement('span', { className: 'dsh-todo-time' }, fmtTime(item.createdAt)),
            React.createElement('button', { className: 'dsh-todo-del', title: '删除', onClick: () => remove(item.id) }, '✕'),
          )),
        )
      }

      return React.createElement('div', {
        className: 'dsh-todo-float',
        style: {
          left: pos.x,
          top: pos.y,
          resize: pinned ? 'none' : 'both',
          display: open ? undefined : 'none',
        },
      },
        React.createElement('div', {
          className: 'dsh-todo-float-head',
          style: pinned ? { cursor: 'default' } : undefined,
          onPointerDown: onHeadDown,
          onPointerMove: onHeadMove,
          onPointerUp: onHeadUp,
          onPointerCancel: onHeadUp,
        },
          React.createElement('span', { className: 'dsh-todo-title' }, '✅ 待办列表' + (items ? '（' + doneCount + '/' + total + '）' : '')),
          React.createElement('span', { className: 'dsh-todo-actions' },
            React.createElement('button', { className: 'dsh-todo-btn', title: '清除已完成', onClick: clearDone, disabled: !items || doneCount === 0, onPointerDown: (e) => e.stopPropagation() }, '🗑'),
            React.createElement('button', {
              className: 'dsh-todo-btn' + (pinned ? ' dsh-todo-active' : ''),
              title: pinned ? '取消固定（恢复拖动/缩放）' : '固定当前位置（禁止拖动/缩放）',
              onClick: () => setPinned(!pinned),
              onPointerDown: (e) => e.stopPropagation(),
            }, '📌'),
            React.createElement('button', { className: 'dsh-todo-btn', title: '关闭面板', onClick: () => setPanelOpen(false), onPointerDown: (e) => e.stopPropagation() }, '✕'),
          ),
        ),
        React.createElement('div', { className: 'dsh-todo-input-row' },
          React.createElement('input', {
            className: 'dsh-todo-input',
            type: 'text',
            placeholder: '输入待办内容，回车添加…',
            value: input,
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') add() },
          }),
          React.createElement('button', { className: 'dsh-todo-btn', onClick: add, disabled: busy || !input.trim() }, '添加'),
        ),
        body,
        React.createElement('div', { className: 'dsh-todo-hint' }, '对话中输入 /todo <内容> 快速添加；/todo list 查看全部'),
      )
    }

    function TodoToggle(props) {
      const { wide } = props
      const open = usePanelOpen()
      const label = open ? '收起待办列表' : '打开待办列表'
      return React.createElement('button', {
        className: 'dsh-todo-toggle' + (open ? ' dsh-todo-toggle-active' : ''),
        title: label,
        'aria-label': label,
        onClick: () => setPanelOpen(!open),
      },
        React.createElement('span', null, '☑'),
        wide ? React.createElement('span', null, open ? '收起待办列表' : '待办列表') : null,
      )
    }

    // 浮动面板（全局悬浮层，additive）
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'todo-panel',
      order: 20,
      label: () => '待办列表',
    }, TodoPanel))

    // 侧边栏底部开关按钮
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'todo-toggle',
      order: 2,
      label: () => '待办列表',
    }, TodoToggle))
  },
}
