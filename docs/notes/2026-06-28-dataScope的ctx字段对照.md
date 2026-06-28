# dataScope 的 ctx 字段对照

`2026-06-28` · 阶段 4.6 实施后补

> **前置阅读**：[`2026-06-24-perm和dataScope不是一回事.md`](./2026-06-24-perm和dataScope不是一回事.md)  
> 本文是 dataScope 内部的延伸：ctx 字段对照 + 边界陷阱 + ROOT 短路详解

---

## 起因

阶段 4.6 把 `dataScopeFilter` 接入 `findUsers` 时，被 ctx 4 个字段和 5 档 scope 的对应关系绕了几圈。

具体场景：装配 `DataScopeContext` 时，要查哪些表、查哪些字段、并行还是串行——这些"实现细节"在 `architecture.md §4.4` 蓝图里只画了表头，但**没有解释为什么只有这些档用这些字段**。这段补当时的顿悟。

## 五档 × ctx 字段速查（详解版）

> 速查表已在 `architecture.md §4.4.3` 收录，此处补充**为什么只有这些档用这些字段**。

| dataScope | 过滤 SQL | 用 ctx 哪个字段 | 为什么 |
|---|---|---|---|
| 1 ALL | （不加 WHERE） | - | 短路放行，跟字段无关 |
| 2 DEPT_AND_SUB | `dept_id IN (dept 子树)` | `ctx.treePath`（由 deptId 派生） | 需要"我的家族链"做 LIKE 匹配 |
| 3 DEPT | `dept_id = 我的部门` | `ctx.deptId` | 直接相等匹配 |
| 4 SELF | `created_by = 我的 ID` | `ctx.userId` | 按创建人匹配 |
| 5 CUSTOM | `dept_id IN (我被授权的部门列表)` | `scopes[i].customDeptIds` | 需要一个外部传入的部门集合 |

**只有 DEPT (3) 直接用 `ctx.deptId`，DEPT_AND_SUB (2) 通过 `ctx.treePath` 间接用。其他三档完全不看它们。**

## `ctx.deptId` ≠ `sys_user.dept_id` 列

这两个"部门 ID"看起来一样，**完全是两件事**：

| 名称 | 出处 | 含义 |
|---|---|---|
| `sys_user.dept_id`（DB 列） | 表字段 | "被查询的用户属于哪个部门" |
| `ctx.deptId`（运行时值） | `buildDataScopeContext` 装配 | "**我（当前登录用户）**属于哪个部门" |

### 5 个必须用 `sys_user.dept_id`（不能用 `sys_role_dept` 替代）的场景

1. **DEPT / DEPT_AND_SUB 档生成 SQL 时需要"我的部门"**：CUSTOM 场景下你被授权看产品部，不代表你"在"产品部，DEPT 档必须用本职部门。
2. **HR / 考勤 / 汇报关系**：直属领导是谁、考勤归哪个部门、工位在哪——这些是组织归属问题，不是权限问题。
3. **组织归属的 1:1 关系**：你一天只能在一个工位上坐着上班，不管有多少角色。
4. **离职 / 转岗时**：改 `sys_user.dept_id` 即可，CUSTOM 授权（`sys_role_dept`）保持不变。
5. **个人中心 UI 显示**：前端 "我的" 页面"所属部门"字段必须来自本职部门。

### 反例：如果用 `sys_user_role → sys_role_dept` 推"我的部门"

- 普通员工（无 CUSTOM 角色）→ `sys_role_dept` 为空 → 推不出部门 ❌
- 临时审计员（CUSTOM 绑了产品部）→ 推出来是产品部 → 覆盖本职研发部 ❌

## ROOT 双层短路详解

ROOT 角色在两个层各有一个短路点（速查表见 `architecture.md §4.4.4`），实现细节：

**Layer 2（perm 层）** —— `src/plugins/permission.ts`：
```ts
const isSuperUser = (user) =>
  user.roles.includes(ROLE_ROOT) || user.perms.includes(WILDCARD_PERM);
// 命中 → 直接 return，不走 perm 数组比对
```

**Layer 3（dataScope 层）** —— `src/db/helpers/data-scope.ts:dataScopeFilter`：
```ts
if (ctx.scopes.some((s) => s.scope === DATA_SCOPE.ALL)) {
  return undefined;  // 不加 WHERE，数据原样返回
}
```

**两个短路都缺一不可**：只短路 Layer 2 → 数据被 scope 卡住；只短路 Layer 3 → perm 卡死进不去。

## 边界与陷阱

| 场景 | 行为 | 处理 |
|---|---|---|
| 用户已被软删 | `findUserById` 风格：`deptId=null`，`treePath=null` | DEPT/DEPT_AND_SUB 自动降级 `1=0` |
| 用户无任何角色 | `dataScopes=[]` → `scopes=[]` | `dataScopeFilter` 返回 undefined（不限）。⚠️ 这时数据不受限，需上层 `auth: true` 配合——无角色用户应被拦截在入口 |
| 用户无部门 | `deptId=null` | 同上 |
| 多个相同 dataScope 角色 | JWT 里有 `[4, 4, 4]` | 段 3 Set 去重，避免生成重复 OR 条件 |
| CUSTOM 角色未绑任何部门 | `customDeptIds=[]` | 自动降级 `1=0` |
| `data_scope` 列允许 NULL | 段 3 的 `seen.has(scope)` 把 null 当一次 | `dataScopeFilter` 的 default 分支忽略，不污染聚合 |
| ADMIN（ALL）+ 业务组长（CUSTOM） | `scopes = [{1}, {5, deptIds:[10,20]}]` | ALL 短路返回 undefined → admin 看全部，不能被 CUSTOM 限权（安全语义核心） |

## `buildDataScopeContext` 三段执行（备忘）

`src/db/helpers/data-scope.ts` 里的装配函数，按 ponytail 最小改动原则组织：

1. **段 1（并行）**：查 `sys_user.deptId` + 查 `sys_role_dept`（仅当含 CUSTOM 角色时）
2. **段 2（串行，依赖段 1 的 deptId）**：查 `sys_dept.treePath`
3. **段 3（内存）**：dataScopes 去重，CUSTOM 携带 customDeptIds

**为什么不放 auth plugin 的 derive？** derive 每个请求都跑（鉴权 401 用），装配 ctx 是列表专用，全请求跑浪费 DB。
