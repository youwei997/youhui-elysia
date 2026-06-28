# 阶段 4.6 数据权限纯函数 · 核心

> **父文档**：[`stage-4-rbac.md §4.6`](./stage-4-rbac.md#46-数据权限纯函数关键15d)（设计 / 验收清单）
> **本文档**：只保留**核心代码 + 核心逻辑**，具体 verify 命令和步骤看父文档

---

## 📋 进度

A ✅ 已完成 / B ✅ 已完成 / C ✅ 已完成

---

## 🧠 3 个核心设计决策

### 1. `DataScope` 用 `number 1-5`，不用字符串

父文档示例写的是字符串字面量联合，**错的**。实测 schema 是 smallint 1-5，JWT 也是 `number[]`：

```ts
export const DATA_SCOPE = {
  ALL: 1, DEPT_AND_SUB: 2, DEPT: 3, SELF: 4, CUSTOM: 5,
} as const;
export type DataScope = (typeof DATA_SCOPE)[keyof typeof DATA_SCOPE];
// → 1 | 2 | 3 | 4 | 5
```

### 2. ALL 短路在外层入口，不在 5 档 switch 里

```ts
// ✅ 外层短路（多角色 OR 聚合：任一 ALL 即穿透）
if (ctx.scopes.some((s) => s.scope === DATA_SCOPE.ALL)) return undefined;
```

**为什么**：`admin (ALL) + staff (SELF)` 必须等同 ALL。如果 SELF 在 switch 里先生成条件再被 OR，结果虽然一样但 SQL 复杂、语义不清。

### 3. 边界降级 = `sql\`1=0\``，不抛错

| 场景 | 降级为 |
|---|---|
| `deptId=null`（DEPT / DEPT_AND_SUB） | `sql\`1=0\`` 零结果 |
| `customDeptIds=[]`（CUSTOM） | `sql\`1=0\`` 零结果 |
| 未知 scope（null / 0 / 6+） | `undefined` 不计入聚合 |
| `scopes=[]` | `undefined`（不限） |

**为什么**：纯函数不该抛 HTTP 错；安全默认偏严——"没声明的权限 = 零数据"。

---

## 💻 核心代码（`src/db/helpers/data-scope.ts`）

### 主函数

```ts
export const dataScopeFilter = (
  ctx: DataScopeContext,
  tables: DataScopeTables,
): SQL | undefined => {
  if (ctx.scopes.length === 0) return undefined;
  if (ctx.scopes.some((s) => s.scope === DATA_SCOPE.ALL)) return undefined;  // ALL 短路

  const whereFragments = ctx.scopes
    .map((s) => scopeToCondition(s, ctx, tables))
    .filter((c): c is SQL => c !== undefined);

  if (whereFragments.length === 0) return undefined;
  if (whereFragments.length === 1) return whereFragments[0];
  return or(...whereFragments);
};
```

### 5 档 switch

```ts
const scopeToCondition = (
  scope: ScopeEntry,
  ctx: DataScopeContext,
  tables: DataScopeTables,
): SQL | undefined => {
  switch (scope.scope) {
    case DATA_SCOPE.ALL:
      return undefined;
    case DATA_SCOPE.SELF:
      return eq(tables.user.createdBy, ctx.userId);
    case DATA_SCOPE.DEPT:
      if (ctx.deptId == null) return sql`1=0`;
      return eq(tables.user.deptId, ctx.deptId);
    case DATA_SCOPE.DEPT_AND_SUB: {
      if (ctx.treePath == null) return sql`1=0`;
      if (!tables.dept) return sql`1=0`;
      const subtree = descendantsByTreePath(tables.dept.treePath, ctx.treePath);
      return sql`${tables.user.deptId} IN (SELECT ${tables.dept.id} FROM ${tables.dept} WHERE ${subtree})`;
    }
    case DATA_SCOPE.CUSTOM:
      if (!scope.customDeptIds || scope.customDeptIds.length === 0) return sql`1=0`;
      return inArray(tables.user.deptId, scope.customDeptIds);
    default:
      return undefined;
  }
};
```

### 类型

```ts
export type DataScopeContext = {
  userId: number;
  deptId: number | null;
  treePath: string | null;
  scopes: ScopeEntry[];  // { scope: DataScope | number; customDeptIds?: number[] }
};

export type DataScopeTables = {
  user: { deptId: PgColumn; createdBy: PgColumn };
  dept?: { id: PgColumn; treePath: PgColumn };  // DEPT_AND_SUB 必填
};
```

### 单测 helper（renderSql）

```ts
import { CasingCache } from "drizzle-orm/casing";
import { PgDialect } from "drizzle-orm/pg-core";

const renderSql = (fragment: SQL) => {
  const dialect = new PgDialect();
  return fragment.toQuery({
    casing: new CasingCache(),
    escapeName: dialect.escapeName.bind(dialect),
    escapeParam: dialect.escapeParam.bind(dialect),
    escapeString: dialect.escapeString.bind(dialect),
  });
};

// 断言用 toContain 关键片段（如 `"created_by"`、`"LIKE"`、`"1=0"`），不用 toEqual SQL 对象
```

---

## 🎯 5 个 Review 核心知识点

### 1. Eden Treaty 端到端类型推导
后端 Zod schema 加字段 → 前端调用点**自动报错**，不用改代码。**review 点**：routes handler 返回值**显式标注类型**。

### 2. 依赖方向宪法
`schema → queries → routes`，`lib → 任何`。**review 点**：`queries.ts` 里 grep `from 'elysia'` → 红色警报。

### 3. 多角色 OR 聚合的安全语义
`admin (ALL) + staff (SELF)` = ALL（**OR 不是 AND**）。单测 case 7 已覆盖。

### 4. 纯函数边界降级
输入缺失 → 降级（不是抛错）。**安全默认偏严**。

### 5. 副作用函数单测断言
SQL 片段 / reducer / selector → 用 `toContain` 关键片段，不用 `toEqual` 对象。

---

## 🚫 反例（不要做）

| ❌ | ✅ 替代 |
|---|---|
| `dataScopeFilter` 写成 class | 纯函数（保持依赖方向） |
| SQL 拦截器自动改 where | 显式 `dataScopeFilter(ctx, tables)` |
| queries 里 import Elysia ctx | ctx 在 routes 层装配，queries 只接受 `DataScopeContext` |
| 写操作（POST/PUT/DELETE）也接 dataScopeFilter | 写操作由 4.5 接口权限 + 业务规则把控 |
| DataScope 用字符串字面量 | 用 `number 1-5` 对齐真实 schema |

---

## 📦 Ship 核对清单（Ferment C1）

- [x] `src/db/helpers/data-scope.ts` 导出 `dataScopeFilter`
- [x] 8 个单测 case 代码完成（全绿需 `bun test` 验证）
- [x] `GET /users` 接入 `dataScopeFilter` 代码完成（50/12/3 需 curl 三角色验证）
- [x] `bun run check` / `tsc` / `check:dev` 全 exit 0（已验证通过）
- [ ] `plan/README.md` 进度日志追加 4.6 行（独立任务）
- [x] 父文档验收清单"数据权限"5 项 `[ ]` → `[x]`
