# 阶段 3 · 横切 Plugin 体系（吃透 Elysia 范式）

> 难度 ⭐⭐⭐ · 工时 4-5 天 · 学到：Elysia plugin / derive / resolve / onError / mapResponse / macro
> **核心阶段**：这阶段是你"Elysia 范式吃透"的真正起点，elysia-admin 范式不正的坑就在这里避开

## 目标

把所有横切关注点（错误处理、响应壳、请求上下文、JWT、i18n）实现为 **Elysia plugin** —— 全部用 `derive` / `resolve` / `mapResponse` / `onError` / `onAfterHandle`，**不准**用装饰器、AOP、拦截器、Reflector。

完成后，阶段 2 的 user 模块要被改造为：**带 token 才能访问**，错误信息按 `Accept-Language` 切换语言，响应壳统一。

## 前置检查

- [ ] 阶段 2 验收全 ✅
- [ ] user 模块三件套已跑通
- [ ] OpenAPI 文档可看

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
- 也可保留 class 风格 `class BizError extends Error`（throw 友好），权衡后决定，写 ADR

`src/plugins/error-handler.ts`：
- `onError` 全局处理：分支 VALIDATION / NOT_FOUND / Postgres 唯一冲突（23505）/ BizError / 未知错
- 统一返回 `{ code, msg, data: null, traceId }`
- 未知错误打日志（含 stack）但响应不要泄露 stack

### 3.2 响应壳（plugin/response-wrap）(0.5d)

`src/plugins/response-wrap.ts`：
- 用 `mapResponse` 把 handler 返回值包成 `{ code: 0, msg: 'ok', data }`
- 跳过白名单：OpenAPI 文档路径（`/openapi`、`/openapi/json`）、健康检查（`/health`）
- 已经是包装格式的不重复包（鸭子类型检测：含 `code` 字段就跳过）

### 3.3 请求上下文（plugin/request-context）(0.5d)

`src/plugins/request-context.ts`：
- `onRequest` 注入 `reqId`（uuid v4，用 Bun 内置 `crypto.randomUUID()`）+ `startTime`
- `derive` 把 `reqId` 挂到 ctx 上
- 创建子 logger `logger.child({ reqId })` 也挂到 ctx
- `onAfterResponse` 打"请求完成"日志（含耗时、status）
- 原理详见 `docs/architecture.md` 4.2.1 节（reqId 是内存临时编号，不存表；与阶段 5 的操作日志表是两回事）

### 3.4 JWT 库（lib/jwt）(0.5d)

`src/lib/jwt.ts`：
- 基于 `jose`，HS256 对称签名
- 函数：`signAccessToken(payload)` / `signRefreshToken(payload)` / `verifyToken(token)`
- access token 短期（15min），refresh token 长期（7d）
- payload 结构：`{ sub, username, roles, perms, dataScopes, tokenVersion, jti }`

**三层失效设计**（关键，参考 youlai-boot）：
1. **`exp`**：JWT 自带过期
2. **`tokenVersion`**：用户级版本号，存在 Redis `auth:user:{id}:version`，改密码/踢全部时 +1
3. **`jti`**：单 token 注销，存在 Redis `auth:revoked:{jti}` 黑名单（值=过期时间）

校验逻辑：先验签 + exp → 查 tokenVersion → 查 jti 黑名单。

### 3.5 auth plugin（derive ctx.user）(0.5d)

`src/plugins/auth.ts`：
- 一个 Elysia plugin
- `derive` 从 `Authorization: Bearer xxx` 解析 token → 校验 → 注入 `ctx.user`
- token 缺失：`ctx.user = null`（**不在 plugin 里直接 401**，让具体路由用 `requireAuth` macro 决定）
- 实现 `requireAuth` macro：路由声明 `auth: true` 自动校验 user 非空

> **核心范式**：不要装饰器 + Reflector + Guard 那套，就是 plugin + derive + macro。
> 反例参考 `docs/architecture.md` 第 5 节。

### 3.6 Auth 模块（modules/auth）(1d)

新增：
- `db/schema/system/auth.ts`：可选——是否拆 `auth_accounts` 表（密码 / OAuth / passkey 多种登录方式分离）。**第一版直接用 `sys_user.password` 简化**，记录在 ADR 里"未来要拆"。

`src/modules/auth/schema.ts` + `routes.ts` + `queries.ts`：
- `POST /auth/login`：username + password → access + refresh
  - 密码用 **argon2** 或 **bcrypt** 哈希（推荐 argon2，bcrypt 也行）
  - 登录失败计数：Redis `auth:fail:{username}`，N 次后锁定 M 分钟
  - 成功后清失败计数
- `POST /auth/refresh`：refresh token → 新 access token（同时签发新 refresh token，旧的入黑名单）
- `POST /auth/logout`：把当前 jti 入黑名单 + 删除当前 refresh token
- `POST /auth/logout-all`：tokenVersion +1（踢用户所有端）

### 3.7 i18n plugin (1d)

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
- ⚠️ argon2 在 Bun 上的 native binding 注意，可能要 `bun add argon2` 后 rebuild
- ⚠️ Redis key 命名要约定：`auth:user:{id}:version` / `auth:revoked:{jti}` / `auth:fail:{username}`，建立 `lib/redis-keys.ts` 集中管理

## 验收清单

### 错误体系
- [ ] `BizError` 工厂或 class 已实现
- [ ] 错误码用 `as const` 字面量联合，不是字符串
- [ ] 全局 `onError` 处理 VALIDATION / NOT_FOUND / Pg 23505 / BizError / Unknown
- [ ] 未知错误响应不泄露 stack，但日志里有
- [ ] 响应包含 traceId（reqId）便于排查

### 响应壳
- [ ] 所有业务路由响应统一 `{ code, msg, data, traceId }`
- [ ] OpenAPI / health 等白名单不被包装
- [ ] 已是包装格式的不重复包

### 请求上下文
- [ ] 每个请求有 reqId（v7 uuid，可排序）
- [ ] logger 打日志带 reqId
- [ ] 请求完成日志包含耗时和 status

### JWT
- [ ] access / refresh 双 token
- [ ] tokenVersion / jti 三层失效全实现
- [ ] secret 从 env 读
- [ ] payload 包含 roles / perms（为阶段 4 铺垫）

### Auth 模块
- [ ] 登录返回 access + refresh
- [ ] 登录失败计数 + 锁定可工作
- [ ] 密码用 argon2/bcrypt 哈希
- [ ] refresh 接口签新 token + 旧 refresh 入黑名单
- [ ] logout 把当前 jti 入黑名单
- [ ] logout-all 把 tokenVersion +1，旧 token 全失效

### Macro / Plugin
- [ ] `auth: true` macro 在路由声明即生效
- [ ] user 模块所有路由挂上 `auth: true`，无 token 返回 401
- [ ] 全项目无 `import 'reflect-metadata'`
- [ ] 全项目无装饰器（除了 zod 校验等纯运行时库内部）

### i18n
- [ ] 默认 zh，请求带 `Accept-Language: en` 切英文
- [ ] 错误码 → 文案映射可工作
- [ ] 文案文件按 locale 分

### 整体
- [ ] `bun run check` 通过
- [ ] `bun run typecheck` 通过
- [ ] OpenAPI 文档里 Authorization 安全方案已声明，可用 token 试调

## 完成标志

```bash
# 登录
TOKEN=$(curl -s -XPOST localhost:3000/auth/login -d '{"username":"admin","password":"123456"}' -H "Content-Type: application/json" | jq -r .data.accessToken)

# 带 token 调用 user 接口
curl localhost:3000/users -H "Authorization: Bearer $TOKEN"

# 不带 token，401
curl localhost:3000/users
# 响应: { "code": "A0001", "msg": "未登录", "data": null }

# 切英文
curl localhost:3000/users -H "Accept-Language: en"
# 响应: { "code": "A0001", "msg": "Unauthorized", "data": null }

# logout
curl -XPOST localhost:3000/auth/logout -H "Authorization: Bearer $TOKEN"

# 旧 token 失效
curl localhost:3000/users -H "Authorization: Bearer $TOKEN"
# 401 token revoked
```

## 本阶段收获（完成后填写）
