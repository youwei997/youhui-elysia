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
// 改前
createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

// 改后
createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
```

配套改动：手动设值处传 ISO 字符串而非 Date 对象：

```ts
// 改前
.set({ deletedAt: new Date() })
// 改后
.set({ deletedAt: new Date().toISOString() })
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

### drizzle-orm/zod 直接从表派生会暴露审计列/id/敏感字段

**现象**：`PUT /users/:id` 的 body schema 把 `createdAt`/`createdBy`/`updatedAt`/`updatedBy`/`deletedAt`/`id`/`password` 全部暴露给前端，前端可直接篡改创建时间、清空 `deletedAt` 反软删、改 `id` 引发主键错乱。

**原因**：

1. `createInsertSchema`/`createUpdateSchema` 直接从整张表派生，**所有列都进 schema**，包括审计列。
2. `generatedByDefaultAsIdentity` 的 `id` **不会被自动排除**——只有 `generatedAlwaysAsIdentity` 才会被 `createUpdateSchema` 自动排除（文档：update schema 对 generated column 会排除）。本项目 id 用的是 `generatedByDefault`（为支持 seed 手动插），所以泄漏。

**修复**：用 `.omit({ 字段: true })` 显式排除服务端控制的字段，审计列统一抽 `auditKeys` 复用：

```ts
const auditKeys = {
  id: true, createdBy: true, createdAt: true,
  updatedBy: true, updatedAt: true, deletedAt: true,
} as const;

// Create Body：排除 id + 审计列
export const UserCreateBody = createInsertSchema(sysUser, { ... })
  .omit(auditKeys);

// Update Body：最小可改集，排除 id + 审计列 + password + username
export const UserUpdateBody = createUpdateSchema(sysUser, { ... })
  .omit({ ...auditKeys, password: true, username: true });
```

**原则**：

- 审计列（createdAt/createdBy/.../deletedAt）永远由服务端控制，前端不可注入
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
