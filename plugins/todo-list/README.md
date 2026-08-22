# 待办列表（Todo List）

DeepSeek Harness（DSH）Web 的动态 Cordis 插件：浮动待办列表面板 + `/todo` 斜杠指令。

## 功能

- **`/todo` 指令**（对话输入框使用）：

  | 指令 | 作用 |
  |---|---|
  | `/todo 买牛奶` | 添加一条待办（裸内容直接添加） |
  | `/todo add 写周报` | 同上，显式 add |
  | `/todo done t3` | 完成 / 取消完成（按 id，见面板或 `/todo list`） |
  | `/todo remove t3` | 删除一条 |
  | `/todo clear` | 清除所有已完成 |
  | `/todo list` | 列出全部（带 id 和完成状态） |

  每条指令都会在对话流中显示结果卡片（✅ 已添加 / ☑ 已完成等）。

- **Harness 工具（模型自动调用）**：注册了 5 个动态模型工具，agent 可在后续步骤中直接调用增删改待办（面板 1.5s 内自动同步）：

  | 工具 | 入参 | 说明 |
  |---|---|---|
  | `todo_list` | — | 列出全部条目（id、内容、完成状态、创建时间） |
  | `todo_add` | `text`* | 添加一条待办 |
  | `todo_update` | `id`*, `text`?, `done`? | 更改内容文本和/或完成状态 |
  | `todo_remove` | `id`* | 删除一条 |
  | `todo_clear` | `only_done`? | 默认仅清已完成；`false` 清空全部 |

  （`*` = 必填；`?` = 可选。`id` 形如 `t1`，来自 `todo_list`。）

- **浮动面板**：
  - 顶部输入框 + 回车快速添加
  - 每条待办：☐/☑ 点击切换完成（完成后文字删除线）、时间戳、✕ 删除
  - 🗑 清除已完成（无已完成时禁用）；标题栏显示「✅ 待办列表（已完成/总数）」
  - **每 1.5 秒轮询 Host 同步**——对话里用 `/todo` 添加的内容自动出现在面板
  - 拖拽 / 缩放 / 📌 固定 / ✕ 关闭，交互与文件浏览器插件一致
- **开关按钮**：侧边栏底部 ☑ 按钮开/关面板

## 挂载位置

| 插槽 | id | 说明 |
|---|---|---|
| `shell.overlay` | `todo-panel` | 浮动面板（additive） |
| `sidebar.footer.action` | `todo-toggle` | 侧边栏底部开关按钮 |

## Host RPC（Client→Host，包私有）

| 方法 | 入参 | 返回 |
|---|---|---|
| `list` | `{}` | `{ ok, items: [{ id, text, done, createdAt }] }` |
| `add` | `{ text }` | `{ ok, item }` |
| `toggle` | `{ id }` | `{ ok, item }` |
| `remove` | `{ id }` | `{ ok }` |
| `clear` | `{}` | `{ ok, removed }` |

另注册斜杠指令 `/todo`（依赖 Host 服务 `commands`）。Client 注入：`slots`、`timer`。

## 数据说明

待办数据保存在 Host 进程内（fiber 共享，所有会话共用一张列表）；**插件停止/重启后清空**。如需跨重启持久化，可自行接入 Host 存储域（`storageDomain`）。

## 安装

1. 调用 `cordis_define`，`plugin.kind: "new"`，`idPrefix: "todo"`；
2. `code.host` 填入 [host.js](./host.js) 的完整内容，`code.client` 填入 [client.js](./client.js) 的完整内容；
3. 调用 `cordis_run` 激活，批准后即可使用。

> 注意：动态插件是进程内（process-local）的，DSH 重启后需要重新创建。
