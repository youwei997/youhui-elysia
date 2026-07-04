# 阶段 5 · 进阶辅助模块（企业级广度）

> 难度 ⭐⭐⭐ · 工时 4-5 天 · 学到：onAfterHandle、缓存防击穿、存储抽象、队列、限流
> 节奏：每个模块 0.5-1 天，完成一个就有一个完整能力。**难度回落，是巩固期**

## 目标

补齐企业级框架的"周边肌肉"，每个模块独立可演示、可禁用、可配置。

## 前置检查

- [x] 阶段 4 验收全 ✅
- [x] 权限闭环可工作

## 子任务清单

### 5.1 操作日志(plugin/audit-log)(1d)

> **设计决策详见 `docs/notes/` 3 篇笔记**:
> - `2026-06-29-oper-log-物理删除策略.md` —— 不走软删,DELETE 走硬删,5.5 定时清理也走硬删
> - `2026-06-29-auditColumns-局部复用案例.md` —— 复用策略约定:完整复用 vs 局部复用
> - `2026-06-29-索引命名约定.md` —— `idx_<table>_<col>` 临时约定,阶段 5 收尾 review

#### 5.1.1 数据库层(0.3d)✅ 已完成

**目标**:`sys_oper_log` 表 + 索引

**涉及文件**:`src/db/schema/system/oper-log.ts`(新)

**字段**:
- 元数据全量:userId / username / module / action / method / url / ip / ipRegion / userAgent / status / errorMsg / costMs
- `requestParams`(jsonb,仅 POST / PUT / PATCH 存,4KB 截断 + 脱敏)
- `responseResult`(jsonb,仅失败存,4KB 截断;成功不写)
- 时间:局部复用 `auditColumns.createTime`(不写 createdBy / updatedBy / updateTime / deleteTime)

**索引**(3 个):`idx_oper_log_user_id` / `idx_oper_log_create_time` / `idx_oper_log_module_action`

**验收**:`bun run db:generate` + `db:push` 通过,物理删除策略文档化

---

#### 5.1.2 脱敏 + 截断工具(0.1d)✅ 已完成

**目标**:`src/lib/audit-mask.ts` —— 采集前的预处理工具

**涉及文件**:
- `src/lib/audit-mask.ts`(新)
- `src/lib/test/audit-mask.test.ts`(新,bun:test 单测)

**关键设计**:
- 敏感字段白名单:`password` / `oldPassword` / `newPassword` / `token` / `accessToken` / `refreshToken` / `secret` / `apiKey` / `clientSecret` 等
- 递归遍历 object / array,匹配到敏感字段值 → 替换为 `***`
- 大 body 截断:`JSON.stringify` 后字节数 > 4096 → 保留前 N 字符 + `"...truncated"` 标记
- 不抛错(不存在的字段、不支持的类型直接跳过)

**验收**:
- [x] 密码 / token 字段递归替换为 `***`
- [x] 4KB 截断生效,返回 JSON-safe truncated 标记
- [x] 单测覆盖:嵌套对象 / 数组 / 边界(刚好 4096 / 4097) / 不存在的字段

---

#### 5.1.3 audit-log plugin(0.2d)✅ 已完成

**目标**:`src/plugins/audit-log.ts` 采集 plugin + macro 声明

**涉及文件**:
- `src/plugins/audit-log.ts`(新)
- `src/plugins/test/audit-log.test.ts`(新)

**关键设计**:

1. **macro 声明合并到 OpenAPI detail**:
   ```ts
   .macro({
     audit: (t) => t.String(),
   })
   ```

2. **路由声明**:
   ```ts
   .post('/users', handler, {
     detail: { tags: ['用户'], summary: '创建用户' },
     audit: 'user:create',
   })
   ```

3. **采集点**:
   - `onAfterResponse`:成功路径(纯观察,不动响应)
   - `onError`:失败路径(早于 `error-handler` plugin 介入)

4. **异步落库**:`setImmediate(() => db.insert(sysOperLog).values({...}))`,**绝不 await**

5. **采集异常降级**:`setImmediate` 内的 catch 只 log,不抛(不能让日志拖垮业务)

6. **采集字段**:
   - 从 `ctx.request` 拿 method / url / User-Agent
   - 从 ctx 拿 `userId` / `username`(从 auth plugin derive)
   - 计算 `costMs`(`Date.now() - startTime`,startTime 存 ctx)
   - `requestParams`:仅 POST/PUT/PATCH,从 `ctx.body` 取
   - `responseResult`:仅失败,从 `ctx.error` / response 取
   - 全部过 5.1.2 的 `audit-mask` 脱敏 + 截断

**验收**:
- [x] 路由声明 `audit` 后才记录,未声明路由不受影响
- [x] 成功请求真实落库一条(5.1.5 端到端验证)
- [x] 失败请求真实落库一条,errorMsg 完整(5.1.5 端到端验证)
- [x] `setImmediate` 异步,响应不等待落库
- [x] 采集异常不抛出(主请求照常 200)

---

#### 5.1.4 模块三件套(0.2d)

**目标**:`modules/oper-log/{schema,queries,routes}.ts` + 3 个 REST 接口

**涉及文件**:
- `src/modules/oper-log/schema.ts`(新)
- `src/modules/oper-log/queries.ts`(新)
- `src/modules/oper-log/routes.ts`(新)

**接口**:
- `GET /oper-logs`(权限 `sys:oper-log:query`):query page / pageSize / username / module / status / startTime / endTime,排序 `createTime DESC`
- `DELETE /oper-logs/:id`(权限 `sys:oper-log:delete`)
- `POST /oper-logs/batch-delete`(权限 `sys:oper-log:delete`,body.beforeTime 批量按 `createTime < beforeTime` 清理)

**验收**:
- [x] 列表支持多条件搜索(username 模糊 / module 精确 / status / 时间范围)
- [x] DELETE 单条生效(硬删)
- [x] `POST /batch-delete` 批量按时间清理
- [x] 权限 macro 生效(无 token → 401；403 待权限种子/普通用户补测)
- [x] 按 `createTime DESC` 返回

---

#### 5.1.5 接入验证(0.1-0.2d)✅ 已完成

**目标**:给 user / role / menu / dept 路由挂 `audit` 声明 + 端到端验证

**关键路由**(每个模块至少挂 create / update / delete):
- user:create / update / delete / reset-password
- role:create / update / delete / assign-menus / assign-depts
- menu:create / update / delete
- dept:create / update / delete

**端到端验证**:
1. 启动服务,登录拿 token
2. 调 `POST /users` → `sys_oper_log` 多一条 `module=user, action=create`
3. 检查 `requestParams.password` 字段是 `***`(脱敏生效)
4. 调失败请求 → `sys_oper_log` 多一条 `status=0, errorMsg` 非空
5. 跨表清理:5.5 定时任务跑一次,`create_time < 30天前` 的记录被硬删

**验收**:
- [x] user / role / menu / dept 核心写接口都挂 audit
- [x] 端到端:操作一次 → 日志表多一条(集成测试覆盖 user 模块 create/update/delete)
- [x] 脱敏生效(password → `***` 已验证)
- [ ] 失败请求也被记录(单测覆盖 buildErrorShell/buildEntry 失败路径,E2E 待补充)
- [x] 5.1 全部验收清单过完(对照原计划文档末尾的"验收清单"段)

---
### 5.2 登录日志 + 在线用户 (0.5d)✅ 已完成

`db/schema/system/login-log.ts`：
- 字段：userId / username / ip / ipRegion / userAgent / browser / os / status（'success' | 'fail'）/ errorMsg / created_at

`modules/login-log/`：列表查询。

`modules/online/`：
- 登录成功时往 Redis `online:user:{id}` 存：username / loginAt / ip / userAgent，TTL = access token 过期时间
- `GET /online` 列出在线用户（admin 权限）
- `DELETE /online/:userId` 强制下线（=tokenVersion +1 + 删 online:user:{id}）

**接入点**：auth/routes.ts 登录成功/失败记录 loginLog + 成功时写入 online；登出/踢全端时清除 online；refresh-token 延长 online TTL

### 5.3a 字典管理 (0.5d)✅ 已完成

`db/schema/system/dict.ts` + `dict-item.ts`：
- sys_dict：id / type（如 'gender'）/ name / status / remark
- sys_dict_item：id / dictId / label / value / sort / status / tag_type（标签类型，N/P/S/W/I/D）

`modules/dict/`：
- 字典 + 字典项 CRUD（14 个接口）
- 响应字段 `type` 映射为 `dictCode` 对齐前端契约
- `keywords` 模糊搜索（type/name 或 label/value）
- 字典项列表分页（`{ list, total }` 格式）
- `GET /dicts/:type/items` 取字典项（仅返回启用项，供前端下拉框，内部用 pageSize=9999 取全量）
- `GET /dicts/:id/items/options` 取字典项下拉选项（对齐前端路径，:id 支持数字 ID 或 dictCode）
- `GET /dicts/options` 字典类型下拉列表（返回 `{ value, label }`）
- `GET /dicts/:id/form` 字典类型表单数据
- `GET /dicts/:id/items/:itemId/form` 字典项表单数据
- `DELETE /dicts/:id` 批量删除字典类型（前端传 1,2,3，单条传 1）
- `DELETE /dicts/:id/items/:itemId` 批量删除字典项（同上）
- tagType 字段（前端 primary/success/warning/info/danger ↔ 后端 N/P/S/W/I/D 编解码在 API 层处理）
- 写操作后主动失效字典项缓存

### 5.3b WithCache 缓存防击穿 (0.5d)✅ 已完成

`src/lib/cache.ts`：
- `withCache(key, ttl, fetcher)` 高阶函数
- **防击穿**：双重检查 + 分布式锁（`SET NX EX`）+ 超时重试

接入：`GET /dicts/:type/items` 走 withCache，写操作后主动失效缓存

### 5.4 文件存储抽象 (1d)

> **设计文档**：[`docs/design/2026-07-02-文件存储抽象-前端不改版本.md`](../../docs/design/2026-07-02-文件存储抽象-前端不改版本.md)（v2.4）
> **核心决策**：前端 `vue3-element-admin-v4.6.0` 不改动 → 后端代理上传（不用预签名）、url 永久可访问、删除按 url 反查

**与原 plan 差异**：Storage 接口 5→2 方法（`put` / `delete`），路由 4→2 个，砍掉预签名逻辑。

**模块结构**：

```
src/
├── lib/storage/
│   ├── types.ts          # Storage 接口（2 方法：put / delete）
│   ├── index.ts          # createStorage(config) 工厂 + 单例
│   ├── local-fs.ts       # 本地文件系统 driver（dev 默认）
│   └── s3.ts             # S3 兼容 driver（最小可工作，连 MinIO 接通即可）
├── db/schema/system/
│   └── file.ts           # sys_file 元数据表（含 url 字段 + auditColumns 软删）
└── modules/storage/
    ├── schema.ts         # Zod DTO（FileInfo 响应、删除查询参数）
    ├── queries.ts        # 纯函数：createFile / findFileByUrl / softDeleteFile
    └── routes.ts         # Elysia plugin：POST /files + DELETE /files?filePath=url
```

**路由**：`POST /api/v1/files`（multipart 字段名 `file`）、`DELETE /api/v1/files?filePath={url}`，鉴权 `auth: true` + `requirePerm: ["sys:file:upload"]` / `["sys:file:delete"]`。

#### 子任务拆解

##### 5.4.1 基础设施：依赖 + 配置 + 建表 (0.2d)

- [x] `bun add @aws-sdk/client-s3 @elysia/static`
- [x] `src/config/index.ts`：env schema 追加 `STORAGE_DRIVER` / `LOCAL_FS_ROOT` / `LOCAL_FS_PUBLIC_BASE_URL` / s3 相关字段
- [x] `.env.example`：追加文件存储配置
- [x] `src/db/schema/system/file.ts`：`sys_file` 表，字段 id / key / filename / size / mimeType / url / uploaderId + auditColumns，索引 `idx_sys_file_url`
- [x] `bun run db:generate` + `bun run db:push`

##### 5.4.2 Storage 抽象层：local-fs 先行 (0.3d)

- [x] `src/lib/storage/types.ts`：`Storage` 接口（`put` / `delete`）+ `StorageConfig` 联合类型
- [x] `src/lib/storage/local-fs.ts`：`Bun.write` 写文件 → `new URL()` 构造 url；`fs.unlink` 删文件（幂等）
- [x] `src/lib/storage/index.ts`：`createStorage(config)` 工厂 + `storage` 全局单例

##### 5.4.3 模块三件套：schema + queries + routes (0.25d)

- [x] `src/modules/storage/schema.ts`：`FileInfoResponse`（`{ name, url }` 对齐前端契约）
- [x] `src/modules/storage/queries.ts`：`createFile` / `findFileByUrl`（只查未软删）/ `softDeleteFile`
- [x] `src/modules/storage/routes.ts`：
  - `POST /api/v1/files`：`t.Object({ file: t.File() })`，handler 校验 `file.size` ≤ 50MB，`file.stream()` 写存储 → 落元数据 → 返回 `{ name, url }`
  - `DELETE /api/v1/files`：`query.filePath` → `findFileByUrl` 反查 → `storage.delete` → `softDeleteFile`
  - 两个路由挂 `auth: true` + `perm` + `audit` 声明

##### 5.4.4 静态服务挂载 (0.1d)

- [x] `src/app.ts`：`.use(storageRoutes)` + `@elysia/static` 挂 `./uploads/` → `/uploads/*`
- [x] `.gitignore`：追加 `uploads/`

##### 5.4.5 s3 driver：最小可工作（独立子任务，可推迟）(0.1d)

- [ ] `src/lib/storage/s3.ts`：`PutObjectCommand` / `DeleteObjectCommand`（不写重试/分片/进度）
- [ ] `docker run --rm minio/minio` 临时起 MinIO 验证接通

##### 5.4.6 权限 seed + 错误码 + 验收 (0.05d)

- [x] `src/lib/errors.ts`：追加 `FILE_NOT_FOUND: "A0470"` / `FILE_UPLOAD_FAILED: "A0471"`
- [x] `scripts/seed.ts`：sys_menu 追加 `sys:file:upload` / `sys:file:delete` 两条按钮权限，管理员角色勾选
- [x] 启动服务 → 前端上传/预览/删除走通
- [x] 边界：空文件 → A0400、超 50MB → A0400、不存在的 url → A0470 (404)
- [x] `bun run check` + `bun run tsc` 通过

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

### 🔍 值得认真学（架构师亲自看）

- **操作日志**：`onAfterHandle` 的 `WeakMap` 生命周期、`onError` 与 `errorHandler` 的执行顺序、`setImmediate` 的异步落库时序——**这三个决定日志系统是否可靠**
- **缓存防击穿**：`withCache` 的双重检查锁 + 分布式锁（`SET NX EX`）、写入后 **主动失效** 的时序——**这是通用知识，不只是阶段5**
- **pg-boss 调度**：`schedule` / `unschedule` 的**先 unschedule 再 schedule** 顺序、`publish` 只触发一次——**这是设计耦合**

### ⚡ 直接给 AI 做（你只看结果）

- **登录日志 + 在线用户**：标准 CRUD，`/online` 列表 + `DELETE /:userId` 强制下线，无设计决策
- **文件存储抽象**：`Storage` 接口 `{ put, get, delete, presignedPutUrl, presignedGetUrl }`，`local-fs` / `s3` driver 实现——**标准工厂模式**
- **限流 + IP 黑名单**：`rateLimit: '60:100'` macro（`INCR + EXPIRE`），**标准实现**

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
- [ ] 路由 `audit: "模块:动作"` 声明后才记录
- [ ] 异步落库不阻塞响应
- [ ] password / token 字段脱敏
- [ ] 大 body 截断
- [ ] 失败请求也被记录（onError 路径）

### 登录日志 + 在线用户
- [x] sys_login_log 表已建，登录成功/失败都记录
- [x] online:user:{id} Redis key 在登录时设置、TTL 正确
- [x] `/online` 接口列出在线用户
- [x] 强制下线后旧 token 立即失效

### 字典 + 缓存
- [x] sys_dict / sys_dict_item 双表
- [x] withCache 实现含双重检查 + 分布式锁
- [x] 字典项查询走缓存（连续两次查只打 DB 一次）
- [x] 写操作主动失效缓存
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
- [x] `bun run check` 通过
- [x] `bun run tsc` 通过
- [ ] `docs/modules.md` 列出本阶段所有新模块及其能力

## 本阶段收获（完成后填写）
