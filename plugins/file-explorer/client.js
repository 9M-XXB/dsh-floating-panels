/**
 * 文件浏览器 —— Client 半部（动态 Cordis 插件）
 *
 * 用法：在 DSH 会话中用 cordis_define 创建插件，把本文件完整内容填入 code.client。
 * 本文件内容是一个"返回 Cordis 插件的普通 JS 函数体"（无 JSX/TS/import）。
 *
 * 功能：
 *   - 浮动面板（shell.overlay，additive）：拖拽 / 缩放 / 📌 固定 / ✕ 关闭
 *   - 文件树：文件夹懒加载展开/折叠、按扩展名图标、文件大小
 *   - 点击文件 → 面板内预览（≤64KB 截断、二进制检测）
 *   - 🎯 跟随当前工作区（手动选择文件夹后可一键恢复跟随）
 *   - 每 3 秒自动刷新可见目录（面板关闭时暂停）
 *   - 侧边栏底部 📁 开关按钮（sidebar.footer.action）
 */
return {
  inject: ['slots', 'workspaces', 'timer'],
  apply(ctx) {
    styles.insert(`
.dsh-fex-float {
  position: fixed;
  width: 340px;
  height: min(520px, 70vh);
  min-width: 260px;
  min-height: 220px;
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
.dsh-fex-float-head {
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
.dsh-fex-float-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.dsh-fex-head-actions { display: flex; gap: 2px; flex: none; }
.dsh-fex-btn {
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  padding: 3px 6px;
  cursor: pointer;
}
.dsh-fex-btn:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); }
.dsh-fex-btn:disabled { opacity: 0.5; cursor: default; }
.dsh-fex-active { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-fex-float-body { flex: 1; min-height: 0; overflow: auto; }
.dsh-fex-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-fex-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dsh-fex-selected { background: var(--dsw-alias-bg-layer-2); }
.dsh-fex-caret { width: 14px; flex: none; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 10px; }
.dsh-fex-icon { flex: none; font-size: 12px; }
.dsh-fex-name { overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.dsh-fex-size { color: var(--dsw-alias-label-secondary); font-size: 11px; padding-left: 6px; flex: none; }
.dsh-fex-dim { color: var(--dsw-alias-label-secondary); }
.dsh-fex-err { color: var(--dsw-alias-state-error-primary); }
.dsh-fex-pad { padding: 6px 10px; }
.dsh-fex-preview { border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 4px; }
.dsh-fex-preview-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.dsh-fex-preview-body {
  margin: 0;
  padding: 6px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre;
  overflow: auto;
  max-height: 30vh;
  color: var(--dsw-alias-label-primary);
}
.dsh-fex-toggle {
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
.dsh-fex-toggle:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dsh-fex-toggle-active { color: var(--dsw-alias-brand-primary); }
`)

    // ---------- 面板开关状态（fiber 内共享，可被多处订阅） ----------
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
    let pos = { x: 300, y: 84 }

    const MAX_PREVIEW = 65536

    const fmtSize = (n) => {
      if (n == null || n < 0) return ''
      if (n < 1024) return n + ' B'
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1048576).toFixed(1) + ' MB'
    }

    const iconFor = (name, type) => {
      if (type === 'directory') return '📁'
      const dot = name.lastIndexOf('.')
      if (dot <= 0) return '📄'
      const ext = name.slice(dot + 1).toLowerCase()
      if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx' || ext === 'mjs' || ext === 'cjs') return '🟨'
      if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return '📋'
      if (ext === 'md' || ext === 'txt' || ext === 'rst') return '📝'
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'ico') return '🖼️'
      if (ext === 'html' || ext === 'css' || ext === 'scss' || ext === 'less') return '🎨'
      if (ext === 'py' || ext === 'go' || ext === 'rs' || ext === 'java' || ext === 'c' || ext === 'cpp' || ext === 'h') return '🔷'
      return '📄'
    }

    function FileExplorerPanel(props) {
      const { useWorkspaces } = props
      const open = usePanelOpen()
      const [, setTick] = React.useState(0)
      const dragRef = React.useRef(null)
      const [pinned, setPinned] = React.useState(false)

      const [root, setRoot] = React.useState(null)
      const [rootBooting, setRootBooting] = React.useState(true)
      const [rootError, setRootError] = React.useState(null)
      const [manualRoot, setManualRoot] = React.useState(false)
      const [dirs, setDirs] = React.useState({})
      const [expanded, setExpanded] = React.useState({})
      const [preview, setPreview] = React.useState(null)
      const [picking, setPicking] = React.useState(false)

      const recentId = useWorkspaces((s) => s.recentWorkspaceId)
      const items = useWorkspaces((s) => s.items)
      const recentWorkspace = items.find((w) => w.workspaceId === recentId)
      const recentPath = recentWorkspace ? recentWorkspace.path : null

      // 初始/跟随：有最近工作区则显示其文件夹，否则取 Host 默认根目录；手动选择后暂停跟随
      React.useEffect(() => {
        if (manualRoot) return
        if (recentPath) {
          setRoot(recentPath)
          setRootError(null)
          setRootBooting(false)
          return
        }
        let alive = true
        host.call('root', {}).then((res) => {
          if (!alive || manualRoot) return
          if (res && res.ok) { setRoot(res.root); setRootError(null) }
          else setRootError((res && res.error) || '无法确定根目录')
          setRootBooting(false)
        }, () => {
          if (!alive || manualRoot) return
          setRootError('无法确定根目录')
          setRootBooting(false)
        })
        return () => { alive = false }
      }, [recentPath, manualRoot])

      const loadDir = (path) => {
        if (dirs[path] && dirs[path].state === 'loading') return
        setDirs((d) => ({ ...d, [path]: { state: 'loading' } }))
        host.call('list', { path }).then((res) => {
          setDirs((d) => {
            if (!res || !res.ok) {
              return { ...d, [path]: { state: 'error', error: (res && res.error) || '读取失败' } }
            }
            return { ...d, [path]: { state: 'ok', entries: res.entries || [] } }
          })
        }, () => {
          setDirs((d) => ({ ...d, [path]: { state: 'error', error: '读取失败' } }))
        })
      }

      // 静默刷新一个目录（自动轮询用，内容无变化时不触发重渲染）
      const refreshDir = (path) => {
        host.call('list', { path }).then((res) => {
          if (!res || !res.ok) return
          const entries = res.entries || []
          setDirs((d) => {
            const cur = d[path]
            if (!cur || cur.state !== 'ok') return d
            if (JSON.stringify(cur.entries) === JSON.stringify(entries)) return d
            return { ...d, [path]: { state: 'ok', entries } }
          })
        })
      }

      // 根目录变化时加载其内容
      React.useEffect(() => {
        if (!root) return
        if (!dirs[root]) loadDir(root)
        setPreview(null)
      }, [root])

      // 自动刷新：每 3 秒轮询可见目录（根目录 + 已展开的文件夹），面板关闭时暂停
      React.useEffect(() => {
        if (!open) return
        const paths = [root, ...Object.keys(expanded).filter((p) => expanded[p])].filter(Boolean)
        if (paths.length === 0) return
        const timer = ctx.timer.interval(() => {
          paths.forEach((p) => refreshDir(p))
        }, 3000)
        return timer
      }, [open, root, expanded])

      const toggleDir = (path) => {
        const willOpen = !expanded[path]
        setExpanded((e) => ({ ...e, [path]: willOpen }))
        if (willOpen && !dirs[path]) loadDir(path)
      }

      const refresh = () => {
        if (!root) return
        setDirs({})
        setExpanded({})
        setPreview(null)
        loadDir(root)
      }

      // 恢复跟随当前工作区（手动选择文件夹后可一键回到跟随模式）
      const followWorkspace = () => {
        setManualRoot(false)
        setDirs({})
        setExpanded({})
        setPreview(null)
        if (recentPath) {
          setRoot(recentPath)
          loadDir(recentPath)
          return
        }
        host.call('root', {}).then((res) => {
          if (res && res.ok) { setRoot(res.root); loadDir(res.root) }
          else setRootError((res && res.error) || '无法确定根目录')
        })
      }

      const openFile = (path, name) => {
        setPreview({ path, name, loading: true })
        host.call('read', { path, maxBytes: MAX_PREVIEW }).then((res) => {
          if (!res || !res.ok) {
            setPreview({
              path, name, loading: false,
              error: (res && res.error) || '读取失败',
              tooLarge: !!(res && res.tooLarge),
              size: res && res.size,
            })
            return
          }
          setPreview({ path, name, loading: false, content: res.content || '', binary: !!res.binary, truncated: !!res.truncated, size: res.size })
        }, () => {
          setPreview({ path, name, loading: false, error: '读取失败' })
        })
      }

      const pickFolder = () => {
        setPicking(true)
        ctx.workspaces.pickDirectory().then((path) => {
          setPicking(false)
          if (path === null) return
          setManualRoot(true)
          setRoot(path)
          setDirs({})
          setExpanded({})
          setPreview(null)
          loadDir(path)
        }, () => setPicking(false))
      }

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

      const followActive = !manualRoot

      const renderRow = (entry, depth) => {
        const isDir = entry.type === 'directory'
        const isOpen = !!expanded[entry.path]
        const isSel = preview && !isDir && preview.path === entry.path
        const kids = []
        if (isDir && isOpen) {
          const node = dirs[entry.path]
          if (!node || node.state === 'loading') {
            kids.push(React.createElement('div', { key: 'load', className: 'dsh-fex-row dsh-fex-dim', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '加载中…'))
          } else if (node.state === 'error') {
            kids.push(React.createElement('div', { key: 'err', className: 'dsh-fex-row dsh-fex-err', style: { paddingLeft: 8 + (depth + 1) * 14 } }, node.error || '读取失败'))
          } else {
            const entries = node.entries || []
            entries.forEach((child) => kids.push(renderRow(child, depth + 1)))
            if (entries.length === 0) {
              kids.push(React.createElement('div', { key: 'empty', className: 'dsh-fex-row dsh-fex-dim', style: { paddingLeft: 8 + (depth + 1) * 14 } }, '（空文件夹）'))
            }
          }
        }
        const row = React.createElement('div', {
          className: 'dsh-fex-row' + (isSel ? ' dsh-fex-selected' : ''),
          style: { paddingLeft: 8 + depth * 14 },
          onClick: () => { if (isDir) toggleDir(entry.path); else openFile(entry.path, entry.name) },
        },
          React.createElement('span', { className: 'dsh-fex-caret' }, isDir ? (isOpen ? '▾' : '▸') : ''),
          React.createElement('span', { className: 'dsh-fex-icon' }, iconFor(entry.name, entry.type)),
          React.createElement('span', { className: 'dsh-fex-name', title: entry.path }, entry.name),
          !isDir && entry.size != null ? React.createElement('span', { className: 'dsh-fex-size' }, fmtSize(entry.size)) : null,
        )
        return React.createElement(React.Fragment, { key: entry.path }, row, ...kids)
      }

      const rootNode = dirs[root]
      const rootName = root ? (root.split(/[\\/]/).filter(Boolean).pop() || root) : '未选择文件夹'
      let body
      if (rootError) {
        body = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, rootError)
      } else if (rootBooting || !root) {
        body = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '正在初始化…')
      } else if (!rootNode || rootNode.state === 'loading') {
        body = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '加载中…')
      } else if (rootNode.state === 'error') {
        body = React.createElement('div', { className: 'dsh-fex-err dsh-fex-pad' }, rootNode.error || '读取失败')
      } else {
        const entries = rootNode.entries || []
        body = React.createElement('div', { className: 'dsh-fex-tree' }, entries.map((entry) => renderRow(entry, 0)))
      }

      let previewPane = null
      if (preview) {
        let status = '加载中…'
        let content = React.createElement('div', { className: 'dsh-fex-dim dsh-fex-pad' }, '加载中…')
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
            React.createElement('span', null, status),
          ),
          content,
        )
      }

      return React.createElement('div', {
        className: 'dsh-fex-float',
        style: {
          left: pos.x,
          top: pos.y,
          resize: pinned ? 'none' : 'both',
          display: open ? undefined : 'none',
        },
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
              onPointerDown: (e) => e.stopPropagation(),
            }, '🎯'),
            React.createElement('button', {
              className: 'dsh-fex-btn' + (pinned ? ' dsh-fex-active' : ''),
              title: pinned ? '取消固定（恢复拖动/缩放）' : '固定当前位置（禁止拖动/缩放）',
              onClick: () => setPinned(!pinned),
              onPointerDown: (e) => e.stopPropagation(),
            }, '📌'),
            React.createElement('button', { className: 'dsh-fex-btn', title: '刷新', onClick: refresh, disabled: !root, onPointerDown: (e) => e.stopPropagation() }, '↻'),
            React.createElement('button', { className: 'dsh-fex-btn', title: '选择文件夹', onClick: pickFolder, disabled: picking, onPointerDown: (e) => e.stopPropagation() }, '📁'),
            React.createElement('button', { className: 'dsh-fex-btn', title: '关闭面板', onClick: () => setPanelOpen(false), onPointerDown: (e) => e.stopPropagation() }, '✕'),
          ),
        ),
        React.createElement('div', { className: 'dsh-fex-float-body' }, body, previewPane),
      )
    }

    function ExplorerToggle(props) {
      const { wide } = props
      const open = usePanelOpen()
      const label = open ? '收起文件浏览器' : '打开文件浏览器'
      return React.createElement('button', {
        className: 'dsh-fex-toggle' + (open ? ' dsh-fex-toggle-active' : ''),
        title: label,
        'aria-label': label,
        onClick: () => setPanelOpen(!open),
      },
        React.createElement('span', null, '📁'),
        wide ? React.createElement('span', null, open ? '收起文件浏览器' : '文件浏览器') : null,
      )
    }

    // 浮动面板（全局悬浮层，additive）
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'file-explorer-panel',
      order: 10,
      label: () => '文件浏览器',
    }, FileExplorerPanel))

    // 侧边栏底部开关按钮（additive，不影响默认的“添加工作区”目录流）
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'file-explorer-toggle',
      order: 1,
      label: () => '文件浏览器',
    }, ExplorerToggle))
  },
}
