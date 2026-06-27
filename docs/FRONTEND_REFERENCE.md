# Dukou 前端架构与后端对接说明

本文对应当前 `dukou-site` 前端实现，目标是给后续后端建设一个清晰边界：

- 现在前端已经有哪些页面、状态和数据模型
- 哪些能力已经有 transport 占位，哪些还是纯前端本地态
- 后端真正开工时，接口应该怎么落
- 哪些地方不能按 CCC 原样照抄

## 1. 当前产品边界

当前前端不是通用 IM，也不是完整 CCC 复刻，核心是一个移动端角色聊天壳：

- 单聊角色窗口：`Nortia`、`岑序`、`渡口`
- 角色切换：在聊天页左上头像入口里切换不同窗口
- 群聊窗口：前端已有独立页面和 transport，但仍偏 mock/占位
- Function 页：现在只保留两块
  - `日程`：全局，属于 `17`
  - `提醒`：按 AI 角色归属
- 设置页：目前大部分仍是全局设置，后面建议拆成角色级设置
- Terminal 浮层：独立于聊天 transport，走单独 WebSocket

旧首页里的书影、动态、潮汐标本相关旧功能，运行态已经基本移出主流程，不应再作为后端建设依据。

## 2. 页面与模块结构

### 2.1 App 壳层

`src/App.jsx`

- `Entry` 负责进入页
- `Chat` 是主聊天页
- `FunctionPage` 是日程/提醒页
- `Settings` 是设置页
- `TerminalOverlay` 是全屏终端浮层

状态切换逻辑：

- `activeTab = chat | function | settings`
- 聊天页顶部提醒按钮会打开 `FunctionPage(reminders)`
- 底部 Function tab 会打开 `FunctionPage(schedule)`

这意味着前端已经把“提醒”和“日程”明确区分成两个入口，而不是一个混合功能广场。

### 2.2 Chat 主聊天页

`src/pages/Chat.jsx`

这是当前最重的页面，承担了：

- 角色单聊窗口切换
- 消息展示、发送、引用、重发、编辑
- 本地消息归档联动
- 记忆/上下文注入
- 设置入口、提醒入口、终端入口
- 聊天窗口抽屉

当前聊天窗口集合：

- `main` -> Nortia
- `group` -> 群聊
- `cenxu` -> 岑序
- `dukou` -> 渡口

注意：

- UI 上虽然有 `group` 窗口，但它和单聊的数据模型并不完全相同
- 单聊消息归档是 `conversationId/chatSpaceId` 维度
- 群聊是单独一套 `groupTransport`

所以后端不要把单聊和群聊硬塞成同一个接口格式。

### 2.3 Function 页

`src/pages/FunctionPage.jsx`

现在只剩两个业务面板：

#### 日程 Schedule

- 全局数据，只属于 `17`
- 当前存在日期切换、滑动切换、添加、编辑、完成、取消、过期
- 目前按天展示，时间字段为：
  - `date`
  - `startsAt`
  - `endsAt`
- 支持无时间任务，落在“稍后 / 未安排”

#### 提醒 Reminders

- 每条提醒必须有 `ownerRole`
- 当前 owner 角色是：
  - `nortia`
  - `cenxu`
  - `dukou`
- 提醒状态当前使用：
  - `pending`
  - `done`
  - `snoozed`
  - `expired`

其中 UI 文案已经被改写为更贴近日常使用的语义，后端真正存储时可以保留英文状态码，前端负责映射。

最重要的一条业务规则：

- 提醒属于“发出提醒的角色”
- 当用户把提醒标记为“已完成”或“已取消”时，这个反馈会被写回该角色对应的聊天窗口

当前这一步已经通过本地消息归档完成，后端接入后也必须保留这个模型，不然提醒和聊天会断链。

### 2.4 GroupChat 页

`src/pages/GroupChat.jsx`

群聊页已经有完整前端结构：

- roster 拉取
- 轮询消息
- 发送消息
- 按角色筛消息
- `@角色` 提及

但它现在仍是“前端已定形，后端未正式接入”的状态。可以把它视为群聊后端 contract 的前置草图。

### 2.5 Settings 页

`src/pages/Settings.jsx`

设置页目前还是“全局设置优先”的实现，包含：

- 模型设置
- 记忆设置
- transport 设置
- terminal 设置
- command 设置
- UI 设置

这和你现在的产品目标并不完全一致。

后面如果做正式后端，建议优先拆成：

- 全局设置
  - 用户信息
  - 全局日程
  - 设备级 transport/terminal 基础地址
- 角色设置
  - system prompt
  - 模型接入
  - 记忆模式
  - 角色自己的提醒策略

## 3. 前端数据层

## 3.1 本地消息归档

`src/api/messageArchive.js`

当前消息归档使用 IndexedDB：

- DB: `dukou-message-archive`
- store: `messages`

核心索引：

- `conversationCreatedAt`
- `conversationRoleCreatedAt`
- `createdAt`

消息记录的关键字段：

- `id`
- `conversationId`
- `chatSpaceId`
- `sessionId`
- `role`
- `content`
- `createdAt`
- `quote`
- `responseGroupId`
- `status`
- `meta`

这里的 `conversationId/chatSpaceId` 很关键。后端如果以后落库，必须保留这个层级，因为当前前端已经把它当成窗口隔离键来用了。

建议后端消息表至少保留：

- `message_id`
- `conversation_id`
- `chat_space_id`
- `sender_type` (`user|assistant|system`)
- `sender_role_id`
- `content`
- `created_at`
- `status`
- `quote_message_id`
- `response_group_id`
- `meta_json`

### 3.2 Function 本地存储

`src/store/functionLocalStore.js`

现在 Function 相关 localStorage 只保留：

- `dukou:reminders:v1`
- `dukou:schedule:v1`

这是一个很重要的收缩结果，说明旧功能已经不应该继续反向污染后端设计。

对应后端时，建议也只先建两类资源：

- `schedule_items`
- `role_reminders`

不要把“动态”“书影”“旧 function 卡片”一起带回去。

### 3.3 设置存储

`src/store/settings.js`

当前设置拆成多块 localStorage：

- `dukou:modelSettings`
- `dukou:uiSettings`
- `dukou:memorySettings`
- `dukou:transportSettings`
- `dukou:promptSettings`
- `dukou:terminalSettings`
- `dukou:commandSettings`

问题在于：这些现在还是“应用级”，不是“角色级”。

如果后端开始建设，建议直接跳过“先做全局再迁移”的路线，后端 schema 从一开始就做成：

- `user_settings`
- `role_settings`
- `role_model_bindings`
- `role_memory_bindings`

不然之后还要二次迁移。

## 4. transport 分层

## 4.1 单聊 transport

`src/api/chatTransport.js`

当前支持四种 transport 标识：

- `mock`
- `direct_model`
- `kiwi_direct`
- `backend_gateway`

其中真正有意义的是：

- `direct_model`：前端直连模型
- `kiwi_direct`：前端直连本地记忆/模型网关

`backend_gateway` 现在只是占位，还没有实际请求。

这意味着如果你们要上真正后端，最合理的做法不是继续加强 `direct_model`，而是把 `backend_gateway` 做实，作为所有正式聊天能力的统一入口。

## 4.2 群聊 transport

`src/api/groupTransport.js`

这里已经定义了很清晰的后端接口草案：

- `GET /group/roster`
- `GET /group/poll?since=...&limit=...`
- `POST /group/send`

mock 和 real 两套模式都已经写了。

当前 `real` 模式默认请求头：

- `Content-Type: application/json`（有 body 时）
- `X-Auth-Token: <token>`（如果配置了 token）

这套接口适合“HTTP 轮询 tmux/capture + POST tmux/send”那条路线，尤其适合你现在不是云服务器、而是本机或局域网部署的阶段。

## 4.3 Terminal transport

`src/api/terminalTransport.real.js`

终端是独立通道，不跟聊天共用 transport。

当前约定：

- 前端连接一个 WebSocket 终端端点
- 用户输入直接发原始文本
- resize 发：

```json
{"__resize":{"cols":80,"rows":24}}
```

后端只需要做一件事：

- 把 PTY 输出原样推给前端

这很适合 Ubuntu 上用 `tmux + pty + websocket bridge` 来实现。

## 4.4 Command transport

仓库里还有 command 浮窗相关 transport，但它和当前主目标不是一条主线。

如果后端资源有限，优先级应该低于：

1. 单聊网关
2. 群聊网关
3. 提醒/日程持久化
4. 终端桥接

## 5. 后端建设建议

## 5.1 建议的后端边界

如果后端正式开工，建议直接拆成四块：

### A. chat gateway

负责单聊：

- 接收前端消息
- 组装角色 prompt / memory / recent messages
- 调模型或调本地 agent
- 回传 assistant 消息
- 持久化消息

### B. group gateway

负责群聊：

- 维护 roster
- 接收用户群聊消息
- 决定哪些角色该回复
- 轮询返回新增消息

第一版完全可以就是：

- HTTP 轮询读消息
- HTTP POST 发消息
- 后端内部用 tmux/session 驱动不同 agent

### C. scheduler/reminder service

负责：

- 全局日程
- 角色提醒
- 提醒状态流转
- 把提醒反馈写回对应角色对话

### D. terminal bridge

负责：

- WebSocket
- PTY/tmux
- 认证
- resize

这四块可以是一个服务，也可以是一个进程里的四个模块，但接口边界最好分清。

## 5.2 推荐的第一阶段接口

如果你现在要尽快从“纯前端”走到“能用”，我建议第一阶段只做这些：

### 单聊

- `POST /chat/send`
- `GET /chat/history?chat_space_id=...&before=...`

`POST /chat/send` 请求体建议至少包含：

```json
{
  "chat_space_id": "cenxu",
  "conversation_id": "cenxu",
  "message": {
    "role": "user",
    "content": "..."
  },
  "quote": null
}
```

返回建议至少包含：

```json
{
  "ok": true,
  "assistant_message": {
    "id": "message_xxx",
    "conversationId": "cenxu",
    "chatSpaceId": "cenxu",
    "role": "assistant",
    "content": "...",
    "createdAt": "2026-06-27T12:00:00.000Z",
    "responseGroupId": "reply-cenxu-xxx",
    "meta": {}
  }
}
```

### 群聊

- `GET /group/roster`
- `GET /group/poll`
- `POST /group/send`

这三条直接沿用当前 `groupTransport.js` 即可。

### 日程

- `GET /schedule?date_from=...&date_to=...`
- `POST /schedule`
- `PATCH /schedule/:id`

### 提醒

- `GET /reminders?owner_role=...&status=...`
- `POST /reminders`
- `PATCH /reminders/:id/status`

提醒状态修改接口应允许：

- `done`
- `snoozed`
- `expired`

同时后端要负责追加一条聊天反馈消息，或者返回一个“需要写回聊天”的事件结果。

## 5.3 SSE / 请求头约定

你前面强调过请求头，这里明确写死：

- 如果后端做流式聊天，建议统一走 SSE
- 响应头：`Content-Type: text/event-stream`
- 请求头：`Accept: text/event-stream`

如果后续把 ombrebrain / 记忆网关也纳入统一网关，这个约定可以继续沿用。

但要区分三种通道：

- 普通 CRUD：`application/json`
- 流式聊天：`text/event-stream`
- 终端：`WebSocket`

不要把提醒、日程这类普通写操作也做成 SSE。

## 5.4 角色设置必须独立

这是当前后端设计里最容易偷懒、但后面最容易返工的点。

你现在的产品目标已经明确：

- 人类用户只有 `17`
- AI 角色至少有 `Nortia`、`岑序`、`渡口`

所以后端从第一天起就应该支持：

- 每个角色独立模型
- 每个角色独立 system prompt
- 每个角色独立记忆策略
- 每个角色独立提醒列表

否则“切角色聊天”和“群聊里不同角色说话”只是 UI 假象。

## 6. 和 CCC 的关系：哪些能抄，哪些别抄

可以借鉴 CCC 的地方：

- 群聊 roster 结构
- 轮询式群聊消息接口
- tmux 驱动多 agent 的思路
- 群聊里按角色回消息，而不是“群聊统一头像”

不建议原样照抄的地方：

- CCC 是它自己的产品结构，不是你现在这个“单聊为主、群聊为辅、提醒按角色挂载”的结构
- 你这里还有日程/提醒/角色设置三条独立业务线
- 当前前端已经把聊天窗口和功能归属改得更细，不应该再回退到一个全局大面板

结论很直接：

- 群聊后端思路可以抄 CCC
- 整个产品信息架构不能按 CCC 原样搬

## 7. 实施顺序建议

我建议按这个顺序做：

1. 做 `backend_gateway` 单聊入口
2. 把消息持久化从纯前端 IndexedDB 升级为“前端缓存 + 后端真存储”
3. 做群聊三接口：`roster / poll / send`
4. 做角色级 reminders 持久化和回写聊天
5. 做全局 schedule 持久化
6. 最后再把 settings 拆成角色级配置

原因很简单：

- 先把聊天链路打通，产品才活
- 再把提醒和日程迁过去，业务归属才稳
- 设置拆分放后面，但数据库模型要先按角色级设计

## 8. 当前已知注意事项

### 8.1 群聊已存在前端 contract，但不是正式后端联调状态

不要误以为前端有群聊页，就代表后端格式已经最终确定。现在它更像一份已经可运行的接口草图。

### 8.2 单聊与群聊消息模型不同

单聊现在偏本地归档消息模型，群聊偏 roster + records 模型。后端可以统一底层存储，但接口层不要强行并模。

### 8.3 日程是全局，提醒是角色级

这个边界已经在前端产品层面定死了。后端不要再改成“都全局”。

### 8.4 提醒状态不是纯列表状态

它还会触发聊天反馈。所以提醒服务不能只是一个孤立表。

### 8.5 terminal 是独立通道

不要把 terminal 挂到聊天 SSE 上，也不要让聊天接口顺便承担 PTY 透传。

## 9. 一句话结论

当前前端已经足够支持你下一步做后端，但前提是后端要按“角色独立 + 群聊独立 + 日程全局 + 提醒按角色回写聊天”这四条原则建设。

如果后端只是照着 CCC 抄一个 group chat，再把别的东西临时拼进去，后面一定还要重构一轮。
