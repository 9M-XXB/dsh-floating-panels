# dsh-floating-panels

为 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）Web 界面开发的**动态 Cordis 插件集合**——两个可拖拽的浮动窗：

| 插件 | 目录 | 说明 |
|---|---|---|
| 文件浏览器 | [`plugins/file-explorer`](./plugins/file-explorer) | 浏览任意文件夹的文件树、预览文件、跟随当前工作区、自动刷新 |
| 待办列表 | [`plugins/todo-list`](./plugins/todo-list) | `/todo` 指令 + 浮动面板，添加/勾选/删除待办 |

## 特性

两个插件共用同一套浮动窗交互：

- 按住标题栏**拖动**，右下角**拖拽缩放**
- 📌 **固定位置**（禁止拖动/缩放）
- 侧边栏底部有**开关按钮**（📁 文件浏览器 / ☑ 待办列表）
- 全部通过 **additive 插槽**挂载（`shell.overlay` + `sidebar.footer.action`），不替换任何默认 UI
- 样式使用主题 CSS 变量（`--dsw-alias-*`），自动适配亮/暗色

## 安装

这两个插件以**动态 Cordis 插件**形式运行（与 DSH 会话中的 `cordis_define` 工具对应）：

1. 在 DSH Web 会话中调用 `cordis_define`，`plugin.kind: "new"`，`idPrefix` 建议 `fexp`（文件浏览器）/ `todo`（待办列表）；
2. `code.host` 填入对应目录 `host.js` 的完整内容，`code.client` 填入 `client.js` 的完整内容；
3. 用 `cordis_run` 激活，在界面批准后即可使用。

> **注意**：动态插件是进程内（process-local）的，DSH 重启后需要重新创建。
> 如需**自动启动**（重启后无需重建），请使用 `packages/` 下的 profile 插件版，见下文「自动启动（profile 插件版）」。

## 自动启动（profile 插件版）

`packages/dsh-file-explorer` 与 `packages/dsh-todo-list` 是可直接安装进 DSH profile 的完整插件包（host 半部为真实 Cordis 插件，client 半部为手写 `__ModuleLoader__` bundle，无需构建工具）：

1. 安装（以 profile `web` 为例，需要 `pnpm` 可用；`dsh plugin` 会写 profile 的 package.json + bundles 并链接 node_modules）：
   ```sh
   dsh plugin --profile web add <repo>/packages/dsh-todo-list
   dsh plugin --profile web add <repo>/packages/dsh-file-explorer
   ```
2. 若主机环境无法从仓库目录解析 `@deepseek-ai/*`（link: 依赖的真实路径在仓库内），为 `packages/dsh-todo-list/node_modules` 建一个指向 profile 共享 node_modules 的符号链接：
   ```sh
   ln -sfn ~/.dsh/profiles/node_modules packages/dsh-todo-list/node_modules
   ```
   （该链接是机器特定的，已加入 `.gitignore`。）
3. **重启 dsh** 生效。两个包通过各自的 `cordis.patch.yml`（`dsh.bundle.patch`）自动插入组合树，随 profile 一起启动；无需任何手动重建。

待办数据存储在 `~/.dsh-todo-store.json`（首次启动自动创建；位于用户主目录，绝不在仓库内，不会被上传到 GitHub）。

## 目录结构

```
dsh-floating-panels/
├── plugins/                   # 动态插件源码（cordis_define 直接使用）
│   ├── file-explorer/         #   host.js / client.js / README.md
│   └── todo-list/             #   host.js / client.js / README.md
├── packages/                  # profile 插件包（自动启动）
│   ├── dsh-file-explorer/     #   lib/index.js + lib/client.js + cordis.patch.yml
│   └── dsh-todo-list/         #   lib/index.js + lib/client.js + cordis.patch.yml
└── LICENSE
```

## 兼容性

本仓库插件基于 **DeepSeek Harness `dsh-v0.1.1-rc.2`**（2026-08-21 发布，即官方最新版）开发，并在其运行时契约上验证通过（`fs` / `sandboxPolicy` / `commands` / `harness` / `slots` / `workspaces` / `timer` 等接口均对实际运行时的 Inspect 查询结果实现）。

## 许可

[MIT](./LICENSE)
