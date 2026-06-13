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

### auditColumns 的 `as const` 导致 Drizzle 类型推导问题

**错误**：
```ts
export const auditColumns = { ... } as const;
// 放在 pgTable 的 spread 中会导致 extraConfig callback 参数类型异常
```

**原因**：`as const` 生成的字面量类型与 Drizzle 的 `ExtraConfigColumn` 类型不兼容。

**修复**：去掉 `as const`，改为普通对象。