# 阶段 4 · 权限核心（RBAC + 数据权限）

> 难度 ⭐⭐⭐⭐⭐ · 工时 6-7 天 · 学到：RBAC 数据建模、Elysia macro 高级用法、数据权限纯函数、tree_path 树查询
> **企业级真正起点**：三个项目里这部分都做得不够好，最该原创设计

## 目标

完整实现**菜单 + 按钮 + 接口 + 数据**四级权限闭环：
- 用户登录后能拿到自己的菜单树（按角色裁剪）
- 路由声明 `requirePerm('sys:user:create')` 自动校验
- 列表查询自动按数据权限（5 档枚举）过滤
- admin / dept-manager / staff 三角色调用相同 API 返回不同数据

## 前置检查

- [x] 阶段 3 验收全 ✅
- [x] JWT payload 已包含 `roles` / `perms` / `dataScopes` 字段（即使为空数组）
- [x] `auth: true` macro 已可用

## 子任务清单

### 4.1 数据建模（6 表）(1d)

按 youlai-boot 简化版：

`src/db/schema/system/role.ts`：
- 字段：id / code / name / sort / status / dataScope（'ALL' | 'DEPT' | 'DEPT_AND_SUB' | 'SELF' | 'CUSTOM'）+ auditColumns
- code 唯一索引

`src/db/schema/system/menu.ts`：
- 字段：id / parentId / type（'C'目录 | 'M'菜单 | 'B'按钮）/ name / path / component / icon / perm / sort / status / visible / keepAlive + auditColumns
- 树形：parentId 自引用 + parentIds 物化路径（可选）
- perm 字段：按钮和菜单都可能有，如 `sys:user:create`

`src/db/schema/system/dept.ts`：
- 字段：id / parentId / name / sort / status / **`treePath`**（如 "0,1,3"）+ auditColumns
- treePath 是关键，子树查询靠它

关联表：
- `sys_user_role`（userId / roleId）
- `sys_role_menu`（roleId / menuId）
- `sys_role_dept`（roleId / deptId）—— 仅 dataScope=CUSTOM 时使用

补充：sys_user 加 `deptId` 字段（如果阶段 2 没加）。

迁移 + seed（含 1 个 admin 角色 + 1 个 dept-manager 角色 + 完整菜单树 + 部门树）。

### 4.2 Role 模块 (1d)

`modules/role/{schema,routes,queries}.ts`：
- 列表 / 详情 / 新增 / 更新 / 软删
- **绑定菜单**：`PUT /roles/:id/menus` body 是 menuIds 数组，事务内先删后插
- **绑定部门**：`PUT /roles/:id/depts` 同上（仅 CUSTOM dataScope 角色用）
- 查询某角色的菜单 ID 列表 / 部门 ID 列表

### 4.3 Menu 模块 (1d)

`modules/menu/{schema,routes,queries}.ts`：
- 树形列表（递归构建）：`GET /menus/tree`
- CRUD
- 校验：parentId 不能形成循环、type=B 必须有 perm

`db/helpers/tree.ts`：通用树形构建工具
- `buildTree(items, { idKey, parentIdKey })` → 嵌套结构

### 4.4 Dept 模块 (0.5d)

`modules/dept/{schema,routes,queries}.ts`：
- 树形列表
- CRUD
- 创建/更新时自动维护 `treePath`（基于 parent 的 treePath + 自身 id）

`db/helpers/tree.ts` 加：
- `descendantsByTreePath(rootTreePath)`：返回 SQL fragment，匹配以 rootTreePath 开头的所有部门

### 4.5 Permission macro（关键）(1d)

`src/plugins/permission.ts`：

实现两个 macro：
- `requirePerm: string | string[]` —— 用户 perms 包含其中之一即放行
- `requireRole: string | string[]` —— 用户 roles 包含其中之一即放行

用户 perms 来源：
- 登录时一次性查出（user → roles → menus.perm 集合），写进 JWT payload
- **缓存优化**：登录时把 perms 写到 Redis `auth:user:{id}:perms`，token 里只放 hash 校验或 version
  - 第一版可不优化，直接放 JWT，写 ADR 记录"角色变更后需用户重新登录或主动 token-version+1"

用法示例：
```ts
.post('/users', handler, {
  auth: true,
  perm: 'sys:user:create',
  detail: { tags: ['User'] }
})
```

### 4.6 数据权限纯函数（关键）(1.5d)

`src/db/helpers/data-scope.ts`：

```ts
// DataScope 用 number 1-5 对齐 sys_role.data_scope (smallint)
const DATA_SCOPE = { ALL: 1, DEPT_AND_SUB: 2, DEPT: 3, SELF: 4, CUSTOM: 5 } as const
type DataScope = 1 | 2 | 3 | 4 | 5

type DataScopeContext = {
  userId: number
  deptId: number | null
  treePath: string | null
  scopes: Array<{ scope: DataScope, customDeptIds?: number[] }>  // 多角色
}

// 返回 SQL fragment（drizzle 可用）
export const dataScopeFilter = (
  ctx: DataScopeContext,
  tables: { user: { deptId: PgColumn, createdBy: PgColumn }, dept?: PgTable & { id: PgColumn, treePath: PgColumn } }
): SQL | undefined => {
  // 多角色取并集（OR）
  // 空 scopes → undefined（不限）
  // 任一 ALL → undefined（短路）
  // DEPT → eq(table.deptId, ctx.deptId)
  // DEPT_AND_SUB → table.deptId IN (子树)
  // SELF → eq(table.createdBy, ctx.userId)
  // CUSTOM → table.deptId IN customDeptIds
}
```

queries 里使用：
```ts
const where = and(
  eq(users.deleteTime, null),
  // ...其他业务条件
  dataScopeFilter(ctx, users)  // 显式调用
)
```

**关键**：
- 一开始可以只实现 ALL / SELF 两档，跑通流程
- DEPT_AND_SUB 用 `treePath LIKE 'rootPath,%'` 或 `treePath = rootPath` 即可（不用递归 CTE）
- 多角色取并集：用 `or(...)` 包多个 scope 条件

> 📋 **详细执行手册**：[`stage-4-data-scope.md`](./stage-4-data-scope.md)（A → B → C 串行步骤 + 5 个 Review 知识点 + Ship 核对清单）

### 4.7 用户菜单树接口 (0.5d)

`GET /menus/my-tree`（或挂 `/auth/menu`）：
- 拿当前 user → 角色 → 菜单 → 树形
- type=B 的按钮过滤掉（菜单树前端只用目录+菜单，按钮通过 perm 字段在前端单独判断）
- 返回菜单树 + perm 字符串列表（前端 `v-permission` 用）

### 4.8 ADR-001 权限模型 (0.5d)

`docs/adr/001-permission-model.md`：
- 决策：数据权限用"显式 query helper"而非"SQL 拦截器"
- 理由：显式 > 隐式、可调试、类型友好、避免魔法
- 反对方案：MyBatis 拦截器风格（youlai-boot）、装饰器+元数据（youlai-nest）
- 取舍：
  - 缺点：每个 list query 都要主动调，容易漏
  - 应对：约定 + lint 规则（list 类 query 必须接受 ctx 参数）+ 代码审查
- 多角色聚合策略：取并集
- 角色变更生效策略：tokenVersion +1 强失效

## 学习重点

- **RBAC 经典模型**：U-R-M / U-R-D 多对多
- **菜单 perm 字段一表多用**：路由 + 按钮 + 接口权限点共用一个字符串
- **物化路径 vs 递归 CTE**：tree_path 简单查询性能好，深更新成本高
- **Drizzle SQL fragment 拼装**：`and` / `or` / `inArray` / `sql\`...\`` 模板字面量
- **多角色聚合**：取并集而不是交集（用户角色越多权限越大）
- **Elysia macro 进阶**：macro 接收参数 + 注入 beforeHandle
- **JWT 与 Redis 配合**：什么放 JWT、什么放 Redis、为什么

## 避雷

- ❌ **不要**用拦截器自动改 SQL（魔法、隐藏、不可调试）—— 这是阶段 4 的核心反例
- ❌ **不要**把 perms 写成接口路径（如 `/api/users/create`），用业务码（`sys:user:create`）
- ❌ **不要**在数据库里硬编码"超级管理员跳过权限"。超管短路通过 `roles.includes("ROOT")` 或 `perms.includes("*:*:*")` 判断，详见 `architecture.md` §4.5
- ❌ **不要**把树形结构在 SQL 里 join 出来，DB 查平面 + 内存 buildTree 更清晰
- ❌ **不要**把 dataScope 逻辑写成 class 或装饰器，纯函数
- ⚠️ tree_path 维护：父节点改 parentId 时，子树所有节点的 treePath 都要更新（事务）
- ⚠️ 角色被绑定的菜单删除后，要级联清理 sys_role_menu（FK 或事务）
- ⚠️ 用户登录后 perms 进 JWT，角色调整后需 tokenVersion +1，否则旧 token 还用旧权限
- ⚠️ macro 参数类型一定要严格，避免 `as any`
- ⚠️ 多角色 dataScope 是并集，admin 通常有 ALL，要让"任一角色 ALL"短路返回 undefined（不加 where）

## 验收清单

### 数据建模
- [x] sys_role / sys_menu / sys_dept 三表 + 三关联表已建
- [x] dept.treePath 字段在创建/更新时自动维护（4.4 Dept 模块实现）
- [x] 种子数据完整：7 角色（ROOT/ADMIN/GUEST/DEPT_MANAGER/DEPT_MEMBER/EMPLOYEE/CUSTOM_USER），部门树 2 层，菜单 25 条

### Role 模块
- [x] 完整 CRUD
- [x] 绑定菜单接口（事务保证）
- [x] 绑定部门接口（仅 CUSTOM dataScope 时启用）
- [x] 删除角色时清理关联

### Menu 模块
- [x] 树形列表正确（嵌套结构）
- [x] 防循环：parentId 不能是自己的子孙
- [x] type=B 时 perm 必填校验

### Dept 模块
- [x] 树形列表正确
- [x] treePath 在 insert / update parentId 时自动维护（含级联更新子树）
- [x] 子树查询 helper 可工作（descendantsByTreePath）

### Permission macro
- [x] 路由可声明 `perm: 'sys:user:create'`
- [x] 用户无该 perm 返回 403
- [x] 用户有该 perm（来自任一角色）放行
- [x] 超管短路：`roles.includes("ROOT")` 或 `perms.includes("*:*:*")` 跳过权限校验（详见 `architecture.md` §4.5）
- [x] 多 perm 任一满足即放行（OR 语义）
- [x] requireRole macro 同样可工作

### 数据权限
- [x] dataScope 5 档枚举均有实现
- [x] DEPT_AND_SUB 用 treePath 子树查询，跑通
- [x] CUSTOM 从 sys_role_dept 查 deptIds
- [x] 多角色取并集：admin（ALL）+ 其他 → 等同于 ALL
- [x] user 模块的 GET /users 接入 dataScope，三角色返回不同数据集

### 菜单树接口
- [x] `/menus/my-tree` 按角色返回不同菜单树
- [x] 按钮被过滤
- [x] 同时返回 perm 字符串列表

### ADR
- [x] `docs/adr/0002-permission-model.md` 已写
- [x] 含决策、理由、反对方案、取舍、生效策略

### 端到端验证（最重要）
- [ ] 用 admin 登录调 `/users` 看到全部用户
- [ ] 用 dept-manager 登录调 `/users` 仅看到本部门及子部门用户
- [ ] 用 staff 登录调 `/users` 仅看到自己创建的用户
- [ ] dept-manager 调 `/roles`（无 sys:role:list 权限）返回 403
- [ ] admin 调 `/menus/my-tree` 看到全部菜单
- [ ] dept-manager 调 `/menus/my-tree` 看到裁剪后的菜单

## 完成标志

```bash
# 三角色对比
ADMIN_TOKEN=$(login admin)
MANAGER_TOKEN=$(login dept_manager)
STAFF_TOKEN=$(login staff)

# 同一接口不同结果
curl /users -H "Authorization: Bearer $ADMIN_TOKEN"     # 50 条
curl /users -H "Authorization: Bearer $MANAGER_TOKEN"   # 12 条
curl /users -H "Authorization: Bearer $STAFF_TOKEN"     # 3 条

# 权限拒绝
curl /roles -H "Authorization: Bearer $STAFF_TOKEN"     # 403

# 菜单裁剪
curl /menus/my-tree -H "Authorization: Bearer $MANAGER_TOKEN"
# 看不到"系统管理"目录
```


## 本阶段收获（完成后填写）
