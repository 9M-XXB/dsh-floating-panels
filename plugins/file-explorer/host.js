/**
 * 文件浏览器 —— Host 半部（动态 Cordis 插件）
 *
 * 用法：在 DSH 会话中用 cordis_define 创建插件，把本文件完整内容填入 code.host。
 * 本文件内容是一个"返回 Cordis 插件的普通 JS 函数体"。
 *
 * 提供的包私有 RPC（Client→Host，JSON）：
 *   - root()       → { ok, root }                默认根目录（沙箱工作区根或后端 cwd）
 *   - list(path)   → { ok, path, entries[] }     懒加载列出一个目录的直接子项
 *   - read(path)   → { ok, content, binary, truncated, size }  预览文本文件（限长 + 二进制检测）
 */
return {
  apply(ctx) {
    const fs = ctx.get('fs')
    const errMsg = (err) => (err instanceof Error ? err.message : String(err))

    // 默认根目录：优先沙箱工作区根，其次后端 cwd
    harness.handle('root', async () => {
      try {
        if (!fs) return { ok: false, error: '文件系统服务不可用' }
        const sp = ctx.get('sandboxPolicy')
        if (sp && sp.workspaceRoot) return { ok: true, root: sp.workspaceRoot }
        const target = await fs.resolve('.')
        return { ok: true, root: fs.processPath(target) }
      } catch (err) {
        return { ok: false, error: errMsg(err) }
      }
    })

    // 懒加载列出一个目录的直接子项（名称、类型、大小、绝对路径）
    harness.handle('list', async (args) => {
      try {
        if (!fs) return { ok: false, error: '文件系统服务不可用' }
        const path = args && typeof args.path === 'string' && args.path ? args.path : '.'
        const target = await fs.resolve(path)
        const entries = await fs.listDir(target)
        const rows = entries.map((entry) => ({
          name: entry.name,
          type: entry.type,
          size: typeof entry.size === 'number' ? entry.size : null,
          path: fs.processPath(entry.target),
        }))
        return { ok: true, path: fs.processPath(target), entries: rows }
      } catch (err) {
        return { ok: false, error: errMsg(err) }
      }
    })

    // 预览文本文件内容（限长 + 二进制检测）
    harness.handle('read', async (args) => {
      try {
        if (!fs) return { ok: false, error: '文件系统服务不可用' }
        if (!args || typeof args.path !== 'string' || !args.path) return { ok: false, error: '缺少文件路径' }
        let maxBytes = 65536
        if (args && typeof args.maxBytes === 'number') {
          maxBytes = Math.max(1024, Math.min(1048576, Math.floor(args.maxBytes)))
        }
        const target = await fs.resolve(args.path)
        const info = await fs.stat(target)
        const size = info && typeof info.size === 'number' ? info.size : null
        if (info && info.type !== 'file') return { ok: false, error: '不是普通文件', size }
        let bytes
        try {
          bytes = await fs.readBytes(target, undefined, maxBytes)
        } catch (err) {
          return { ok: false, tooLarge: true, size, error: errMsg(err) }
        }
        const text = new TextDecoder('utf-8').decode(bytes)
        let binary = false
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i)
          if (code === 0) { binary = true; break }
        }
        if (!binary && text.indexOf('\uFFFD') >= 0) binary = true
        return {
          ok: true,
          path: fs.processPath(target),
          content: binary ? '' : text,
          binary,
          truncated: bytes.length >= maxBytes,
          size,
        }
      } catch (err) {
        return { ok: false, error: errMsg(err) }
      }
    })
  },
}
