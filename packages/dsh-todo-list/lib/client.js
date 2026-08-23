/**
 * dsh-todo-list —— Client 半部（手写 __ModuleLoader__ bundle，无需构建工具）
 * 与 Host 通过同源 HTTP 路由 /dsh-todo 通信；仅依赖 react。
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo-list',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var CSS = [
      '.dsh-todo-float{position:fixed;width:320px;height:min(420px,60vh);min-width:240px;min-height:180px;resize:both;overflow:hidden;pointer-events:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:12px;user-select:none}',
      '.dsh-todo-float-head{display:flex;align-items:center;gap:4px;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:move;touch-action:none;user-select:none;flex:none}',
      '.dsh-todo-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;flex:1;min-width:0}',
      '.dsh-todo-actions{display:flex;gap:2px;flex:none}',
      '.dsh-todo-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:4px;font-size:12px;line-height:1;padding:3px 6px;cursor:pointer}',
      '.dsh-todo-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}',
      '.dsh-todo-btn:disabled{opacity:.5;cursor:default}',
      '.dsh-todo-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-todo-input-row{display:flex;gap:4px;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}',
      '.dsh-todo-input{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:3px 6px;font-size:12px;outline:none}',
      '.dsh-todo-input:focus{border-color:var(--dsw-alias-border-l2)}',
      '.dsh-todo-body{flex:1;min-height:0;overflow:auto}',
      '.dsh-todo-row{display:flex;align-items:center;gap:6px;padding:3px 8px}',
      '.dsh-todo-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-todo-check{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;padding:0;cursor:pointer;flex:none}',
      '.dsh-todo-check:hover{color:var(--dsw-alias-label-primary)}',
      '.dsh-todo-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-todo-done{text-decoration:line-through;color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-time{color:var(--dsw-alias-label-secondary);font-size:11px;flex:none}',
      '.dsh-todo-del{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;padding:0 2px;cursor:pointer;flex:none}',
      '.dsh-todo-del:hover{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-todo-dim{color:var(--dsw-alias-label-secondary)}',
      '.dsh-todo-err{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-todo-empty{padding:10px}',
      '.dsh-todo-hint{padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}',
      '.dsh-todo-toggle{display:flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 8px;border-radius:6px;cursor:pointer;max-width:100%}',
      '.dsh-todo-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-todo-toggle-active{color:var(--dsw-alias-brand-primary)}'
    ].join('\n')
    var cssTag = 'dsh-todo-list-css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + cssTag + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-todo-list'
      tag.dataset.pluginCss = cssTag
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    var RPC = '/dsh-todo'
    var call = function (path, body) {
      var opts = body === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
      return fetch(RPC + path, opts).then(function (res) { return res.json() })
    }

    var inject = ['slots', 'timer']

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return

      var panelOpen = true
      var panelListeners = new Set()
      var subscribePanel = function (fn) { panelListeners.add(fn); return function () { panelListeners.delete(fn) } }
      var setPanelOpen = function (v) { panelOpen = v; panelListeners.forEach(function (fn) { fn() }) }

      function usePanelOpen() {
        var s = React.useState(panelOpen)
        var open = s[0]
        var setOpen = s[1]
        React.useEffect(function () { return subscribePanel(function () { setOpen(panelOpen) }) }, [])
        return open
      }

      var pos = { x: 660, y: 84 }

      var fmtTime = function (ts) {
        try { return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) } catch (e) { return '' }
      }

      function TodoPanel() {
        var open = usePanelOpen()
        var tickState = React.useState(0)
        var setTick = tickState[1]
        var dragRef = React.useRef(null)
        var pinnedState = React.useState(false)
        var pinned = pinnedState[0]
        var setPinned = pinnedState[1]
        var itemsState = React.useState(null)
        var items = itemsState[0]
        var setItems = itemsState[1]
        var inputState = React.useState('')
        var input = inputState[0]
        var setInput = inputState[1]
        var busyState = React.useState(false)
        var busy = busyState[0]
        var setBusy = busyState[1]
        var errorState = React.useState(null)
        var error = errorState[0]
        var setError = errorState[1]

        var load = React.useCallback(function () {
          call('/list').then(function (res) {
            if (!res || !res.ok) { setError((res && res.error) || '加载失败'); return }
            setError(null)
            setItems(function (cur) {
              if (cur && JSON.stringify(cur) === JSON.stringify(res.items)) return cur
              return res.items || []
            })
          }, function () { setError('加载失败') })
        }, [])

        React.useEffect(function () { load() }, [load])

        React.useEffect(function () {
          if (!open) return
          load()
          var timer = ctx.timer.interval(load, 1500)
          return timer
        }, [open, load])

        var add = function () {
          var text = input.trim()
          if (!text || busy) return
          setBusy(true)
          call('/add', { text: text }).then(function (res) {
            if (res && res.ok) { setInput(''); load() }
          }, function () {}).finally(function () { setBusy(false) })
        }
        var toggle = function (id) { call('/toggle', { id: id }).then(load, function () {}) }
        var remove = function (id) { call('/remove', { id: id }).then(load, function () {}) }
        var clearDone = function () { call('/clear', {}).then(load, function () {}) }

        var onHeadDown = function (e) {
          if (pinned) return
          dragRef.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }
          var el = e.currentTarget
          if (el && typeof el.setPointerCapture === 'function') {
            try { el.setPointerCapture(e.pointerId) } catch (err) {}
          }
        }
        var onHeadMove = function (e) {
          if (pinned) return
          var d = dragRef.current
          if (!d) return
          pos = { x: Math.max(0, d.ox + e.clientX - d.px), y: Math.max(0, d.oy + e.clientY - d.py) }
          setTick(function (t) { return t + 1 })
        }
        var onHeadUp = function () { dragRef.current = null }

        var total = items ? items.length : 0
        var doneCount = items ? items.filter(function (i) { return i.done }).length : 0

        var body
        if (error) {
          body = React.createElement('div', { className: 'dsh-todo-err dsh-todo-empty' }, error)
        } else if (items === null) {
          body = React.createElement('div', { className: 'dsh-todo-dim dsh-todo-empty' }, '加载中…')
        } else if (items.length === 0) {
          body = React.createElement('div', { className: 'dsh-todo-dim dsh-todo-empty' }, '暂无待办。在对话中输入 /todo <内容> 添加，或在上方输入框直接添加。')
        } else {
          body = React.createElement('div', { className: 'dsh-todo-body' },
            items.map(function (item) {
              return React.createElement('div', { className: 'dsh-todo-row', key: item.id },
                React.createElement('button', { className: 'dsh-todo-check', title: item.done ? '标记为未完成' : '标记为完成', onClick: function () { toggle(item.id) } }, item.done ? '☑' : '☐'),
                React.createElement('span', { className: 'dsh-todo-text' + (item.done ? ' dsh-todo-done' : ''), title: item.text }, item.text),
                React.createElement('span', { className: 'dsh-todo-time' }, fmtTime(item.createdAt)),
                React.createElement('button', { className: 'dsh-todo-del', title: '删除', onClick: function () { remove(item.id) } }, '✕'))
            })
          )
        }

        return React.createElement('div', {
          className: 'dsh-todo-float',
          style: { left: pos.x, top: pos.y, resize: pinned ? 'none' : 'both', display: open ? undefined : 'none' },
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
              React.createElement('button', { className: 'dsh-todo-btn', title: '清除已完成', onClick: clearDone, disabled: !items || doneCount === 0, onPointerDown: function (e) { e.stopPropagation() } }, '🗑'),
              React.createElement('button', {
                className: 'dsh-todo-btn' + (pinned ? ' dsh-todo-active' : ''),
                title: pinned ? '取消固定（恢复拖动/缩放）' : '固定当前位置（禁止拖动/缩放）',
                onClick: function () { setPinned(!pinned) },
                onPointerDown: function (e) { e.stopPropagation() },
              }, '📌'),
              React.createElement('button', { className: 'dsh-todo-btn', title: '关闭面板', onClick: function () { setPanelOpen(false) }, onPointerDown: function (e) { e.stopPropagation() } }, '✕'))),
          React.createElement('div', { className: 'dsh-todo-input-row' },
            React.createElement('input', {
              className: 'dsh-todo-input',
              type: 'text',
              placeholder: '输入待办内容，回车添加…',
              value: input,
              onChange: function (e) { setInput(e.target.value) },
              onKeyDown: function (e) { if (e.key === 'Enter') add() },
            }),
            React.createElement('button', { className: 'dsh-todo-btn', onClick: add, disabled: busy || !input.trim() }, '添加')),
          body,
          React.createElement('div', { className: 'dsh-todo-hint' }, '对话中输入 /todo <内容> 快速添加；/todo list 查看全部'))
      }

      function TodoToggle(props) {
        var wide = props.wide
        var open = usePanelOpen()
        var label = open ? '收起待办列表' : '打开待办列表'
        return React.createElement('button', {
          className: 'dsh-todo-toggle' + (open ? ' dsh-todo-toggle-active' : ''),
          title: label,
          'aria-label': label,
          onClick: function () { setPanelOpen(!open) },
        },
          React.createElement('span', null, '☑'),
          wide ? React.createElement('span', null, open ? '收起待办列表' : '待办列表') : null)
      }

      slots.inject('shell.overlay', function () { return slots.register({ name: 'shell.overlay', id: 'todo-panel', order: 20, label: function () { return '待办列表' } }, TodoPanel) })
      slots.inject('sidebar.footer.action', function () { return slots.register({ name: 'sidebar.footer.action', id: 'todo-toggle', order: 2, label: function () { return '待办列表' } }, TodoToggle) })
    }

    module.exports = { apply: apply, inject: inject }
    return module.exports
  },
})
