# 阶段 3 · 横切 Plugin 体系（吃透 Elysia 范式）

> 难度 ⭐⭐⭐ · 工时 4-5 天 · 学到：Elysia plugin / derive / resolve / onError / mapResponse / macro
> **核心阶段**：这阶段是你"Elysia 范式吃透"的真正起点，elysia-admin 范式不正的坑就在这里避开

## 目标

把所有横切关注点（错误处理、响应壳、请求上下文、JWT、i18n）实现为 **Elysia plugin** —— 全部用 `derive` / `resolve` / `mapResponse` / `onError` / `onAfterHandle`，**不准**用装饰器、AOP、拦截器、Reflector。

完成后，阶段 2 的 user 模块要被改造为：**带 token 才能访问**，错误信息按 `Accept-Language` 切换语言，响应壳统一。

## 前置检查

- [x] 阶段 2 验收全 ✅
- [x] user 模块三件套已跑通
- [x] OpenAPI 文档可看

## 子任务清单

### 3.1 错误体系（lib/errors + plugin/error-handler）(1d)

`src/lib/errors.ts`：
- 错误码用 `as const` 字面量联合：`type ErrCode = 'A0001' | 'A0002' | 'B1001' | ...`
- 错误码常量：按业务域分组（A=认证 / B=用户 / C=权限 / ...）
- `BizError`：用**工厂函数**而不是 class extends：
  ```ts
  type BizError = { kind: 'biz', code: ErrCode, message: string, status: number }
  const bizError = (code, message, status = 400): BizError => ({ kind: 'biz', code, message, status })
  ```
- 也可保留 class 风格 `class BizError extends Error`（throw 友好）。实际采用了 class 风格，见 `src/lib/errors.ts`，未另写 ADR。

`src/plugins/error-handler.ts`：
- `onError` 全局处理：分支 VALIDATION / NOT_FOUND / Postgres 唯一冲突（23505）/ BizError / 未知错
- 统一返回 `{ code, msg, data: null, traceId }`
- 未知错误打日志（含 stack）但响应不要泄露 stack

### 3.2 响应壳（plugin/response-wrap）(0.5d)

`src/plugins/response-wrap.ts`：
- 用 `mapResponse` 把 handler 返回值包成 `{ code: "00000", msg: "成功", data }`
- 跳过白名单：OpenAPI 文档路径（`/openapi`、`/openapi/json`）、健康检查（`/health`）
- 按类型放行：`string`（纯文本）和 `undefined`（Elysia 内部用）直接透传，其余（boolean/number/object/null）统一包壳

### 3.3 请求上下文（plugin/request-context）(0.5d)

`src/plugins/request-context.ts`：
- `onRequest` 注入 `reqId`（uuid v4，用 Bun 内置 `crypto.randomUUID()`）+ `startTime`
- `derive` 把 `reqId` 挂到 ctx 上
- 创建子 logger `logger.child({ reqId })` 也挂到 ctx
- `onAfterResponse` 打"请求完成"日志（含耗时、status）
- 原理详见 `docs/architecture.md` 4.2.1 节（reqId 是内存临时编号，不存表；与阶段 5 的操作日志表是两回事）

### 3.4 JWT 库（lib/jwt）(0.5d)

`src/lib/jwt.ts`：
- 算法：HS256 对称签名（选型见 `docs/notes/2026-06-16-为什么选jose不选官方jwt插件.md`）
- 函数：`signAccessToken(payload)` / `signRefreshToken(payload)` / `verifyToken(token)`
- access token 短期（15min），refresh token 长期（7d）
- `verifyToken` 设 `clockTolerance: 60`（秒），避免边缘过期时时钟偏差误杀
- payload 结构：`{ sub, username, roles, perms, dataScopes, tokenVersion, jti }`
  - `jti`（JWT ID）：**单 token 唯一标识**，由调用方通过 `crypto.randomUUID()` 生成 v4 UUID
    - 不是用户级、不是设备级，就是"这一个 token"的身份证号
    - logout 时把 jti 写入 Redis 黑名单，TTL 等于 token 剩余有效期

**三层失效设计**（关键，参考 youlai-boot）：
1. **`exp`**：JWT 自带过期，由 jose 自动校验
2. **`tokenVersion`**：用户级版本号，存在 Redis `auth:user:{id}:version`，改密码/踢全部时 +1
   - 查 Redis 为 `null` 时跳过校验（新用户首次登录兼容），有值才比对
3. **`jti`**：单 token 注销，存在 Redis `auth:revoked:{jti}` 黑名单（值=过期时间）
   - key 存在即拒绝，值只起占位作用

校验逻辑：先验签 + exp（jose 自动）→ 查 tokenVersion → 查 jti 黑名单。

**错误处理策略**：
- 验签/过期 → 抛出 jose 原生错误，`verifyToken` 不 catch，由调用方（auth plugin 的 derive）try/catch 降级为 `user = null`
- tokenVersion 不匹配 / jti 黑名单命中 → 抛出 `BizError`（401，`ACCESS_TOKEN_INVALID`），同样由 derive catch 降级

### 3.5 auth plugin（derive ctx.user）(0.5d)

`src/plugins/auth.ts`：
- 一个 Elysia plugin
- `derive` 从 `Authorization: Bearer xxx` 解析 token → 校验 → 注入 `ctx.user`
- token 缺失：`ctx.user = null`（**不在 plugin 里直接 401**，让具体路由用 `auth` macro 决定）
- 实现 `auth` macro：路由声明 `auth: true` 自动校验 user 非空

> **核心范式**：不要装饰器 + Reflector + Guard 那套，就是 plugin + derive + macro。
> 反例参考 `docs/architecture.md` 第 5 节。

### 3.6 Auth 模块（modules/auth）(1d)

新增：
- `db/schema/system/auth.ts`：可选——是否拆 `auth_accounts` 表（密码 / OAuth / passkey 多种登录方式分离）。**第一版直接用 `sys_user.password` 简化**，记录在 ADR 里"未来要拆"。

`src/modules/auth/schema.ts` + `routes.ts` + `queries.ts`：
- `POST /auth/login`：username + password → access + refresh
  - 密码用 `Bun.password.hash()`（默认 argon2id，零依赖），见 `src/lib/password.ts`
  - 登录失败计数：Redis `auth:fail:{username}`，N 次后锁定 M 分钟
  - 成功后清失败计数
- `POST /auth/refresh`：refresh token → 新 access token（同时签发新 refresh token，旧的入黑名单）
- `POST /auth/logout`：把当前 jti 入黑名单 + 删除当前 refresh token
- `POST /auth/logout-all`：tokenVersion +1（踢用户所有端）

### 3.7 ~~i18n plugin (1d)~~ 跳过

> **不做了**。参考项目 youlai-boot 后端无 i18n，错误消息直接中文返。前端 vue-i18n 只翻 UI 文案。
> 决策记录见 `docs/notes/2026-06-17-后端不做i18n.md`。

原计划（保留作为未来参考，不再实施）：

`src/lib/i18n.ts`：
- 文案结构：`{ [errCode]: { zh: '...', en: '...' } }`
- 文件按 locale 分：`locales/zh.ts` / `locales/en.ts`
- 函数 `t(code, locale, vars?)`：根据 code + locale 取文案，支持简单插值

`src/plugins/i18n.ts`：
- `derive` 解析 `Accept-Language` → ctx.locale（默认 zh）
- 错误处理 plugin 整合：抛 `BizError({ code, message? })` 时如果 message 为空，自动从 i18n 字典取
- 路由 handler 内可 `ctx.t(code, vars)` 主动翻译

### 3.8 改造 user 模块加鉴权 (0.5d)

把阶段 2 的 user 模块挂上 `auth: true` macro，验证：
- 没带 token 调用 `/users` 返回 401（错误信息按 locale 切换）
- 带 token 调用正常
- logout 后旧 token 失效
- logout-all 后所有 token 失效

## 学习重点

- **Elysia plugin 的本质**：就是 `new Elysia()` 实例，`.use()` 时合并 lifecycle hooks 和路由
- **`derive` vs `resolve`**：derive 在 onTransform 阶段、resolve 在 beforeHandle 阶段，**ctx 类型扩展是关键**
- **`macro` 的威力**：你定义 `auth: true` 后，路由声明这一项就触发预设的 beforeHandle，**比装饰器优雅**
- **`mapResponse` vs `onAfterHandle`**：前者改响应体、后者只观察。响应壳用前者
- **生命周期顺序**：onRequest → onParse → onTransform → derive → beforeHandle → resolve → handler → afterHandle → mapResponse → onError(若错) → onAfterResponse
- **Plugin 命名**：`new Elysia({ name: 'auth' })` 启用去重，避免重复挂载

## 避雷

- ❌ **不要**写 `class AuthGuard implements ElysiaGuard`（Elysia 没这玩意儿，别造概念）
- ❌ **不要**用 reflect-metadata（这是 NestJS 的死路）
- ❌ **不要**在路由 handler 里手动 `if (!ctx.user) throw 401`，用 `auth: true` macro
- ❌ **不要**把 i18n 文案写死在 throw 处，throw 错误码、序列化时再翻译
- ❌ **不要**把 `password` 字段返回到响应里（schema.ts 里就 `t.Omit` 掉）
- ⚠️ JWT secret 不准 hardcode，必须走 env
- ⚠️ refresh token 一定要"一次性"——用过即入黑名单 + 签新的
- ⚠️ Redis key 命名要约定：`auth:user:{id}:version` / `auth:revoked:{jti}` / `auth:fail:{username}`，建立 `lib/redis-keys.ts` 集中管理

## 验收清单

### 错误体系
- [x] `BizError` 工厂或 class 已实现（class 风格，见 `lib/errors.ts`，附 notFound/unauthorized/forbidden 工厂）
- [x] 错误码用 `as const` 字面量联合，不是字符串
- [x] 全局 `onError` 处理 VALIDATION / NOT_FOUND / Pg 23505 / BizError / Unknown（见 `plugins/error-handler.ts`）
- [x] 未知错误响应不泄露 stack，但日志里有
- [x] 按设计决策 **traceId 不进响应体**，仅在日志链路保留（childLogger）；排障标识不暴露给前端，减少带宽和 API 契约噪声

### 响应壳
- [x] 所有业务路由响应统一 `{ code, msg, data }`，**不含 traceId**（按设计决议，排障信息仅在日志侧）
- [x] OpenAPI / health 等白名单不被包装
- [x] 已是包装格式的不重复包

### 请求上下文
- [x] 每个请求有 reqId（v4 uuid，`crypto.randomUUID()`）
- [x] logger 打日志带 reqId（childLogger 绑定）
- [x] 请求完成日志包含耗时和 status

### JWT
- [x] access / refresh 双 token
- [x] tokenVersion / jti 三层失效全实现
- [x] secret 从 env 读
- [x] payload 包含 roles / perms（为阶段 4 铺垫）

### Auth 模块
- [x] 登录返回 access + refresh
- [x] 登录失败计数 + 锁定可工作
- [x] 密码用 argon2/bcrypt 哈希
- [x] refresh 接口签新 token + 旧 refresh 入黑名单
- [x] logout 把当前 jti 入黑名单
- [x] logout-all 把 tokenVersion +1，旧 token 全失效

### Macro / Plugin
- [x] `auth: true` macro 在路由声明即生效
- [x] user 模块所有路由挂上 `auth: true`，无 token 返回 401

> **运行时验证由开发者完成**（curl + 浏览器）：未带 token → 401 / 带 token → 200 / logout 后旧 token 失效 / logout-all 后所有 token 失效 / Swagger UI 有 Authorize 按钮可试调。
- [x] 全项目无 `import 'reflect-metadata'`
- [x] 全项目无装饰器（除了 zod 校验等纯运行时库内部）

### i18n
- [x] ~~默认 zh，请求带 `Accept-Language: en` 切英文~~（跳过）
- [x] ~~错误码 → 文案映射可工作~~（跳过）
- [x] ~~文案文件按 locale 分~~（跳过）

**跳过理由**（详见 `docs/notes/2026-06-17-后端不做i18n.md`）：

1. 参考项目 youlai-boot 后端**没做** i18n，错误消息直接中文返回
2. youlai 前端 vue-i18n **只翻 UI 文案**（按钮/菜单/表单），**不翻后端错误码**
3. 错误消息直接用 `lib/errors.ts` 的 `ERR_MSG` 字典，UI 文案用前端 vue-i18n，分工清晰
4. 未来若真要做国际化，把 `ERR_MSG` 拆成按 locale 选即可，不用动 plugin 架构

### 整体
- [x] `bun run check` 通过
- [x] `bun run tsc` 通过
- [x] OpenAPI 文档里 Authorization 安全方案已声明，可用 token 试调

## 完成标志

```bash
# 登录
TOKEN=$(curl -s -XPOST localhost:3000/auth/login -d '{"username":"admin","password":"123456"}' -H "Content-Type: application/json" | jq -r .data.accessToken)

# 带 token 调用 user 接口
curl localhost:3000/users -H "Authorization: Bearer $TOKEN"

# 不带 token，401
curl localhost:3000/users
# 响应: { "code": "A0001", "msg": "未登录", "data": null }

# logout

# 旧 token 失效
curl localhost:3000/users -H "Authorization: Bearer $TOKEN"
# 401 token revoked
```

## 本阶段收获（完成后填写）

吃透了 Elysia 的 plugin 范式：`derive`/`resolve` 扩展 ctx 类型、`macro` 替代装饰器实现路由级鉴权、`onError` 全局错误处理、`onAfterHandle` 统一响应壳。核心认知转变：**Elysia 没有 Guard/Interceptor/AOP 这些概念**，所有横切关注点都是 lifecycle hook + ctx 类型推导。JWT 三层失效设计（exp + tokenVersion + jti 黑名单）借鉴了 youlai-boot，Redis key 命名规范在 `redis-keys.ts` 集中管理。i18n 决定不做——参考项目没做，前端 vue-i18n 只管 UI 文案，后端错误消息直出中文，分工清晰且简单。