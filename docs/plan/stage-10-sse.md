# 阶段 10 · SSE 实时推送

> 难度 ⭐⭐ · 工时 0.5-1d · 学到：Elysia 内置 `sse()` 工具 + `async function*` 流 + 内存连接注册表 + 跨模块事件广播
> 定位：实现 `stage-9-missing-apis.md` 发现的 SSE 缺口（前端 `useSse` 单例已连、后端零实现）
> **铁律：前端契约不可改，后端必须精确对齐下方 4 类事件的事件名与 payload 形状**

## 目标

让前端 `useSse` 单例能连上 `GET /api/v1/sse/connect` 并实时收到 4 类事件，使仪表盘在线人数、字典实时同步、通知实时弹窗从"降级（REST 可用但无推送）"变为"实时生效"。

## 前端契约（已逐一核对源码，不可偏离）

**连接机制**（前端 `composables/sse/useSse.ts`）：
- 用 `fetch` + `Authorization: Bearer <token>` 头（**不是原生 EventSource**，所以可直接复用后端现有 `auth` 守卫，无需把 token 塞进 query 参数）
- `Accept: text/event-stream`，手动解析 `event:` / `data:` / 空行协议，`data` 为 JSON
- 断线用 `AbortController`；指数退避重连，最多 10 次（`maxReconnectAttempts=10`）
- 单例：全局只有一个 SSE 连接，任一组件 `connect()` 即全局生效

**4 类事件（事件名 → payload 形状，逐字段对齐）**：

| 事件名 | payload 形状 | 前端消费位置 | 前端用法 |
|---|---|---|---|
| `online-count` | **裸 JSON 数字**（如 `42`） | `useOnlineCount.ts:14` `handleOnlineCountMessage(count: number)` | `onlineUserCount.value = count` |
| `dict` | `{ dictCode: string, timestamp: number }` | `useDictSync.ts:4-7` `DictChangeMessage` | `dictStore.removeDictItem(dictCode)`（失效缓存后由 store 重新拉取） |
| `notice` | `{ id, title, type, publishTime }` | `useNotice.ts:78-83` | 顶部 `ElNotification` 弹窗 + `unreadTotal += 1` + 列表头插 |
> ℹ️ `publishTime` 格式：后端写 `new Date().toISOString()` 入库，`JSON.stringify` 对 Date/string 均输出 ISO 格式（如 `"2026-07-12T10:00:00.000Z"`），无需额外格式化。
| `notice-revoke` | `{ id }` | `useNotice.ts:100-104` | 按 `id` 从列表移除 + `unreadTotal -= 1` |

> ⚠️ **致命细节**：`online-count` 的 `data` 必须是**裸 JSON 数字**（如 `data: 42`），不能是 `data: {"count":42}`——前端直接把 `JSON.parse` 结果当 number 传给 handler（`if (count !== undefined && !isNaN(count))`）。其余三个事件 `data` 是 JSON 对象。
>
> 🔧 **后端发送方式（Elysia 内置 `sse()` 的序列化坑）**：读 `node_modules/elysia/dist/utils.js:595` 的 `sse()` 实现，其 `toSSE()` 只处理 `data` 为 `null` / `string` / `object` 三种情况——**`data` 是 `number` 时三个分支全不匹配，会静默丢弃 `data:` 行**，前端收到 `event: online-count` 无 data → `NaN`。因此 `online-count` 必须 `sse({ event: "online-count", data: String(count) })`（包成字符串 → 命中 string 分支 → 输出 `data: 42`）。`dict`/`notice`/`notice-revoke` 的 `data` 是对象，走 `JSON.stringify`，正常。

**SSE 帧格式**（后端发送，标准协议）：
```
event: online-count
data: 42

event: dict
data: {"dictCode":"sys_common_status","timestamp":1752288000000}

event: notice
data: {"id":1,"title":"版本发布","type":1,"publishTime":"2026-07-12T10:00:00.000Z"}

event: notice-revoke
data: {"id":1}

```
（心跳保活：用 `sse({ event: "ping", data: "" })` 周期性推送——前端 `useSse` 只分发已注册 topic，`ping` 无监听器被忽略，但任意帧都能重置代理空闲计时器。注意：不能用 `sse(": ping")` 当注释行，因为 `sse()` 会把字符串当成 `data` 值，输出 `data: : ping` 导致前端 `JSON.parse` 报错）

## 前置检查

- [x] 阶段 4/5 核心框架已就绪（`auth` 守卫、`auth: true` 路由钩子、模块三件套范式）
- [x] `notice` 模块已存在（`publishNotice` / `revokeNotice`），可在发布/撤回路由成功后挂广播（stage-8.4）
- [x] `dict` 模块已存在（`dict` 类型 + `dict` 项 增删改路由），可在成功后挂广播（stage-5.3a）
- [x] `online` 模块已存在（`GET /online`，Redis `online:user:{id}` TTL 跟踪登录态）——可作为 online-count 统计口径的备选数据源
- [x] 无 SQL 模板红线：SSE 纯 TS，不碰 Drizzle

## 技术方案

### 模块结构（无 DB 表，内存注册表）
```
src/modules/sse/
  types.ts       # SseMessage / SseConnection（异步可迭代队列）/ SseEventTopic 联合类型
  registry.ts    # 进程内单例注册表：add / remove / broadcast / getOnlineCount / startSse（心跳）
  routes.ts      # GET /api/v1/sse/connect 端点（async function* + sse()）
src/modules/test/sse.test.ts   # 注册表广播 + sse() 帧格式单测
```
注册：在 `src/app.ts` 挂 `sseRoutes`（与 `noticeRoutes` 同方式）；在 `src/index.ts` 启动处调一次 `startSse()`。

### 1. registry.ts（内存连接表 + 广播）
- `SseConnection` 是一个**可异步迭代的连接队列**（不是手写 ReadableStream）。核心设计：
  - 内部队列 `queue: SseMessage[]` + 一个 `pendingResolve: (() => void) | null`（挂起等待的唤醒器）
  - `next()`：队列有值时 `queue.shift()` 立即返回 `{ value, done: false }`；**队列为空时创建一个 Promise，把它的 resolve 存为 `pendingResolve` 并 `await` 它**——即挂起等待，不返回 `{ done: true }`
  - `push(msg)`：入队 `queue.push(msg)`，若 `pendingResolve` 存在则调用它唤醒（让 `next()` 继续消费）
  - `close()`：设置 `closed = true`，resolve 所有挂起 Promise。任何 `next()` 调用（包括刚被 resolve 唤醒的这次）遇到 `closed` 即返回 `{ done: true }`，`for await` 随之退出
  - 实现 `[Symbol.asyncIterator]` 返回 `{ next }`，让连接端点能用 `for await` 逐条取消息
- `type SseMessage = { event: string; data: unknown }`
- `const connections = new Map<string, SseConnection>()`（以 `connId` 为 key，支持按 ID 快速查找/删除）
- 导出：
  - `addSseConnection(conn)` —— `connections.set(conn.id, conn)`
  - `removeSseConnection(connId)` —— 从 Map 中取出连接，**先 `conn.close()` 再从 Map `delete`**（顺序重要，反了可能漏 close）
  - `broadcast(topic: SseEventTopic, data: unknown): void` —— 遍历 `connections.values()`，`conn.push({ event: topic, data })`；**单连接异常 try/catch 隔离**，不阻断主流程
  - `getOnlineCount(): number` —— `connections.size`（活跃 SSE 连接数；语义对齐 Java `sessionRegistry.getOnlineUserCount()`）
  - `startSse(): void` —— 进程级单例 `setInterval`（25s）周期 `broadcast("ping", "")`（心跳保活）+ `broadcast("online-count", String(getOnlineCount()))`（周期刷新在线数）。在 `src/index.ts` 启动处调用一次

> 数据序列化交给 Elysia 内置 `sse()`（见 T2），registry **不再手写 `event:/data:/空行` 拼帧**。注意 `broadcast` 收到的 `data` 必须已是「可被 `sse()` 正确序列化」的形态：`online-count` 调方须传 `String(count)`（见契约段 ⚠️），其余三个事件传对象即可。

### 2. routes.ts（连接端点，用 Elysia 内置 `sse()`）
```ts
import { Elysia, sse } from "elysia";

export const sseRoutes = new Elysia({ prefix: "/api/v1/sse" })
  .get("/connect", async function* ({ set, user }) {
    // 1) 首帧前设置响应头（sse 自动加 text/event-stream，其余手动）
    set.headers["cache-control"] = "no-cache";
    set.headers["connection"] = "keep-alive";
    set.headers["x-accel-buffering"] = "no"; // 防 nginx 缓冲 SSE
    // 2) 建连接、入注册表
    const connId = crypto.randomUUID();
    const conn = new SseConnection(connId, user!.sub);
    addSseConnection(conn);
    // 3) 连接即广播一次在线数（String 包裹，详见契约 ⚠️）——用 broadcast 而非 push，让<span>所有</span>连接实时看到计数上升
    broadcast("online-count", String(getOnlineCount()));
    try {
      // 4) 逐条消费本连接的消息队列，用 sse() 包成 SSE 帧 yield 出去
      for await (const msg of conn) {
        yield sse(msg);
      }
    } finally {
      // 5) 客户端断开（Elysia 自动取消 generator）或异常 → 清理注册表
      removeSseConnection(connId);
      // 断开后让其他客户端在线数回落（broadcast 给所有剩余连接）
      broadcast("online-count", String(getOnlineCount()));
    }
  }, { auth: true });
```

> ✅ **为何比手写 ReadableStream 省事**：`sse()` 是 Elysia 核心 API（`import { sse } from "elysia"`），自动设 `Content-Type: text/event-stream`、按 `event/data/id/retry` 规范拼帧；客户端断开时 Elysia **自动取消 generator**，`finally` 块即可精准清理，不用手动监听 `request.signal`（T2.1 spike 会实测验证）。
>
> 🔴 **实现前先做连通性 spike（T2 第一步）**：虽是官方 API，仍先小验证 `async function*` handler + `yield sse(...)` 在 Bun 下是否**逐帧立即下发**（不被整体缓冲）、客户端 abort 是否真触发 `finally`。拿最小端点 `bun run dev` + `curl -vN http://localhost:PORT/api/v1/sse/connect -H "Authorization: Bearer <token>"` 验：① 两帧逐帧到达 ② `Content-Type`/`Cache-Control`/`x-accel-buffering` 头正确 ③ Ctrl-C 断开后服务端 `finally` 执行，再写完整逻辑。

### 3. 事件广播触发点
| 事件 | 触发位置 | 调用 |
|---|---|---|
| `online-count` | 连接/断开时（见上）+ `startSse` 周期 | `broadcast("online-count", String(getOnlineCount()))`（**必须 String 包裹**） |
| `notice` | `notice/routes.ts` 发布成功路由 | `broadcast("notice", { id, title, type, publishTime })`（从 `publishNotice` 返回的 `NoticeRecord` 取这 4 字段） |
| `notice-revoke` | `notice/routes.ts` 撤回成功路由 | `broadcast("notice-revoke", { id })`（撤回只关心 id） |
| `dict` | `dict/routes.ts` 的 dict 类型 + dict 项的**增/删/改**共 6 处路由成功后 | `broadcast("dict", { dictCode, timestamp: Date.now() })`（dictCode 来自创建/更新返回值的 `dictCode` 字段，或 items 路由中 `params.id`——双模式中可作 dictCode） |
| `ping` | `startSse` 周期（25s） | `broadcast("ping", "")`（心跳，前端无监听器→忽略，仅保活） |

> 广播是跨模块调用：registry 是模块级单例，直接 `import { broadcast } from "@/modules/sse/registry"` 即可（不引 DI 容器，符合 AGENTS 红线）。

### 4. 依赖策略（用核心 `sse()`，不引旧插件）
使用 **Elysia 核心内置的 `sse` 工具函数**（`elysia` 包直接导出，非插件）。**禁止引入旧版 `@elysiajs/sse` 等历史插件**——它已是过时代替品，且可能带来额外依赖/版本冲突。纯 TS，零 SQL（项目红线）。

### 5. online-count 统计口径（v1 决策）
首版取 **活跃 SSE 连接数**（`connections.size`），语义对齐 Java `SseSessionRegistry`。备选：若日后要更准（含未开 SSE 但已登录用户），可改读 `online` 模块的 Redis `online:user:*` 键计数——记为技术债，v1 不做。

## 子任务清单

### T1 · sse 模块骨架（types + registry）⏳
- [ ] `src/modules/sse/types.ts`：`SseMessage = { event: string; data: unknown }`、`SseConnection`（属性：`id: string` / `userId: string`；方法：`push` / `close` / `[Symbol.asyncIterator]` / `next`——**空队列时 `next()` 必须挂起等待，不能 `{ done: true }`**）、`SseEventTopic = "online-count" | "dict" | "notice" | "notice-revoke" | "ping"`
- [ ] `src/modules/sse/registry.ts`：`connections: Map<string, SseConnection>` + `addSseConnection`（`map.set(conn.id, conn)`）/ `removeSseConnection`（**先 `close()` 再 `delete`**）/ `broadcast`（遍历 `values()`，try/catch 隔离）/ `getOnlineCount`（`map.size`）+ `startSse`（25s 周期 ping + online-count 单例定时器）
- [ ] 验证：`bun run tsc` 通过

### T2 · 连接端点 + 流（先做连通 spike）⏳
- [ ] **步骤 1（spike）**：最小 `GET /connect` 用 `async function*` + `yield sse(...)`，`bun run dev` + `curl -N http://localhost:PORT/api/v1/sse/connect -H "Authorization: Bearer <token>"` 验证两帧逐帧到达、Ctrl-C 断开后服务端 `finally` 执行（注册表移除）
- [ ] **步骤 2**：补全 `routes.ts`：`auth: true` + 首帧前设 `cache-control/connection/x-accel-buffering` 头 + `new SseConnection` 入表 + 连接即 `push` 一次 `online-count`（**`String()` 包裹**）+ `for await (const msg of conn) yield sse(msg)` + `finally` 清理
- [ ] 在 `src/app.ts` 挂 `sseRoutes`；在 `src/index.ts` 启动处调一次 `startSse()`
- [ ] 验证：前端 dashboard 在线人数不再恒 0、控制台无连接失败日志

### T3 · online-count 周期广播 ⏳
- [ ] 已由 `startSse` 的 25s 周期覆盖（见 T1 `startSse` 说明），**无需独立定时器**。只需确认断连时 `removeSseConnection` 后的 `broadcast`（T2 已含）让计数实时回落

### T4 · notice / notice-revoke 广播 ⏳
- [ ] `notice/routes.ts` 发布路由成功后 `broadcast("notice", { id, title, type, publishTime })`
- [ ] `notice/routes.ts` 撤回路由成功后 `broadcast("notice-revoke", { id })`
- [ ] 广播调用包 try/catch，失败仅记日志不阻断发布主流程

### T5 · dict 广播 ⏳
- [ ] `dict/routes.ts` 的 dict 类型 增/改/删 + dict 项 增/改/删 共 6 处路由成功后 `broadcast("dict", { dictCode, timestamp: Date.now() })`
- [ ] 验证：前端改字典后，另一标签页字典下拉实时失效刷新（不刷新页面）

### T6 · 单测 ⏳
- [ ] `src/modules/test/sse.test.ts`：
  - registry `add`→`broadcast`→ 通过 `SseConnection.next()` 收到正确 `{ event, data }`（含 `online-count` 用 `String` 包裹后 data 为字符串）
  - `removeSseConnection` 后 `broadcast` 不再送达
  - `getOnlineCount` 随增删正确变化
  - **序列化防呆**：`expect((sse({ event: "online-count", data: String(42) }) as any).toSSE()).toContain("data: 42")`（断言输出包含 `data: 42` 且不含多余引号）；注意 `sse()` 的 TS 返回类型不含 `.toSSE`（`utils.d.ts:197` 的条件类型只保留输入类型），运行时存在但 `tsc` 会报错，须用 `as any` 绕过。反向注释——若写成 `data: 42`（裸 number）`sse()` 会静默丢 `data:` 行，必须用 `String()`。
- [ ] `bun test src/modules/test/sse.test.ts` 全绿

### T7 · 收尾验证 ⏳
- [ ] `bun run tsc` + `bun run check` 通过
- [ ] 端到端联调：前端发通知 → 另一浏览器在线人数/弹窗实时；改字典 → 实时失效；全部 REST 仍可用
- [ ] （可选）`src/index.ts` 优雅关停里关闭所有 SSE 流（遍历 `connections` 调 `close()`）

## 验收清单（本阶段总览）

- [ ] `GET /api/v1/sse/connect` 返回 `text/event-stream` 且带 `auth` 守卫（无 token 返回 401）
- [ ] 前端 `useSse` 单例能稳定连上，dashboard 在线人数实时、控制台无连接失败日志
- [ ] 4 类事件 payload **逐字段**匹配前端契约（`online-count` 裸数字 / `dict` 含 dictCode+timestamp / `notice` 含 id+title+type+publishTime / `notice-revoke` 含 id）
- [ ] 客户端断开 → registry 移除、无内存泄漏、无向已关闭流写数据报错（abort 清理生效）
- [ ] 字典增删改 → 前端字典缓存实时失效刷新
- [ ] 通知发布/撤回 → 前端顶部弹窗 / 未读 +1 / 列表移除实时生效
- [ ] `bun run tsc` + `bun run check` + `bun test` 全绿

## 已知技术债 / 范围外

- **单实例限制**：registry 是进程内存，多实例 / 负载均衡下事件只推到本机连接。未来多实例再上 Redis pub/sub 做跨实例广播（v1 不做，符合"第一版只追求对不追求快"）。
- **online-count 口径**：v1 取活跃 SSE 连接数；未开 SSE 但已登录的用户不计入（备选读 Redis online 键，记技术债）。
- **心跳间隔 25s**：经验值，若部署在会切断空闲连接的代理后，按需调小。
- **优雅关停**：v1 进程退出时 SSE 流由 OS 关闭即可；可选在 `gracefulShutdown` 里主动 `close()` 所有连接。

## 避雷

- 使用 Elysia 核心内置 `sse()`（`import { sse } from "elysia"`）；**禁止引入旧版 `@elysiajs/sse` 插件**（过时且多依赖，核心已原生支持）。
- 禁止写任何 SQL / sql 模板（纯 TS）。
- 🔴 `online-count` 的 `data` 必须是 `String(count)` 包裹的裸数字字符串——Elysia `sse()` 的 `toSSE()`（`utils.js:595`）对 `number` 类型 `data` 静默丢弃 `data:` 行，前端收到无 data 帧 → `NaN`。写成 `{count:42}` 对象也不行（前端 `!isNaN` 过但 `onlineUserCount` 变 NaN）。唯一正确：`sse({ event: "online-count", data: String(count) })` → `data: 42`。
- 心跳用 `sse({ event: "ping", data: "" })`，禁止用 `sse(": ping")` 冒充注释行（会被当成 `data: : ping` 导致前端 `JSON.parse` 报错）。
- 广播调用必须 try/catch 隔离，单连接异常不能中断发布/改字典主流程。
- `auth: true` 已验证可注入 `user.sub`，SSE 端点无需自建鉴权。
