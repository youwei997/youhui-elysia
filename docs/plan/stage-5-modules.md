# 阶段 5 · 进阶辅助模块（企业级广度）

> 难度 ⭐⭐⭐ · 工时 4-5 天 · 学到：onAfterHandle、缓存防击穿、存储抽象、队列、限流
> 节奏：每个模块 0.5-1 天，完成一个就有一个完整能力。**难度回落，是巩固期**

## 目标

补齐企业级框架的"周边肌肉"，每个模块独立可演示、可禁用、可配置。

## 前置检查

- [ ] 阶段 4 验收全 ✅
- [ ] 权限闭环可工作

## 子任务清单

### 5.1 操作日志（plugin/audit-log）(1d)

`db/schema/system/oper-log.ts`：
- 字段抄 youlai-boot 的 sys_log：userId / username / module / action / method / url / ip / ipRegion / userAgent / requestParams / responseResult / status / errorMsg / costMs / created_at
- 索引：userId / created_at / module

`src/plugins/audit-log.ts`：
- 在 `onAfterHandle` 里采集（成功路径）
- 在 `onError` 里采集（失败路径）
- 异步落库（**不要阻塞响应**），用 `setImmediate` 或 pg-boss 队列
- 路由通过 `audit: { module: 'user', action: 'create' }` macro 声明
- **未声明 audit 的路由不记录**（避免日志爆炸）
- 字段脱敏：password / token / secret 类字段在 requestParams 里替换为 `***`
- 大请求体截断（如 > 4KB）

modules/oper-log：
- `GET /oper-logs` 列表（带搜索：用户名 / 模块 / 时间范围）
- `DELETE /oper-logs/:id` 删除（仅 admin）
- `DELETE /oper-logs` 批量清理（按时间）

### 5.2 登录日志 + 在线用户 (0.5d)

`db/schema/system/login-log.ts`：
- 字段：userId / username / ip / ipRegion / userAgent / browser / os / status（'success' | 'fail'）/ errorMsg / created_at

`modules/login-log/`：列表查询。

`modules/online/`：
- 登录成功时往 Redis `online:user:{id}` 存：token / loginAt / ip / userAgent，TTL = access token 过期时间
- `GET /online` 列出在线用户（admin 权限）
- `DELETE /online/:userId` 强制下线（=tokenVersion +1 + 删 online:user:{id} + 删 refresh tokens）

### 5.3 字典管理 + WithCache 缓存防击穿 (1d)

`db/schema/system/dict.ts` + `dict-item.ts`：
- sys_dict：id / type（如 'gender'）/ name / status
- sys_dict_item：id / dictId / label / value / sort / status

`src/lib/cache.ts`：
- `withCache(key, ttl, fetcher)` 高阶函数
- **防击穿**：双重检查 + 分布式锁（`SET NX EX`）+ 超时重试
- 实现参考 elysia-admin 的 `WithCache`

`modules/dict/`：
- 字典 + 字典项 CRUD
- `GET /dicts/:type/items` 取字典项（被前端高频调用，**走 withCache**）
- 写操作后**主动失效缓存**

### 5.4 文件存储抽象 (1d)

`src/lib/storage/`：

```
storage/
├── types.ts          # interface Storage { put, get, delete, presignedPutUrl, presignedGetUrl }
├── index.ts          # createStorage(config) 工厂
├── local-fs.ts       # 本地文件系统 driver（dev 默认）
├── s3.ts             # S3 兼容 driver（连 MinIO / R2 / 七牛 / OSS）
└── qiniu.ts          # 七牛云 driver（如需独立，否则归 s3）
```

接口：
```ts
type Storage = {
  put: (key: string, data: Buffer | ReadableStream, opts?: { contentType?: string }) => Promise<{ url: string }>
  get: (key: string) => Promise<ReadableStream>
  delete: (key: string) => Promise<void>
  presignedPutUrl: (key: string, opts?: { expires?: number, contentType?: string }) => Promise<string>
  presignedGetUrl: (key: string, opts?: { expires?: number }) => Promise<string>
}
```

`db/schema/system/file.ts`：
- id / key / filename / size / mimeType / uploaderId + auditColumns
- 不存文件本身，只存元数据

`modules/storage/`：
- `POST /files/presigned-upload` 拿前端直传预签名 URL
- `POST /files` 前端直传后回调登记元数据
- `GET /files/:id` 拿下载预签名 URL（短期）
- `DELETE /files/:id` 删除（同时删存储侧）

### 5.5 定时任务（pg-boss）(1d)

为什么 pg-boss：你已经有 PG，零额外组件，足够这个项目规模。

`src/lib/queue.ts`：
- 包装 pg-boss 客户端
- 启动时初始化 schema（pg-boss 自带 migration）
- 暴露 `enqueue(name, data, opts)` / `schedule(name, cron, data)` / `subscribe(name, handler)`

`db/schema/system/job.ts`：
- 自定义 sys_job 表（**不依赖 pg-boss 内部表**，元数据 + UI 操作）
- 字段：id / name / handlerName / cron / args / status / lastRunAt / lastRunResult / createdBy + auditColumns

`modules/job/`：
- CRUD
- 启动时把 status='running' 的所有 job 调用 `pgBoss.schedule(...)` 注册
- 增/改/删时同步更新 pg-boss 调度
- `POST /jobs/:id/run` 立即触发一次
- `POST /jobs/:id/pause` / `:id/resume`

handler 注册：
- `src/jobs/index.ts` 集中注册（一个 handlerName → 一个函数）
- 第一版可写 2-3 个示例任务（清理过期日志、清理过期黑名单等）

### 5.6 限流 + IP 黑名单 (0.5d)

`src/plugins/rate-limit.ts`：
- macro `rateLimit: '60:100'`（60 秒内 100 次）
- Redis INCR + EXPIRE 实现
- 触发时返回 429 + Retry-After header

`db/schema/system/ip-blacklist.ts`：
- ip / reason / expireAt / createdBy + auditColumns

`src/plugins/ip-blacklist.ts`：
- 全局 plugin，onRequest 阶段检查 ip
- 命中 → 直接 403
- 缓存 ip → expireAt 进 Redis（避免每次查 DB）

登录失败联动：阶段 3 的失败计数超过阈值时自动入 ip 黑名单一段时间。

## 学习重点

- **`onAfterHandle` vs `onAfterResponse`**：前者改响应、后者纯观察（日志用后者）
- **缓存防击穿三件套**：双重检查 / 分布式锁 / 超时重试
- **存储抽象的工厂模式**：函数式版本 = 闭包创建实例 + 返回符合接口的对象
- **预签名上传 vs 后端代传**：前者更省服务器带宽，企业级首选
- **pg-boss 与自定义任务表的协作**：pg-boss 管调度，sys_job 管元数据和 UI
- **Redis 限流的几种算法**：固定窗口 / 滑动窗口 / 令牌桶（这阶段用最简单的固定窗口即可）

## 避雷

- ❌ 操作日志**不要同步落库**，用队列异步
- ❌ 操作日志**不要全局开启**，用 macro 显式声明
- ❌ password / token 字段必须脱敏
- ❌ withCache 不要无 TTL（永久缓存等于内存泄漏）
- ❌ withCache 写完缓存忘记主动失效
- ❌ 文件存储**不要把文件流过后端**，用预签名上传
- ❌ pg-boss 启动时不要重复注册同名 schedule（先 unschedule 再 schedule）
- ❌ 限流 key 不要只用 IP（CDN 后所有请求同 IP），加上 userId / route
- ⚠️ 字典缓存的 TTL 不要太长（5-10 分钟），写入主动失效
- ⚠️ 在线用户 Redis key 的 TTL 必须等于 access token 过期时间，避免脏数据
- ⚠️ MinIO 的 presigned URL 默认 7 天最大，超过会报错

## 验收清单

### 操作日志
- [ ] sys_oper_log 表已建，字段完整
- [ ] 路由 `audit: { module, action }` 声明后才记录
- [ ] 异步落库不阻塞响应
- [ ] password / token 字段脱敏
- [ ] 大 body 截断
- [ ] 失败请求也被记录（onError 路径）

### 登录日志 + 在线用户
- [ ] sys_login_log 表已建，登录成功/失败都记录
- [ ] online:user:{id} Redis key 在登录时设置、TTL 正确
- [ ] `/online` 接口列出在线用户
- [ ] 强制下线后旧 token 立即失效

### 字典 + 缓存
- [ ] sys_dict / sys_dict_item 双表
- [ ] withCache 实现含双重检查 + 分布式锁
- [ ] 字典项查询走缓存（连续两次查只打 DB 一次）
- [ ] 写操作主动失效缓存
- [ ] 缓存击穿测试：并发 100 个请求同一 key，DB 只被打 1 次

### 文件存储
- [ ] Storage 接口已定义
- [ ] local-fs / s3 两 driver 都可用
- [ ] env 切 driver 不改业务代码
- [ ] 预签名上传可工作（前端用 PUT 直传）
- [ ] 文件元数据登记到 DB
- [ ] 删除时同步删存储侧

### 定时任务
- [ ] pg-boss 接入，启动时初始化 schema
- [ ] sys_job 表与 pg-boss 调度同步
- [ ] 增/改/删 job 后调度立即生效
- [ ] 立即触发接口可用
- [ ] 暂停/恢复可用
- [ ] 至少 2 个示例任务可工作（如清日志、清过期黑名单）

### 限流 + IP 黑名单
- [ ] rateLimit macro 可声明在路由
- [ ] 触发返回 429 + Retry-After
- [ ] sys_ip_blacklist 表已建
- [ ] 登录失败联动入黑名单
- [ ] 黑名单 IP 直接 403

### 整体
- [ ] `bun run check` 通过
- [ ] `bun run tsc` 通过
- [ ] `docs/modules.md` 列出本阶段所有新模块及其能力

## 本阶段收获（完成后填写）
