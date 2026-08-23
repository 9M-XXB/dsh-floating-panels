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
> 如需随 DSH 长期安装，可将其打包为 profile 插件（`dsh plugin` / cordis patch 层），参见 DSH 官方文档。

## 目录结构

```
dsh-floating-panels/
├── plugins/
│   ├── file-explorer/
│   │   ├── host.js       # Host 半部（RPC：root/list/read）
│   │   ├── client.js     # Client 半部（浮动面板 UI）
│   │   └── README.md
│   └── todo-list/
│       ├── host.js       # Host 半部（/todo 指令 + RPC：list/add/toggle/remove/clear）
│       ├── client.js     # Client 半部（浮动面板 UI）
│       └── README.md
└── LICENSE
```

## 兼容性

本仓库插件基于 **DeepSeek Harness `dsh-v0.1.1-rc.2`**（2026-08-21 发布，即官方最新版）开发，并在其运行时契约上验证通过（`fs` / `sandboxPolicy` / `commands` / `harness` / `slots` / `workspaces` / `timer` 等接口均对实际运行时的 Inspect 查询结果实现）。

## 许可

[MIT](./LICENSE)
