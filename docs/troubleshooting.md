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
  username: (s) => s.describe("登录用户名"),  // ts(7006)
};
createInsertSchema(sysUser, userFieldRefine);

// ✅ inline 写进调用 → s 推导为 z.ZodString
createInsertSchema(sysUser, {
  username: (s) => s.describe("登录用户名"),
});
```

**代价**：Create/Update 共享相同描述时需各写一份 refine（无法复用）。这是 drizzle 类型推导的限制，接受重复换取类型正确。