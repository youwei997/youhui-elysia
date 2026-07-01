# 踩坑记录（随时间积累）

记录开发过程中遇到的报错和修复方案，方便后续排查。

---

## Drizzle ORM

### `.get()` 仅 SQLite 可用，PG/MySQL 用 `rows[0]`

**错误**：

```
Property 'get' does not exist on type 'Omit<PgAsyncSelectBase<...>,...>'
```

**原因**：`.get()` 是 Drizzle **SQLite** 独有 API，PostgreSQL 不存在。

**修复**：

```ts
// ❌ PG 不可用
return db.select().from(sysUser).where(eq(sysUser.id, id)).get();

// ✅ PG 正确写法
const rows = await db.select().from(sysUser).where(eq(sysUser.id, id));
return rows[0];
```

---

### `.where()` 不接收数组，需用 `and()` / `or()` 合并

**错误**：

```
Argument of type 'SQL<unknown>[] | undefined' is not assignable to parameter of type 'SQL<unknown> | undefined'
```

**原因**：Drizzle 的 `.where()` 只接受**单个 SQL 表达式**，不接受数组。

**修复**：

```ts
// ❌ 数组传入
.where(where.length ? where : undefined)

// ✅ 用 and() 合并
.where(where.length ? and(...where) : undefined)
```

---

### count() 查询结果类型推断为 `| undefined`

**错误**：

```
Property 'total' does not exist on type '{ total: number; } | undefined'
```

**原因**：`db.select(...)` 返回 `T[]`，TypeScript 认为数组第一个元素可能为 `undefined`。

**修复**：

```ts
// ❌ 直接解构
const [{ total }] = await db.select({ total: count() }).from(sysUser).where(...);

// ✅ 安全访问 + 默认值
const result = await db.select({ total: count() }).from(sysUser).where(...);
const total = result[0]?.total ?? 0;
```

---

## Zod

### Zod 4 中 `ZodError.errors` 已废弃

**错误**：

```
Property 'errors' does not exist on type 'ZodError<unknown>'
```

**原因**：Zod 4 将 `errors` 改名为 `issues`（与标准规范对齐）。

**修复**：

```ts
// ❌ Zod 3
err.errors.map(...)

// ✅ Zod 4
err.issues.map(...)
```

---

## TypeScript / tsconfig

### `baseUrl` 在 TypeScript 7.0 中将废弃

**错误**：

```
error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0
```

**原因**：TypeScript 7.0 废弃 `baseUrl` + `paths` 模式。

**修复**：使用 Bun 推荐的 `moduleResolution: "bundler"` 配合 `paths`。

---

## Drizzle Schema

### 不可对 insertSchema omit 不存在的字段

**错误**：

```
Object literal may only specify known properties, and 'id' does not exist...
```

**原因**：`createInsertSchema(table)` **自动排除** `generatedByDefaultAsIdentity` 的 `id`，`.omit({ id: true })` 报错。

**修复**：不对 insertSchema 做 `.omit({ id: true })`。

---

## Elysia / OpenAPI

### `warn: Date cannot be represented in JSON Schema`

**现象**：终端输出 `warn: Date cannot be represented in JSON Schema`，OpenAPI 文档中时间字段无正确 schema。

**原因**：Drizzle `timestamp` 字段默认 `mode: "date"`，drizzle-zod 推导为 `z.date()`。`@elysia/openapi` 无法将 `z.date()` 映射为 JSON Schema（JSON Schema 无 Date 原生类型）。

**修复**：timestamp 字段加 `mode: "string"`，让 drizzle-zod 推导为 `z.string()`（ISO 字符串）：

```ts
// 改前（旧命名）
createTime: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

// 改后（加 mode: "string"）
createTime: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
```

配套改动：手动设值处传 ISO 字符串而非 Date 对象：

```ts
// 改前
.set({ deleteTime: new Date() })
// 改后
.set({ deleteTime: new Date().toISOString() })
```

---

### drizzle-orm/zod 的 refine 箭头函数标注 `z.ZodType` 会击穿类型

**现象**：给 `createInsertSchema` 的 refine 里的箭头函数显式标注参数类型 `(s: z.ZodType) => s.describe(...)` 后，下游 `db.insert(sysUser).values(data)` 报 `unknown` 不可赋值给 `string`：

```
Type 'unknown' is not assignable to type 'string | SQL<unknown> | Placeholder<string, any>'.
(parameter) data: { username: unknown; password: unknown; ... }  // 整个 schema 退化成 unknown
```

**原因**：drizzle-orm/zod 的 refine 类型是 `BuildRefineField<T> = ((schema: T) => z.ZodType) | z.ZodType`，最终字段类型取自**箭头函数的返回值**（`ReturnType<TRefinement>`）。手写 `s: z.ZodType` 把参数从「具体子类（如 `z.ZodString`）」降级成「基类」，`.describe()` 返回基类，于是整个 insert schema 的字段类型退化为 `unknown`。

**修复**：去掉参数类型标注，让 TS 从 drizzle 泛型推导 `s` 为对应列的具体 zod 类型：

```ts
// ❌ 标注 z.ZodType → 击穿类型，data 全部 unknown
username: (s: z.ZodType) => s.describe("登录用户名"),

// ✅ 不标注，让 drizzle 推导为 z.ZodString
username: (s) => s.describe("登录用户名"),
```

---

### drizzle-orm/zod 的 refine 对象抽成共享 const 会触发 noImplicitAny

**现象**：把 refine 对象抽成共享常量后，编辑器报：

```
Parameter 's' implicitly has an 'any' type. ts(7006)
```

**原因**：TS 的 contextual typing（反向推导）只在**对象字面量直接作为函数实参**时触发。先 `const x = {...}` 再 `fn(x)`，TS 会先独立推导 `x` 的类型，此时箭头函数参数 `s` 无上下文 → 退化为 `any`，触发 `noImplicitAny`。inline 时 drizzle 的泛型参数直接约束对象字面量，`s` 才能被正确推导为 `z.ZodString`。

**修复**：refine 对象必须 inline 写进 `createInsertSchema`/`createUpdateSchema` 调用，不能抽成共享 const：

```ts
// ❌ 抽常量 → s 退化为 any
const userFieldRefine = {
  username: (s) => s.describe("登录用户名"), // ts(7006)
};
createInsertSchema(sysUser, userFieldRefine);

// ✅ inline 写进调用 → s 推导为 z.ZodString
createInsertSchema(sysUser, {
  username: (s) => s.describe("登录用户名"),
});
```

## **代价**：Create/Update 共享相同描述时需各写一份 refine（无法复用）。这是 drizzle 类型推导的限制，接受重复换取类型正确。

### drizzle-zod `createUpdateSchema` 的数字字段拒绝前端字符串

**现象**：前端编辑表单提交 PUT 请求返回 `422 Unprocessable Entity`，`{ code: "A0400", msg: "参数校验失败" }`。

**原因**：前端 `.form` 接口把 `parentId` 等数字字段转成了字符串（`String(parsed.parentId)`），前端回传 PUT body 时还是字符串格式。但 `createUpdateSchema(sysDept)` 从 Drizzle schema `bigint({ mode: "number" })` 自动映射为 `z.number()`，拒绝字符串输入。

**修复**：在 `createUpdateSchema` 的字段回调中，把需要兼容字符串的数字字段替换为 `z.coerce.number()`：

```ts
// ❌ s 是 z.number()，拒绝字符串
parentId: (s) => s.describe("父部门 ID"),

// ✅ z.coerce.number() 先 Number(input) 再校验，字符串/数字都能过
parentId: () => z.coerce.number().describe("父部门 ID"),
```

**原理**：`createUpdateSchema` 遍历表的 Drizzle 列，按类型自动生成 Zod schema：

| Drizzle 列类型 | 自动生成 `s` |
|---|---|
| `varchar` | `z.string()` |
| `smallint` | `z.number().int()` |
| `bigint({ mode: "number" })` | `z.number()` |
| `timestamp({ mode: "string" })` | `z.string()` |
| `boolean` | `z.boolean()` |

字段回调里的 `s` 就是对应列的 Zod schema——不传回调时直接用，传了可以覆盖（drizzle 文档："providing a Zod schema will overwrite it"）。

**适用场景**：任何前端需要把数字字段当字符串传回的 PUT/PATCH 接口。如果多个模块有相同问题，考虑用 `createUpdateSchema` 的 factory 第二个参数加全局 `coerce` 配置，而不是逐字段改。

**现象**：`PUT /users/:id` 的 body schema 把 `createTime`/`createdBy`/`updateTime`/`updatedBy`/`deleteTime`/`id`/`password` 全部暴露给前端，前端可直接篡改创建时间、清空 `deleteTime` 反软删、改 `id` 引发主键错乱。

**原因**：

1. `createInsertSchema`/`createUpdateSchema` 直接从整张表派生，**所有列都进 schema**，包括审计列。
2. `generatedByDefaultAsIdentity` 的 `id` **不会被自动排除**——只有 `generatedAlwaysAsIdentity` 才会被 `createUpdateSchema` 自动排除（文档：update schema 对 generated column 会排除）。本项目 id 用的是 `generatedByDefault`（为支持 seed 手动插），所以泄漏。

**修复**：用 `.omit({ 字段: true })` 显式排除服务端控制的字段，审计列统一抽 `auditKeys` 复用：

```ts
const auditKeys = {
  id: true, createdBy: true, createTime: true,
  updatedBy: true, updateTime: true, deleteTime: true,
} as const;

// Create Body：排除 id + 审计列
export const UserCreateBody = createInsertSchema(sysUser, { ... })
  .omit(auditKeys);

// Update Body：最小可改集，排除 id + 审计列 + password + username
export const UserUpdateBody = createUpdateSchema(sysUser, { ... })
  .omit({ ...auditKeys, password: true, username: true });
```

**原则**：

- 审计列（createTime/createdBy/.../deleteTime）永远由服务端控制，前端不可注入
- `id` 从路径参数来，不在 body
- `password` 更新走专用接口（带旧密码校验），不在通用 PUT 里
- 业务枚举字段（gender/status）用 `z.literal` 联合覆盖 smallint 原始范围，消除 `-32768~32767` 这种无意义边界

## **配套**：refine 里覆盖字段类型时直接传 ZodType（如 `gender: genderSchema`）即"覆盖"语义，drizzle 官方支持（文档 Refinements 章节："providing a Zod schema will overwrite it"）。

### 响应壳用 `mapResponse` 类型报错，应改用 `onAfterHandle`

**现象**：

```
Type 'unknown' is not assignable to type 'MaybePromise<void | Response>'.
```

**原因**：`mapResponse` 的回调签名是 `(ctx) => MaybePromise<Response | void>`，要求返回标准 `Response` 对象（它是给"手动序列化"场景用的）。返回普通对象 `{ code, msg, data }` 类型对不上。

```ts
// ❌ mapResponse 返回普通对象，类型不匹配
new Elysia().mapResponse({ as: "global" }, ({ responseValue }) => {
  return { code: "00000", msg: "成功", data: responseValue };
});
```

**修复**：改用 `onAfterHandle`，回调签名是 `(ctx) => MaybePromise<unknown | void>`，返回普通对象合法：

```ts
// ✅ onAfterHandle 返回普通对象，类型自洽
new Elysia().onAfterHandle({ as: "global" }, ({ responseValue }) => {
  return { code: "00000", msg: "成功", data: responseValue };
});
```

**附带**：不需要判断"返回值是否已是壳格式"来防重复包，因为 `onError`（handler 抛错）和 `onAfterHandle`（handler 正常返回）互斥，error-handler 返回的 `{ code, msg, data }` 不会进入 onAfterHandle。

---

### 改了代码不生效——先查端口有没有僵尸进程

**现象**：改了 error-handler 代码（plugin 形式装配到 app.ts），curl 测试一直返回旧的错误格式（500 + 纯文本），怎么改都不生效。

**原因**：Windows 上 bun 进程有时不会被 Ctrl+C 干净杀掉，多次 `bun dev` 累积出多个僵尸进程（bun.exe），同时监听同一端口。curl 打到的是某个旧进程，跑的是旧代码，新代码根本没被执行。

```bash
# 一查发现 3000 端口有 3 个 bun 进程在 LISTEN
$ netstat -ano | findstr :3000 | findstr LISTENING
  TCP    0.0.0.0:3000    LISTENING    20384
  TCP    0.0.0.0:3000    LISTENING    28928
  TCP    0.0.0.0:3000    LISTENING    19204
```

**排查步骤**（改了代码不生效时，按此顺序，别急着改代码）：

```bash
# 1. 看端口被谁占
netstat -ano | findstr :3000 | findstr LISTENING

# 2. 确认 PID 是不是 bun
powershell -Command "Get-Process -Id <PID>"

# 3. 杀掉僵尸进程（需要管理员权限）
powershell -Command "Stop-Process -Id <PID> -Force"
# 或任务管理器 → 详细信息 → 结束 bun.exe

# 4. 换个干净端口启动，确认新代码生效
```

**预防**：每次启 bun dev 前先 `netstat` 确认端口干净；重启服务前确认上次进程真的退了。Windows 上 bun 进程比 node 更容易留僵尸。

---

### `onAfterResponse` 里 `new URL(request.url)` 在 Bun 1.3.14 + Windows 崩溃

**现象**：启动服务接收请求时崩溃：

```
TypeError: "" cannot be parsed as a URL.
  code: "ERR_INVALID_URL"
      at <anonymous> (src/plugins/request-context.ts:30:24)
```

进程被未捕获异常拖死，curl 一打就退出。

**原因**：`onAfterResponse` 阶段的 `request.url` 在 Bun 1.3.14 + Windows 组合下可能是**空字符串或相对路径**，`new URL("")` 直接抛 `ERR_INVALID_URL`。**纯静态分析（`tsc --noEmit`）和单元测试都查不出来**——必须真启动服务接收请求才暴露。

**修复**：包 try/catch + fallback：

```ts
let pathname: string;
try {
  pathname = new URL(request.url).pathname;
} catch {
  pathname = request.url || "<unknown>";
}
```

**教训**：

- `bun run check:dev`（`bun run --check src/index.ts`）**不是类型检查**，是真启动服务。如果只想类型检查，**用 `bun run tsc`**（`tsc --noEmit`）。
- **只跑 `tsc` + 单元测试的阶段不算"真验证"**，涉及 runtime 行为（hook、lifecycle、URL 解析等）的代码必须 `bun run check:dev` 真启动服务跑一遍。
- 阶段 3 验收漏洞：之前一直用 `tsc` 绕过 `check:dev`，导致 `onAfterResponse` 的 URL 解析 bug 从阶段 3.3 引入开始一直没暴露。阶段 3.8 第一次真启动服务才暴露出来。

---

### Elysia macro 显式返回类型注解导致 `Context` 类型冲突

**错误**：

```
Type '(context: { body: unknown; ... })' is not assignable to type '(context: { body: unknown; ... })'.
Two different types with this name exist, but they are unrelated.
```

**原因**：`.macro()` 内部手写返回类型 `{ beforeHandle: (ctx: Context) => void | Promise<void> }` 时，TypeScript 把**宏函数参数的类型**和**宏函数内部 Elysia 推导的 Context** 视为两个不同的 `Context` 类型（即使都是从 `elysia` 导入的同一个 `Context`）。两个 Context 的泛型参数（`body`、`query`、`params` 等）不完全对齐，TS 认为是两个不同的类型。

**修复**：不要给 macro 写显式返回类型注解，让 Elysia 自己推导：

```ts
// ❌ 显式标注 → Context 类型冲突
rateLimit: (opts: string): { beforeHandle: (ctx: Context) => void | Promise<void> } => { ... }

// ✅ 不写返回类型，让 Elysia 推导
rateLimit: (opts: string) => { ... }
```

**配套**：macro 内部的 `beforeHandle` 参数用 `context: Context`（从 `elysia` 导入），不要用 `any`。

---

### beforeHandle 返回对象不会阻断请求，必须 `return new Response()`

**错误**：限流触发后设置 `set.status = 429` + ` return { code, msg, data }`，但请求继续走到了路由 handler。

**原因**：Elysia 的 `beforeHandle` 只有 `return new Response()` 或 `throw` 才会被识别为"阻断信号"。返回普通对象（`{ code, msg, data }`）不会被 Elysia 当作响应拦截——它只是把对象放在那，仍然继续往下执行路由 handler。

```ts
// ❌ 对象不阻断，请求会继续
if (current > max) {
  set.status = 429;
  return { code: "A0001", msg: "请求过于频繁", data: null };
}

// ✅ new Response() 才是阻断信号
if (current > max) {
  set.status = 429;
  set.headers = { "Retry-After": String(window) };
  return new Response("Too Many Requests", { status: 429 });
}
```

**配套**：`async` 函数的 `beforeHandle` 末尾要加 `return;`（显式返回 void），否则 TS 推断出 `Promise<Response | undefined>`，与 Elysia 预期的 `Promise<void>` 不兼容。

---

### 路由顺序冲突：先注册的路由会拦截后注册的同模式路由

**现象**：`GET /:type/items` 和 `GET /:id/items` 两条路由 URL 模式完全相同。`:type` 是 `string`，`:id` 是 `z.coerce.number()`。先注册 `/:type/items` 会拦截所有请求，`:id/items` 永远到不了。

**原因**：Elysia 按注册顺序匹配路由，**先注册的先匹配**。`:type`（string）接受任何值，包括数字。`:id/items`（number）在后注册，根本没有机会被匹配。

**修复**：让 `:id/items`（带参数类型约束的）先注册，`:type/items`（兜底的）后注册：

```ts
// ✅ `:id` 先注册，数字优先匹配
.get("/:id/items", ...)
.post("/:id/items", ...)
// ...
// ✅ `:type` 后注册，非数字 fallback
.get("/:type/items", ...)
```

---

### `exactOptionalPropertyTypes` 模式下 Zod 可选字段不能直接传函数

**现象**：`z.object({ name: z.string().optional() })` 推导出 `{ name?: string | undefined }`，但函数参数 `data: { name?: string }` 在 `exactOptionalPropertyTypes` 下期望的是 `name` 不存在（`undefined` 不可赋值），导致 `as` 击穿。

**错误**：

```
Argument of type '{ name?: string | undefined }' is not assignable to parameter of type '{ name?: string; }' with 'exactOptionalPropertyTypes: true'.
```

**原因**：`exactOptionalPropertyTypes` 模式下，`name?: string` 和 `name?: string | undefined` 是两种不同的类型。前者表示"key 存在时值必须是 string"，后者表示"key 存在时值可以是 string 或 undefined"。Zod 的 `.optional()` 生成的是 `string | undefined`，函数参数期望的是 `string`。

**修复**：不要在外层加 `as`，而是改函数签名为 `name?: string | undefined`：

```ts
// ❌ 外层 as 击穿类型
const dict = await updateDict(params.id, body as { name?: string }, db);

// ✅ 改函数签名，接受 `| undefined`
async function updateDict(id: number, data: { name?: string | undefined }, db: DB) { ... }
//                                                       ^^^^^^^^^^
```

---

### `redis.set(key, value, "EX", ttl)` 的 ttl 参数类型要求 `string`

**现象**：

```
Argument of type 'number' is not assignable to parameter of type 'string'.
```

**原因**：Bun 内置 Redis 客户端的 `set` 方法签名中，`EX`/`PX` 后的值参数类型是 `string` 而非 `number`。直接传 `10`（number）会报类型错误。

**修复**：用 `String(ttl)` 转换：

```ts
// ❌ number 类型不匹配
await redis.set(key, "1", "NX", "EX", 10);

// ✅ String() 转换
await redis.set(key, "1", "NX", "EX", String(10));
```

---

---

## 种子数据

### 种子执行报 `column does not exist`——先 `db:push` 同步 schema

**现象**：`bun run db:seed` 报错：

```
PostgresError: column "remark" of relation "sys_role" does not exist
```

**原因**：TS 的 Drizzle schema 已包含某个字段，但数据库里还没有（迁移未执行）。种子脚本按 TS schema 生成 SQL，DB 不匹配。

**修复**：先推 schema 到数据库，再跑种子：

```bash
bun run db:push    # 同步 schema 到 DB
bun run db:seed    # 跑种子
```

---

### 种子后新增数据报主键冲突——显式 ID 导致 sequence 错位

**现象**：种子写入成功，但 POST 创建新记录报：

```
PostgresError: duplicate key value violates unique constraint "xxx_pkey"
```

**原因**：种子脚本对 `generatedByDefaultAsIdentity()` 的列插入了显式 ID（如 1, 2, 3），但 Postgres identity sequence 仍停留在 1。下次 `default` 取 sequence 值 = 1，与已存在的记录冲突。

**修复**：种子脚本末尾复位 4 张表的 sequence：

```ts
await db.execute(`
  SELECT setval('sys_dept_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_dept));
  SELECT setval('sys_menu_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_menu));
  SELECT setval('sys_role_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_role));
  SELECT setval('sys_user_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_user));
`);
```

已集成到 `scripts/seed.ts` 第 8 步。手动修复也可直接跑上面 SQL。

---

## JWT / Auth

### clockTolerance 必须 > 0

`verifyToken` 里设 `clockTolerance: 60`（秒），否则边缘过期的 token 在服务器时钟稍有偏差时被误杀。测试构造过期 token 时，过期时间必须超过容错值（如 `-120s` 而非 `-1s`）。

### tokenVersion 为 null 时不能拒绝

新用户首次登录时 Redis 里没有 `auth:user:{id}:version` key（`null`），此时要跳过校验而非拒绝。代码必须写成：

```ts
if (currentVersion !== null && Number(currentVersion) !== jwtPayload.tokenVersion) {
  throw unauthorized();
}
```

而非简化成 `if (Number(currentVersion) !== ...)`——否则 `Number(null) === 0` 但逻辑脆弱，且 `tokenVersion` 从 1 开始后新用户全被拒。

### `not.toBeNull()` 不会收窄 TypeScript 类型

```ts
expect(body.user).not.toBeNull();
expect(body.user.sub).toBe("99"); // TS: body.user possibly null
```

**原因**：`expect().not.toBeNull()` 是运行时断言，TypeScript 不会因此收窄联合类型。

**修复**：用 `if (!x) throw` 强制收窄：

```ts
if (!body.user) throw new Error("expected user to be non-null");
expect(body.user.sub).toBe("99");
```
