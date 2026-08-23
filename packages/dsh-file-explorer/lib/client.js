/**
 * dsh-file-explorer —— Client 半部（手写 __ModuleLoader__ bundle）
 * 与 Host 通过同源 HTTP 路由 /dsh-fex 通信；仅依赖 react。
 */
window.__ModuleLoader__.load({
  id: 'dsh-file-explorer',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var CSS = [
      '.dsh-fex-float{position:fixed;width:340px;height:min(520px,70vh);min-width:260px;min-height:220px;resize:both;overflow:hidden;pointer-events:auto;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.22);color:var(--dsw-alias-label-primary);font-size:12px;user-select:none}',
      '.dsh-fex-float-head{display:flex;align-items:center;gap:4px;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:move;touch-action:none;user-select:none;flex:none}',
      '.dsh-fex-float-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;flex:1;min-width:0}',
      '.dsh-fex-head-actions{display:flex;gap:2px;flex:none}',
      '.dsh-fex-btn{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:4px;font-size:12px;line-height:1;padding:3px 6px;cursor:pointer}',
      '.dsh-fex-btn:hover:not(:disabled){border-color:var(--dsw-alias-border-l2)}',
      '.dsh-fex-btn:disabled{opacity:.5;cursor:default}',
      '.dsh-fex-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dsh-fex-float-body{flex:1;min-height:0;overflow:auto}',
      '.dsh-fex-row{display:flex;align-items:center;gap:4px;padding:2px 8px;white-space:nowrap;cursor:pointer}',
      '.dsh-fex-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-fex-selected{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-fex-caret{width:14px;flex:none;text-align:center;color:var(--dsw-alias-label-secondary);font-size:10px}',
      '.dsh-fex-icon{flex:none;font-size:12px}',
      '.dsh-fex-name{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}',
      '.dsh-fex-size{color:var(--dsw-alias-label-secondary);font-size:11px;padding-left:6px;flex:none}',
      '.dsh-fex-dim{color:var(--dsw-alias-label-secondary)}',
      '.dsh-fex-err{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-fex-pad{padding:6px 10px}',
      '.dsh-fex-preview{border-top:1px solid var(--dsw-alias-border-l1);margin-top:4px}',
      '.dsh-fex-preview-head{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.dsh-fex-preview-body{margin:0;padding:6px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre;overflow:auto;max-height:30vh;color:var(--dsw-alias-label-primary)}',
      '.dsh-fex-toggle{display:flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 8px;border-radius:6px;cursor:pointer;max-width:100%}',
      '.dsh-fex-toggle:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsh-fex-toggle-active{color:var(--dsw-alias-brand-primary)}'
    ].join('\n')
    var cssTag = 'dsh-file-explorer-css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + cssTag + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-file-explorer'
      tag.dataset.pluginCss = cssTag
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    var RPC = '/dsh-fex'
    var get = function (path) {
      return fetch(RPC + path).then(function (res) { return res.json() })
    }

    var inject = ['slots', 'workspaces', 'timer']

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

      var pos = { x: 300, y: 84 }
      var MAX_PREVIEW = 65536

      var fmtSize = function (n) {
        if (n == null || n < 0) return ''
        if (n < 1024) return n + ' B'
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
        return (n / 1048576).toFixed(1) + ' MB'
      }

      var iconFor = function (name, type) {
        if (type === 'directory') return '📁'
        var dot = name.lastIndexOf('.')
        if (dot <= 0) return '📄'
        var ext = name.slice(dot + 1).toLowerCase()
        if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'mjs' || ext === 'cjs') return '🟨'
        if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return '📋'
        if (ext === 'md' || ext === 'txt' || ext === 'rst') return '📝'
        if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'ico') return '🖼️'
        if (ext === 'html' || ext === 'css' || ext === 'scss' || ext === 'less') return '🎨'
        if (ext === 'py' || ext === 'go' || ext === 'rs' || ext === 'java' || ext === 'c' || ext === 'cpp' || ext === 'h') return '🔷'
        return '📄'
      }

      function FileExplorerPanel(props) {
        var useWorkspaces = props.useWorkspaces
        var open = usePanelOpen()
        var tickState = React.useState(0)
        var setTick = tickState[1]
        var dragRef = React.useRef(null)
        var pinnedState = React.useState(false)
        var pinned = pinnedState[0]
        var setPinned = pinnedState[1]
        var rootState = React.useState(null)
        var root = rootState[0]
        var setRoot = rootState[1]
        var bootingState = React.useState(true)
        var rootBooting = bootingState[0]
        var setRootBooting = bootingState[1]
        var rootErrorState = React.useState(null)
        var rootError = rootErrorState[0]
        var setRootError = rootErrorState[1]
        var manualRootState = React.useState(false)
        var manualRoot = manualRootState[0]
        var setManualRoot = manualRootState[1]
        var dirsState = React.useState({})
        var dirs = dirsState[0]
        var setDirs = dirsState[1]
        var expandedState = React.useState({})
        var expanded = expandedState[0]
        var setExpanded = expandedState[1]
        var previewState = React.useState(null)
        var preview = previewState[0]
        var setPreview = previewState[1]
        var pickingState = React.useState(false)
        var picking = pickingState[0]
        var setPicking = pickingState[1]

        var recentId = useWorkspaces(function (s) { return s.recentWorkspaceId })
        var items = useWorkspaces(function (s) { return s.items })
        var recentWorkspace = items.find(function (w) { return w.workspaceId === recentId })
        var recentPath = recentWorkspace ? recentWorkspace.path : null

        React.useEffect(function () {
          if (manualRoot) return
          if (recentPath) {
            setRoot(recentPath)
            setRootError(null)
            setRootBooting(false)
            return
          }
          var alive = true
          get('/root').then(function (res) {
            if (!alive || manualRoot) return
            if (res && res.ok) { setRoot(res.root); setRootError(null) }
            else setRootError((res && res.error) || '无法确定根目录')
            setRootBooting(false)
          }, function () {
            if (!alive || manualRoot) return
            setRootError('无法确定根目录')
            setRootBooting(false)
          })
          return function () { alive = false }
        }, [recentPath, manualRoot])

        var loadDir = function (path) {
          if (dirs[path] && dirs[path].state === 'loading') return
          setDirs(function (d) { var n = {}; for (var k in d) n[k] = d[k]; n[path] = { state: 'loading' }; return n })
          get('/list?path=' + encodeURIComponent(path)).then(function (res) {
            setDirs(function (d) {
              var n = {}
              for (var k in d) n[k] = d[k]
              if (!res || !res.ok) n[path] = { state: 'error', error: (res && res.error) || '读取失败' }
              else n[path] = { state: 'ok', entries: res.entries || [] }
              return n
            })
          }, function () {
            setDirs(function (d) { var n = {}; for (var k in d) n[k] = d[k]; n[path] = { state: 'error', error: '读取失败' }; return n })
          })
        }

        var refreshDir = function (path) {
          get('/list?path=' + encodeURIComponent(path)).then(function (res) {
            if (!res || !res.ok) return
            var entries = res.entries || []
            setDirs(function (d) {
              var cur = d[path]
              if (!cur || cur.state !== 'ok') return d
              if (JSON.stringify(cur.entries) === JSON.stringify(entries)) return d
              var n = {}
              for (var k in d) n[k] = d[k]
              n[path] = { state: 'ok', entries: entries }
              return n
            })
          })
        }

        React.useEffect(function () {
          if (!root) return
          if (!dirs[root]) loadDir(root)
          setPreview(null)
        }, [root])

        React.useEffect(function () {
          if (!open) return
          var paths = [root]
          for (var k in expanded) if (expanded[k]) paths.push(k)
          paths = paths.filter(Boolean)
          if (paths.length === 0) return
          var timer = ctx.timer.interval(function () {
            paths.forEach(function (p) { refreshDir(p) })
          }, 3000)
          return timer
        }, [open, root, expanded])

        var toggleDir = function (path) {
          var willOpen = !expanded[path]
          var ne = {}
          for (var k in expanded) ne[k] = expanded[k]
          ne[path] = willOpen
          setExpanded(ne)
          if (willOpen && !dirs[path]) loadDir(path)
        }

        var refresh = function () {
          if (!root) return
          setDirs({})
          setExpanded({})
          setPreview(null)
          loadDir(root)
        }

        var followWorkspace = function () {
          setManualRoot(false)
          setDirs({})
          setExpanded({})
          setPreview(null)
          if (recentPath) {
            setRoot(recentPath)
            loadDir(recentPath)
            return
          }
          get('/root').then(function (res) {
            if (res && res.ok) { setRoot(res.root); loadDir(res.root) }
            else setRootError((res && res.error) || '无法确定根目录')
          })
        }

        var openFile = function (path, name) {
          setPreview({ path: path, name: name, loading: true })
          get('/read?path=' + encodeURIComponent(path) + '&maxBytes=' + MAX_PREVIEW).then(function (res) {
            if (!res || !res.ok) {
              setPreview({ path: path, name: name, loading: false, error: (res && res.error) || '读取失败', tooLarge: !!(res && res.tooLarge), size: res && res.size })
              return
            }
            setPreview({ path: path, name: name, loading: false, content: res.content || '', binary: !!res.binary, truncated: !!res.truncated, size: res.size })
          }, function () {
            setPreview({ path: path, name: name, loading: false, error: '读取失败' })
          })
        }

        var pickFolder = function () {
          setPicking(true)
          ctx.workspaces.pickDirectory().then(function (path) {
            setPicking(false)
            if (path === null) return
            setManualRoot(true)
            setRoot(path)
            setDirs({})
            setExpanded({})
            setPreview(null)
            loadDir(path)
          }, function () { setPicking(false) })
        }

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

        var followActive = !manualRoot

        var renderRow = function (entry, depth) {
          var isDir = entry.type === 'directory'
          var isOpen = !!expanded[entry.path]
          var isSel = preview && !isDir && preview.path === entry.path
          var kids = []
          if (isDir && isOpen) {
            var node = dirs[entry.path]
            if (!node || node.state === 'loading') {
              kids.push(React.createElement('div', { key: 'load', className: 'dsh-fex-row dsh-fex-dim', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '加载中…'))
            } else if (node.state === 'error') {
              kids.push(React.createElement('div', { key: 'err', className: 'dsh-fex-row dsh-fex-err', style: { paddingLeft: 8 + (depth + 1) * 14 } }, node.error || '读取失败'))
            } else {
              var entries = node.entries || []
              entries.forEach(function (child) { kids.push(renderRow(child, depth + 1)) })
              if (entries.length === 0) {
                kids.push(React.createElement('div', { key: 'empty', className: 'dsh-fex-row dsh-fex-dim', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '（空文件夹）'))
              }
            }
          }
          var row = React.createElement('div', {
            className: 'dsh-fex-row' + (isSel ? ' dsh-fex-selected' : ''),
            style: { paddingLeft: 8 + depth * 14 },
            onClick: function () { if (isDir) toggleDir(entry.path); else openFile(entry.path, entry.name) },
          },
            React.createElement('span', { className: 'dsh-fex-caret' }, isDir ? (isOpen ? '▾' : '▸') : ''),
            React.createElement('span', { className: 'dsh-fex-icon' }, iconFor(entry.name, entry.type)),
            React.createElement('span', { className: 'dsh-fex-name', title: entry.path }, entry.name),
            !isDir && entry.size != null ? React.createElement('span', { className: 'dsh-fex-size' }, fmtSize(entry.size)) : null)
          return React.createElement(React.Fragment, { key: entry.path }, row, kids)
        }

        var rootNode = dirs[root]
        var rootName = root ? (root.split(/[\\/]/).filter(Boolean).pop() || root) : '未选择文件夹'
        var body
        if (rootError) {
          body = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, rootError)
        } else if (rootBooting || !root) {
          body = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '正在初始化…')
        } else if (!rootNode || rootNode.state === 'loading') {
          body = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '加载中…')
        } else if (rootNode.state === 'error') {
          body = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, rootNode.error || '读取失败')
        } else {
          var entries = rootNode.entries || []
          body = React.createElement('div', { className: 'dsh-fex-tree' }, entries.map(function (entry) { return renderRow(entry, 0) }))
        }

        var previewPane = null
        if (preview) {
          var status = '加载中…'
          var content = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '加载中…')
          if (!preview.loading) {
            if (preview.error) {
              if (preview.tooLarge) {
                status = '文件过大'
                content = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, '文件过大，无法预览（' + (preview.size != null ? fmtSize(preview.size) : '未知大小') + '）')
              } else {
                status = '读取失败'
                content = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, preview.error)
              }
            } else if (preview.binary) {
              status = '二进制文件'
              content = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '二进制文件，无法预览')
            } else {
              status = (preview.size != null ? fmtSize(preview.size) : '') + (preview.truncated ? '（仅前 ' + Math.floor(MAX_PREVIEW / 1024) + ' KB）' : '')
              content = React.createElement('pre', { className: 'dsh-fex-preview-body' }, preview.content)
            }
          }
          previewPane = React.createElement('div', { className: 'dsh-fex-preview' },
            React.createElement('div', { className: 'dsh-fex-preview-head' },
              React.createElement('span', { title: preview.path }, preview.name || preview.path),
              React.createElement('span', null, status)),
            content)
        }

        return React.createElement('div', {
          className: 'dsh-fex-float',
          style: { left: pos.x, top: pos.y, resize: pinned ? 'none' : 'both', display: open ? undefined : 'none' },
        },
          React.createElement('div', {
            className: 'dsh-fex-float-head',
            style: pinned ? { cursor: 'default' } : undefined,
            onPointerDown: onHeadDown,
            onPointerMove: onHeadMove,
            onPointerUp: onHeadUp,
            onPointerCancel: onHeadUp,
          },
            React.createElement('span', { className: 'dsh-fex-float-title', title: root || '' }, (root ? '📂 ' : '') + rootName),
            React.createElement('span', { className: 'dsh-fex-head-actions' },
              React.createElement('button', {
                className: 'dsh-fex-btn' + (followActive ? ' dsh-fex-active' : ''),
                title: followActive ? '正在跟随当前工作区（点击重新定位）' : '跟随当前工作区（恢复自动切换）',
                onClick: followWorkspace,
                onPointerDown: function (e) { e.stopPropagation() },
              }, '🎯'),
              React.createElement('button', {
                className: 'dsh-fex-btn' + (pinned ? ' dsh-fex-active' : ''),
                title: pinned ? '取消固定（恢复拖动/缩放）' : '固定当前位置（禁止拖动/缩放）',
                onClick: function () { setPinned(!pinned) },
                onPointerDown: function (e) { e.stopPropagation() },
              }, '📌'),
              React.createElement('button', { className: 'dsh-fex-btn', title: '刷新', onClick: refresh, disabled: !root, onPointerDown: function (e) { e.stopPropagation() } }, '↻'),
              React.createElement('button', { className: 'dsh-fex-btn', title: '选择文件夹', onClick: pickFolder, disabled: picking, onPointerDown: function (e) { e.stopPropagation() } }, '📁'),
              React.createElement('button', { className: 'dsh-fex-btn', title: '关闭面板', onClick: function () { setPanelOpen(false) }, onPointerDown: function (e) { e.stopPropagation() } }, '✕'))),
          React.createElement('div', { className: 'dsh-fex-float-body' }, body, previewPane))
      }

      function ExplorerToggle(props) {
        var wide = props.wide
        var open = usePanelOpen()
        var label = open ? '收起文件浏览器' : '打开文件浏览器'
        return React.createElement('button', {
          className: 'dsh-fex-toggle' + (open ? ' dsh-fex-toggle-active' : ''),
          title: label,
          'aria-label': label,
          onClick: function () { setPanelOpen(!open) },
        },
          React.createElement('span', null, '📁'),
          wide ? React.createElement('span', null, open ? '收起文件浏览器' : '文件浏览器') : null)
      }

      slots.inject('shell.overlay', function () { return slots.register({ name: 'shell.overlay', id: 'file-explorer-panel', order: 10, label: function () { return '文件浏览器' } }, FileExplorerPanel) })
      slots.inject('sidebar.footer.action', function () { return slots.register({ name: 'sidebar.footer.action', id: 'file-explorer-toggle', order: 1, label: function () { return '文件浏览器' } }, ExplorerToggle) })
    }

    module.exports = { apply: apply, inject: inject }
    return module.exports
  },
})
