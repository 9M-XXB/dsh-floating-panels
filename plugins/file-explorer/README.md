# 文件浏览器浮动面板（File Explorer）

DeepSeek Harness（DSH）Web 的动态 Cordis 插件：以可拖拽的浮动窗形式浏览任意文件夹的文件树，类似 VS Code 的资源管理器。

## 功能

- **文件树**：文件夹懒加载展开/折叠（▸/▾）、按扩展名显示图标、文件显示大小（B/KB/MB）
- **文件预览**：点击文本文件在面板内预览（上限 64KB，超限提示；二进制文件提示不可预览）
- **选择文件夹**：📁 按钮调用系统原生目录选择器，浏览任意文件夹（不创建/切换工作区）
- **跟随当前工作区**：🎯 默认跟随最近活跃工作区文件夹——当前对话切换到另一个工作区时自动跟随；手动选择文件夹后点击 🎯 一键恢复跟随
- **自动刷新**：每 3 秒轮询可见目录（根目录 + 已展开的文件夹），磁盘增删改自动反映；面板关闭时暂停
- **浮动窗交互**：按住标题栏拖动、右下角拖拽缩放、📌 固定位置（禁止拖动/缩放）、✕ 关闭
- **开关按钮**：侧边栏底部 📁 按钮开/关面板（窄栏仅图标、宽栏带文字）

## 挂载位置

| 插槽 | id | 说明 |
|---|---|---|
| `shell.overlay` | `file-explorer-panel` | 浮动面板（additive，不替换任何默认 UI） |
| `sidebar.footer.action` | `file-explorer-toggle` | 侧边栏底部开关按钮 |

## Host RPC（Client→Host，包私有）

| 方法 | 入参 | 返回 |
|---|---|---|
| `root` | `{}` | `{ ok, root }` 默认根目录（沙箱工作区根或后端 cwd） |
| `list` | `{ path }` | `{ ok, path, entries: [{ name, type, size, path }] }` |
| `read` | `{ path, maxBytes? }` | `{ ok, content, binary, truncated, size }` |

依赖的 Host 服务：`fs`（必选）、`sandboxPolicy`（可选，默认根目录）。Client 注入：`slots`、`workspaces`、`timer`。

## 安装

这两个插件以**动态 Cordis 插件**形式运行（对应 DSH 会话中的 `cordis_define` 工具）：

1. 调用 `cordis_define`，`plugin.kind: "new"`，`idPrefix: "fexp"`；
2. `code.host` 填入 [host.js](./host.js) 的完整内容，`code.client` 填入 [client.js](./client.js) 的完整内容；
3. 调用 `cordis_run` 激活，批准后即可使用。

> 注意：动态插件是进程内（process-local）的，DSH 重启后需要重新创建。
