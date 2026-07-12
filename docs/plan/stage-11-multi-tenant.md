# 阶段 11 · 多租户（Multi-Tenancy）

> 目标：在不改前端（`vue3-element-admin-v4.6.0`）的前提下，补齐后端多租户能力，
> 对齐 youlai-boot-tenant 的**单库多租户**契约。
> 技术栈：Bun + ElysiaJS + Drizzle + PostgreSQL（与本项目一致）。
> 参考：Java 原版 `H:\open-source\frontend\youlai-boot-tenant`（仅作契约/行为参考，**不是**实现基准）。

---

## 0. 进度分析（前置）

| 阶段 | 状态 |
|---|---|
| 1 地基 · 2 基础CRUD · 3 Plugin · 4 权限 · 5 进阶 · 8 补充 · 10 SSE | ✅ 已完成 |
| 6 代码生成器 | ⏭️ 已跳过（用户决定不做） |
| 7 收尾&部署 | ⬜ 未开始 |
| **tenant / tenant-plan / switch-tenant** | ⬜ **本次新增（阶段 11）** |

**结论**：业务框架（RBAC、数据权限、SSE）均已就绪，唯一缺口是租户维度。
本项目现状：schema 无 `tenant_id`、JWT 无 `tenantId`、`src/modules` 无 tenant 模块。
租户全部靠"后端补、前端不动"补齐。

---

## 1. 设计决策（与 Java 原版对齐）

### 1.1 隔离模式：单库多租户（tenant_id 列）
- **不选**独立 schema / 独立库：复杂度高、Drizzle 动态 schema 难做、与本项目稳定范式冲突。
- **选**单库多租户：所有业务表加 `tenant_id` 列，查询统一过滤。**与 Java 原版完全一致**。

### 1.2 租户来源：JWT 携带 `tenantId`（非请求头）
- 前端**不发**租户请求头（`utils/request.ts` 无任何 tenant header）。
- 前端 `stores/tenant.ts` 切换租户时：先调 `auth/switch-tenant` 拿到**新 token**（新 tenantId 已写入 JWT），再调 `tenants/:id/switch` 拿 `TenantInfo`。
- 因此后端：登录时把用户所属 `tenantId` 写进 JWT；切换时重新签发。所有业务查询从 `ctx.user.tenantId` 取上下文。
- **平台租户 `tenantId = 0`**：SaaS 运营方，租户管理类接口（tenant / tenant-plan 模块）以平台身份运行，绕过隔离。

### 1.3 隔离落地：Drizzle 类型安全 `.where(eq(...))`（严禁 sql 模板）
- 新增 `db/helpers/tenant.ts`：
  - `tenantEq(table, tenantId)` → 返回 `eq(table.tenantId, tenantId)`，供 `.where(and(...))` 组合。
  - `isPlatformTenant(tenantId)` → `tenantId === 0`。
- 新增 plugin `src/plugins/tenant.ts`（`derive` 全局）：从 `ctx.user.tenantId` 暴露 `ctx.tenantId` 与 `ctx.isPlatform`。
- 所有业务 query 函数增加 `tenantId` 入参（与现有 `db` 入参风格一致，纯函数），在 `.where` 拼 `tenantEq`。
- 与数据权限组合时：`.where(and(tenantEq(t, tenantId), dataScopeFilter(...), isNull(t.deleteTime)))`，**`tenantEq` 统一放 `and()` 最前**（仅为可读性/一致性约定；PG 优化器按统计信息与可用索引选执行计划，不依赖 `and()` 参数顺序，不做索引层面论证）。
- 租户管理类模块（tenant / tenant-plan）**不调用** `tenantEq`，即绕过隔离（等价 Java 的 `ignoreTables`）。

### 1.4 Java 原版 `ignoreTables` 映射（哪些表不参与隔离）
平台级 / 共享表（**不加** tenant_id，或加了但模块级绕过）：
- `sys_tenant`、`sys_tenant_plan`、`sys_tenant_plan_menu`（租户定义本身）
- `sys_menu`（菜单目录，全租户共享；租户菜单分配走 `sys_tenant_menu` 桥表）
- `sys_dict`、`sys_dict_item`（字典共享）
- `sys_config`（系统配置共享）
- `sys_ip_blacklist`（基础设施，平台级）

业务表（**加** `tenant_id`，自动隔离）：
`sys_user`、`sys_role`、`sys_dept`、`sys_user_role`、`sys_role_menu`、`sys_role_dept`、
`sys_notice`、`sys_user_notice`（用户公告快照）、`sys_oper_log`、`sys_login_log`、`sys_file`、
`sys_tenant_menu`（桥表，PK 含 tenant_id）。

---

## 2. 前端契约对照（必须对齐，前端不改）

### 2.1 认证侧
| 端点 | 方法 | 说明 | 现状 |
|---|---|---|---|
| `/api/v1/auth/login` | POST | body 可选 `tenantId`；返回 token | 需改：解析并写 JWT |
| `/api/v1/auth/switch-tenant` | POST | `?tenantId=`；返回新 `LoginResponse` | **缺失，需新增** |

> 注：`auth/switch-tenant` 只负责换 token（写入新 tenantId），`tenants/{id}/switch` 只负责返回租户信息——两接口共同完成切换，非冗余。

### 2.2 租户模块 `/api/v1/tenants`
| 端点 | 方法 | 说明 | 现状 |
|---|---|---|---|
| `/tenants/options` | GET | 当前用户可访问租户列表 `TenantInfo[]`（实现：`isPlatform ? 所有启用租户 : 仅自身租户`，与 §4 仅平台超管可切一致） | **缺失** |
| `/tenants/current` | GET | 当前租户信息 `TenantInfo` | **缺失** |
| `/tenants/{id}/switch` | POST | 切换（返回 `TenantInfo`） | **缺失** |
| `/tenants` | GET | 平台租户分页 | **缺失** |
| `/tenants/{id}/form` | GET | 表单回填 | **缺失** |
| `/tenants` | POST | 新增并初始化默认数据（返回 `TenantCreateResult`） | **缺失** |
| `/tenants/{id}` | PUT | 修改 | **缺失** |
| `/tenants/{ids}` | DELETE | 批量删除 | **缺失** |
| `/tenants/{id}/status` | PUT | `?status=` 改状态 | **缺失** |
| `/tenants/{id}/menuIds` | GET | 租户菜单ID集合 | **缺失** |
| `/tenants/{id}/menus` | PUT | 更新租户菜单（body: number[]） | **缺失** |

### 2.3 租户套餐模块 `/api/v1/tenant-plans`
| 端点 | 方法 | 说明 | 现状 |
|---|---|---|---|
| `/tenant-plans` | GET | 分页 | **缺失** |
| `/tenant-plans/{id}/form` | GET | 表单回填 | **缺失** |
| `/tenant-plans` | POST | 新增 | **缺失** |
| `/tenant-plans/{id}` | PUT | 修改 | **缺失** |
| `/tenant-plans/{ids}` | DELETE | 批量删除 | **缺失** |
| `/tenant-plans/options` | GET | 套餐下拉 | **缺失** |
| `/tenant-plans/{id}/menuIds` | GET | 方案菜单ID集合 | **缺失** |
| `/tenant-plans/{id}/menus` | PUT | 更新方案菜单（body: number[]） | **缺失** |

### 2.4 前端类型形状（照搬，不重新设计）
- `TenantInfo { id, name, domain? }`
- `TenantItem`（id/name/code/contactName/contactPhone/contactEmail/domain/logo/planId/status/remark/expireTime/createTime/updateTime）
- `TenantForm`（编辑，含 `status`）：id/name/code/contactName/contactPhone/contactEmail/domain/logo/planId/status/remark/expireTime
- `TenantCreateForm`（新增，**无 `status`、含 `adminUsername`**，对齐前端契约 `api/system/tenant/types.ts`）：name/code/contactName/contactPhone/contactEmail/domain/logo/planId/remark/expireTime/**adminUsername**。`adminUsername` 即 §4 创建管理员命名的输入来源（提交 `admin/root` 保留名则拒绝；未提交则按 `t_{code}_admin` 生成）。
- `TenantCreateResult { tenantId, tenantCode, tenantName, adminUsername, adminInitialPassword, adminRoleCode }`
- `TenantPlanItem / TenantPlanForm { id, name, code, status, sort, remark }`
- 分页统一 `{ list, total }`（与本项目现有范式一致）

---

## 3. 数据库 schema 变更（`db:push` 同步，非 migrate）

### 3.1 现有业务表加列
对以下表新增 `tenantId: bigint("tenant_id").notNull().default(0)`：
- 独立 schema 文件：`user, role, dept, operLog, loginLog, file`
- `notice.ts` 内两张：`sys_notice`（公告）、`sys_user_notice`（用户公告快照，**Java 原版有 `tenant_id`，本次须补齐**）
- `relation.ts` 内：`userRole, roleMenu, roleDept`（加 `tenant_id` 列；**PK/唯一约束不统一加 tenantId，逐表对齐 Java 原版**）：
  - `sysUserRole`：PK 保持 `(userId, roleId)` 不变（userId 全局唯一，tenantId 仅作冗余索引列，加 `idx_user_role_tenant_id`，同原版 `PRIMARY KEY (user_id, role_id)`）
  - `sysRoleMenu`：PK 保持 `(roleId, menuId)` 不变（同上，同原版 `uk_roleid_menuid(role_id, menu_id)`）
  - `sysRoleDept`：PK 改为 `(tenantId, roleId, deptId)`（对齐原版 `uk_tenant_roleid_deptid(tenant_id, role_id, dept_id)` 唯一索引**含** tenant_id）

- **`sys_role` / `sys_dept` 主表自身唯一约束：全局 → 租户内复合唯一**（🔴 本轮新增，前九轮漏；不改会导致建租户/建同名角色直接失败）：
  - **问题**：`role.ts:18/20` 的 `name`/`code`、`dept.ts:15` 的 `code` 现为**全局单列 `.unique()`**；Java 原版是**租户内唯一**（`sql/youlai_admin_tenant.sql:374-375` role `uk_tenant_name`/`uk_tenant_code`、`:43` dept `uk_tenant_code`）。全局唯一下：① `POST /tenants` 给每租户建默认部门（code=tenantCode）/管理员角色时，两租户用相同编码即撞约束、建租户 500；② 两租户各自建同名角色（如都叫"财务"）第二个 500，破坏「租户间独立」。
  - **改法**：删除 `role.name`/`role.code`/`dept.code` 的单列 `.unique()`，改为表第二参数回调里的复合 `uniqueIndex`：
    - `role.ts`：`uniqueIndex("uniq_role_tenant_name").on(tenantId, name)` + `uniqueIndex("uniq_role_tenant_code").on(tenantId, code)`
    - `dept.ts`：`uniqueIndex("uniq_dept_tenant_code").on(tenantId, code)`
    - **范式**：用 `uniqueIndex(...).on(...)`（对齐本项目现有复合唯一先例 `dict-item.ts:43/48`），不用单列 `.unique()`。
  - **软删交互（决策）**：原版复合含 `is_deleted`（允许软删后同码重建）；本项目软删用 `deleteTime`（可空 timestamp），且**现有单租户基线本就是 plain `.unique()`（软删行仍占编码、不可同码重建）**。为行为一致 + 不主动优化（AGENTS §3），本次仍用 **plain 复合 `(tenant_id, code)`**，**不**加 `WHERE delete_time IS NULL` 偏索引；「软删后同码重建被占用」是与当前单租户一致的**已知限制**，非多租户引入的回归，未来要放开再评估偏索引。
  - **连带影响（核实实际代码，修正 reviewer 表述）**：本项目 `saveRole`/`saveDept` **无** app 层「编码已存在」count 查重（唯一性纯靠 DB 约束兜底：role/dept queries 里 `已存在` 零命中、role 仅分页 `count()`、dept 仅一处 `insert`）。故 reviewer 提的「查重 count 须加 tenantEq」在本项目**不适用**——改约束即足够，无需动 queries。（区别于 Java 有 app 层 `count`；未来若补友好冲突提示，记得 beta.22 的 PG 错误码走 `err.cause?.code`。）
  - **与 username 的区别（勿混）**：username 保持全局唯一是**有意偏离**原版（原版 `sys_user` 亦 `uk_username_tenant`，`:559`），因前端登录不采集 tenantId、需全局消歧（§4 line 153-155）；role/dept 的 code/name 无登录场景、原版明确租户内唯一，两者不可类比。

> `sys_tenant.code` / `sys_tenant_plan.code` **保持全局 `.unique()`**（平台级定义，原版亦全局 `uk_code`：`:797` / `:323`），§3.2 已标 `code unique`，勿误改为租户内。
> 注：`tenantMenu`（`sys_tenant_menu`）是**新建**表，见 §3.2，不在此列；`relation.ts` 当前仅含 `userRole/roleMenu/roleDept` 三张。
> `menu / dict / dict-item / config / ip-blacklist` **不加** tenant_id（平台共享，见 1.4）。

### 3.2 新增表

> **审计列策略（须定案，勿留到写代码）**：管理表用**完整 `auditColumns`（含 `deleteTime` 软删）**，对齐本项目管理表范式（`role/dept/config/dict` 均如此），**不**跟 Java 原版硬删。理由：① `architecture.md §4.12` 要求业务表带 `auditColumns`；② 项目内"局部复用 `auditColumns.createTime`（物理删除）"的先例**仅限事件表**（`oper_log/login_log`，见 `docs/notes/2026-06-29-auditColumns-局部复用案例.md`），tenant/tenant-plan 是管理表不属此类。桥表（`*_menu`）同 `relation.ts` **不带**审计列。
> **DELETE 语义**：`DELETE /tenants/{ids}` = **软删**（置 `deleteTime`），仅标记租户行本身，**不级联**软删该租户的 user/role/dept（避免 reviewer 担心的大范围级联）；租户停用后登录侧按 status/存在性拦截。

- `sys_tenant`（id, name, code unique, contactName, contactPhone, contactEmail, domain unique, logo, planId, status, remark, expireTime, **+ `auditColumns`**）
- `sys_tenant_plan`（id, name, code unique, status, sort, remark, **+ `auditColumns`**）
- `sys_tenant_plan_menu`（tenantPlanId, menuId，PK 复合，**无审计列**，同桥表 `relation.ts`）
- `sys_tenant_menu`（tenantId, menuId，PK 复合，**无审计列**）

### 3.3 种子数据
- `sys_tenant`: `(0, '平台租户', 'PLATFORM', ...)`、`(1, '演示租户', 'DEMO', ...)`
- 现有 seed 用户（admin 等）归到 `tenant_id = 0`；可选新增一个 `tenant_id = 1` 演示用户。
- **`sys_menu` 补租户管理 / 套餐管理节点（必须 seed，否则前端不可见）**：
  - 菜单为平台共享表（§1.4 不加 `tenant_id`），但"谁能看到"由 `sys_tenant_menu` 子集 + 角色权限控制。
  - 参照本项目 `scripts/seed.ts` 现有范式（目录 → 页面节点 → 按钮权限节点，`perm` 字段对齐权限码表）：
    - **租户管理目录**（如 `system/tenant`）：下挂页面节点（`routeName`/`component` 对齐前端 `src/views/system/tenant` 实际路由）+ 按钮节点，按钮 `perm` 逐一对齐 Step 5 权限码表（`sys:tenant:list/create/update/delete/change-status/plan-assign`）。
    - **套餐管理目录**（如 `system/tenant-plan`）：下挂页面节点 + 按钮节点，`perm` 对齐 `sys:tenant-plan:list` / `sys:tenant-plan:create` / `sys:tenant-plan:update` / `sys:tenant-plan:delete` / `sys:tenant-plan:assign`（精确按钮权限，与 Step 6 `requirePerm` 一致；`assign` 对应「套餐菜单配置」节点，Java 菜单 1205）。
  - 不 seed 的后果：非 ROOT 的平台运营角色 `getUserPerms` 收不到 `sys:tenant:*`，`v-hasPerm` 隐藏按钮；且 `/menu/tree` 不含该目录，侧边栏不显示租户管理菜单。
- **`sys_menu.scope` 分类（🔴#2：计划原漏，Java 靠 `WHERE scope=2` 切业务菜单）**：`menu.ts:51` 已有 `scope: smallint default 1`（1=平台 / 2=业务），但当前 `scripts/seed.ts` 中 `scope` 出现 **0 次**——须给每个菜单节点显式赋值 `scope`（平台管理类=1、业务类=2），否则全部默认 1，无法切出「演示租户=仅业务菜单」。
- `sys_tenant_menu`: 平台(0) 全量菜单（`SELECT 0, id FROM sys_menu`，**含**新租户管理/套餐管理节点 id，它们 scope=1）；演示(1) **仅业务菜单**（`SELECT 1, id FROM sys_menu WHERE scope=2`，不含平台管理）。与 Java 原版 seed 逻辑一致，保证「套餐限制菜单」落地。
- 平台运营角色（非 ROOT）经 `sys_role_menu` 关联到上述租户管理/套餐管理按钮节点，使其 `perms` 含 `sys:tenant:list/create/update/delete/change-status/plan-assign` 与 `sys:tenant-plan:list/create/update/delete`（ROOT 用户短路不依赖 perms；此处 `sys:*` 为集合简写，非 `requirePerm` 的字面通配）。
- `sys_tenant_plan`: 至少 1 个默认套餐，`sys_tenant_plan_menu` 关联菜单。

---

## 4. JWT / Auth 变更

- `JwtPayload` 增加 `tenantId: number`。
- `signAccessToken/signRefreshToken` 调用处补 `tenantId`（来自 `sys_user.tenant_id`）。
- **login**：body 可选 `tenantId`。
  - **前端登录表单不采集 `tenantId`**（仅显示租户标签，无 `LoginForm.tenantId` 绑定），故**保持 `username` 全局唯一**，不改为 `(username, tenant_id)` 复合唯一——否则无 tenantId 时登录同名跨租户歧义，且无前端配合无法消歧。
  - 解析规则：按 `username` 全局唯一定位用户；若 body 带 `tenantId`，校验 `user.tenantId === body.tenantId` 或当前为平台超管，否则 401；写入 JWT 的 `tenantId` 取该用户所属租户。
- **新增 `POST /api/v1/auth/switch-tenant?tenantId=`**：
  - `auth: true`；校验当前用户允许切换到该租户（`user.tenantId === target` 或平台超管）。
  - 重新签发 token（新 `tenantId`），返回 `{ accessToken, refreshToken, tokenType, expiresIn }`。
  - **权限码决策（显式记录）**：本期**不加** `sys:tenant:switch` 权限码——普通租户用户只属单一租户、`/tenants/options` 只返回自身租户，无切换场景；实际能跨租户切换的只有平台超管，靠**超管短路**即足够。Java 原版有 `sys:tenant:switch`，若未来放开给普通用户跨租户，再补该码 + 前端切换入口。
- `refresh-token`：JWT 已含 tenantId，刷新自动沿用，无需改动。
- **创建租户时管理员与角色规约（🟡#6，避免实现时再拍脑袋；对齐 Java 原版 `TenantServiceImpl`）**：
  - **用户名**：`t_{tenantCode}_admin`（例 `t_DEMO_admin`），全局唯一避免与平台 `admin/root` 保留名冲突；若前端提交的管理员名恰为 `admin/root` 则拒绝（平台保留名仅 `tenant_id=0` 可用）。
  - **角色编码**：`TENANT_ADMIN_{tenantCode}`（例 `TENANT_ADMIN_DEMO`），dataScope = `1`（仅本人部门数据），作为该租户默认管理员角色。
  - **初始密码**：`123456`（Java `SystemConstants.DEFAULT_PASSWORD`），写入 `TenantCreateResult.adminInitialPassword`；**须要求首次登录强制改密**，否则弱口令暴露（前端登录后提示或后端首登校验）。
  - 上述三项即 `POST /tenants` 初始化产物，已在 §2.3 types 列出 `adminUsername/adminInitialPassword/adminRoleCode`。

### 4.x 权限装载的租户上下文（认证链盲区，本轮补，定案）

**核心原则**：用户身份相关装载——`findUserPerms`(权限码)、`findUserRoles`(角色)、`findMenusByRoleCodes`(当前用户 `/menus/routes` 菜单树，调用点 `menu/routes.ts:126`)——一律以**用户所属租户 `sys_user.tenant_id`（home tenant）**为 tenant 上下文，**不随 token 当前 `tenantId` 漂移**；只有 Step 4 业务数据查询才用 token 当前 `tenantId`。

**为什么（对齐 Java 原版 `getCurrentUserInfo`/`listCurrentUserRoutes`：平台超管的角色/权限/菜单恒从 `PLATFORM_TENANT_ID(0)` 读，不随切换目标租户漂移）**：
1. **消除 §6 line 284 与 §4 line 157 的自相矛盾**：原风险表称「同一用户不会跨租户有不同权限」，但 switch-tenant 恰恰让超管跨租户。定案「perms 从 home tenant 读」后该句变为**真**——超管无论切到哪个租户，perms 恒来自 tenant 0；`userPerms(userId)` 缓存 key 不冲突、无需加 tenantId 维度（撤掉"未来预留"的含糊表述）。
2. **非 ROOT 平台运营角色不被误伤（🔴 真问题）**：前端 `hasPerm`(`src/utils/auth.ts:58`) 仅对 `roles.includes(ROLE_ROOT)` 短路；§3.3 的「平台运营角色（非 ROOT）」带真实 `sys:tenant:*` perms。若 `findUserPerms` 用 token 当前 tenantId，该角色切到租户 1 后 role_menu 绑定在 tenant 0 查不到 → perms 变空 → 租户管理按钮整片消失（后端 requirePerm 短路救不了前端 `v-hasPerm`）。用 home tenant 则恒返回 tenant 0 的 perms，切换不影响。
3. **ROOT 本身无害但语义要对齐**：ROOT 角色按约定不绑菜单，`findUserPerms` 返回 `[]`（`auth/queries.ts:67-68` 注释已记）；后端 requirePerm 与前端 `hasPerm` 均靠 ROOT 短路放行。用 home tenant 加载后 `[]` 仍是稳定结果，不受切换扰动。

**落地（随 Step 4 一起做）**：
- `findUserPerms(userId, db)`：内部按 `userId` 取 `sys_user.tenant_id` 作 homeTenant，join `sys_role_menu` 加 `tenantEq(sysRoleMenu.tenantId, homeTenant)`。login/refresh/switch-tenant 调用处**不传** token.tenantId（或显式传 homeTenant）。
- `findUserRoles(userId, db)`：join `sys_user_role` 加 `tenantEq(sysUserRole.tenantId, homeTenant)`（防止跨租户角色泄漏，语义同上）。
- `findMenusByRoleCodes`（当前用户菜单树）：Step 4 已要求 `sys_role_menu ∩ sys_tenant_menu(tenantId)`；此处 `tenantId` 传 **homeTenant** 而非 token 当前 tenantId → 超管见全量（tenant 0 = 全菜单），普通租户用户见本租户套餐子集。注意与「角色管理页菜单下拉」(遗漏 3) 区分：后者用被编辑角色的 tenant。
- **switch-tenant 的 perms 处理**：重签 token 时**复用** Redis `userPerms(userId)`（已是 home-tenant 结果），**不**按新 token.tenantId 重算；仅把 token.tenantId 改为 target 用于后续数据查询。语义「切换＝换数据视图租户，不动身份/权限」。

> 此项即「遗漏 1」的改法依据：`auth/queries.ts` 的 `findUserPerms`/`findUserRoles` 必须进入 Step 4 改造清单 + 门禁断言（见 Step 4）。

---

## 5. 分阶段实施步骤

### Step 1 · schema + 种子（0.5d）
- [ ] 业务表加 `tenantId` 列；新增 4 张租户表（schema 三件套风格：`db/schema/system/tenant.ts` 等）
- [ ] `bun run db:push` 同步库
- [ ] 补种子：租户 0/1、tenant_menu、tenant_plan、现有用户归 tenant 0
- [ ] **⚠️ seed.ts 扩展量（第四轮 review A）**：当前 `scripts/seed.ts` 仅 6 个业务模块、**无租户管理/套餐管理任何菜单节点**、`sys_role_menu` 仅绑 ADMIN。须按 §3.3 新增「租户管理/套餐管理」目录+页面+按钮节点（perm 对齐权限码表）、新增平台运营角色（非 ROOT）并将其绑定上述节点 + 纳入 `tenant_menu(0)`。此步改动面不小，Step 1 工时预留充足。
- [ ] 单测：schema 类型推断通过

### Step 2 · JWT + Auth + switch-tenant（0.5d）
- [ ] `JwtPayload` 加 `tenantId`；login 解析并写入
- [ ] 新增 `auth/switch-tenant` 路由（校验 + 重新签发）
- [ ] **目标租户状态校验（第四轮 review D）**：`auth/switch-tenant` 与 `tenants/{id}/switch` 均须先查目标租户**存在且 `status=1` 且 `deleteTime IS NULL`**，否则 400/404。防平台超管切到已软删/停用租户——`§3.2` 软删不级联、租户行仍可被查到，若不加校验 token 会携带无效 tenantId、后续业务查询全空却不报错。**本函数在 Step 2 即前置创建**（放 `lib/tenant.ts` 或 tenant queries 雏形，勿等 Step 5 整模块），两路由统一调用。
- [ ] 单测：登录带/不带 tenantId；切换后 token 含新 tenantId；越权切换被拒

### Step 3 · tenant 隔离 plugin + helper（0.5d）
- [ ] `src/plugins/tenant.ts`：`derive` 暴露 `ctx.tenantId` / `ctx.isPlatform`
- [ ] `db/helpers/tenant.ts`：`tenantEq` / `isPlatformTenant`
- [ ] 单测：`tenantEq` 生成正确条件

### Step 4 · 既有业务 query 接入 tenantId（1.5d，最大机械量，串行阻塞点）
- [ ] user / role / dept / menu(仅联表处) / notice（sys_notice + sys_user_notice）/ oper-log / login-log / file
      及各 relation 查询（userRole / roleMenu / roleDept）：加 `tenantId` 入参 + `.where(and(tenantEq(...), ...))`
- [ ] **`auth/queries.ts` 的 `findUserPerms` / `findUserRoles` 接入 home tenant（🔴 遗漏 1 + 遗漏 2 依据，§4.x）**：二者 join `sys_role_menu` / `sys_user_role` 当前**无** tenant 过滤，登录/刷新(`auth/routes.ts:221-224/:303-306`)与 switch-tenant 调用。须内部按 `userId` 取 `sys_user.tenant_id`(homeTenant) 加 `tenantEq(sysRoleMenu.tenantId, homeTenant)` / `tenantEq(sysUserRole.tenantId, homeTenant)`，**不**用 token 当前 tenantId。否则超管/平台运营角色切租户后 perms 丢失或跨租户泄漏。
- [ ] **`findMenuOptions`（角色分配菜单下拉，`menu/queries.ts:133`）接入 tenant 交集（🟡 遗漏 3）**：当前仅按 `deleteTime`/`type`/`scope` 过滤，无 `sys_tenant_menu` 交集。须加 `tenantId` 入参；当 `tenantId !== 0`（非平台）时 `innerJoin(sysTenantMenu, and(eq(sysTenantMenu.menuId, sysMenu.id), eq(sysTenantMenu.tenantId, tenantId)))`，对齐 Java `listMenuOptions`（非平台租户下拉限定在本租户可用菜单内）；平台(0) 不交集（全菜单）。调用点（角色管理页分配菜单）传被编辑角色的 tenant。
- [ ] **`findMenusByRoleCodes` 改造为「租户可用菜单交集」版（🔴#1 多租户核心，对应 Java `getMenusByRoleCodesAndTenant`）**：当前该函数仅 join `sys_role_menu` 拼角色菜单（`queries.ts:49-91`），**未**与 `sys_tenant_menu` 求交集。须改造为 `sys_role_menu` ∩ `sys_tenant_menu(tenantId)`（`innerJoin(sysTenantMenu, and(eq(sysTenantMenu.menuId, sysMenu.id), eq(sysTenantMenu.tenantId, tenantId)))`），使「租户只能看到套餐授权的菜单子集」。否则 §3.3 seed 的 `sys_tenant_menu` 变死数据、套餐限制菜单功能不生效。
- [ ] **`audit-log` plugin 改造**：`getUser` 增加取 `tenantId`；`buildEntry` 写入 `sys_oper_log.tenant_id = ctx.user.tenantId`（oper_log 已加列，漏写会默认归平台租户 0 或 notNull 报错）
- [ ] **`buildDataScopeContext` 改造**：签名增加 `tenantId` 入参；内部查 `sys_user.deptId` 加 `tenantEq(sysUser, tenantId)` 防御（userId 虽全局唯一不会跨租户命中，语义上收紧更安全）
- [ ] 历史/事件表（oper_log / login_log）insert 在 queries 层**显式传 `tenantId`**，不依赖库 `default(0)`，避免漏传静默归 0
- [ ] 租户管理模块（tenant/tenant-plan）**不**加过滤
- [ ] ⛔ **门禁（本步硬卡）**：完成即当跑跨租户隔离单测——seed 租户 0 与租户 1 数据，断言 tenant 0 的查询**看不到** tenant 1 行，**逐场景覆盖**：
  - **列表类**：user/role/dept/notice/userNotice 逐一验证；
  - **fan-out 场景**：租户 0 发布一条公告后，断言 `sys_user_notice` 仅含租户 0 用户记录；租户 1 用户查询"我的通知"看不到租户 0 的公告；
  - **菜单树泄漏（最隐蔽，第四轮 review B）**：租户 0/1 各建**同名角色**并绑定**不同菜单**，断言各自的 `findMenusByRoleCodes` 菜单树**不含**对方租户绑定的菜单 ID——`sys_role_menu` 加 tenant_id 后必须 `tenantEq(sysRoleMenu, tenantId)`，否则可跨租户透出菜单；`sys_role`/`sys_role_menu`/`sys_role_dept` 的 `findRoles`/`findRoleById`/`findRoleMenuIds`/`findRoleDeptIds` 同理须加 `tenantEq`（第四轮 review E：已确认 `findRoles` 当前仅 `isNull(deleteTime)`+keywords+status，漏 tenant 过滤）；
  - **租户菜单子集（🔴#1 核心，须与上一场景区分）**：`sys_tenant_menu` 平台(0)=全量、`演示(1)=仅 scope=2 业务菜单`；断言对租户 1 ctx 调用改造后的 `findMenusByRoleCodes` 返回的菜单树**只含**其 `sys_tenant_menu` 交集内菜单 ID、**不含**平台管理节点。这验证的是「套餐限制菜单」本身生效，而非仅防跨租户泄漏。
  - **单条查询按 ID 跨租户（第四轮 review C）**：用租户 0 的 ctx 按租户 1 的用户 ID 查 `findUserById`/`findUserFormData`/`findUserProfileDetail`，断言返回空/404（userId 全局唯一实际不命中，但须**显式验证**隔离契约，而非依赖隐式假设）。
  - **认证链权限装载隔离（🔴 遗漏 1 + 遗漏 2）**：seed 租户 0 与租户 1 各一个「平台运营角色」绑定**不同** `sys_role_menu`（如租户 0 绑 `sys:tenant:*`，租户 1 绑 `sys:dept:*`）；断言对租户 0 用户调 `findUserPerms` 返回的是**仅** tenant 0 的 perms（不含租户 1 的 `sys:dept:*`）；并对同一超管用户分别用 homeTenant 与「切到租户 1 的 token.tenantId」跑 `findUserPerms`，断言两次结果**完全相同**（验证 perms 不随 token.tenantId 漂移、§4.x 定案成立）。
  **未通过不得进入 Step 5**，避免泄漏拖到联调才暴露。

### Step 5 · tenant 模块 CRUD（1d）
- [ ] `modules/tenant/{schema,types,errors,routes,queries}.ts`：11 个端点全实现
- [ ] tenant queries 提供 `findActiveTenantById`（存在且 `status=1` 且 `deleteTime IS NULL`），供 `auth/switch-tenant` 与 `tenants/{id}/switch` 状态校验复用（见 Step 2 第四轮 review D）
- [ ] `POST /tenants` 初始化默认数据（建管理员用户 + 角色 + 默认菜单），返回 `TenantCreateResult`
  - **默认菜单来源必须是套餐菜单（🟠 本轮 B，对应 Java `TenantServiceImpl:87/327` `resolveNewTenantAdminMenuIds(planId)`）**：新租户的 `sys_tenant_menu(newId)` 与管理员角色的 `sys_role_menu` 菜单**同源，均取自该租户套餐的 `plan_menu`**（`resolveTenantPlanMenuIds(form.planId)`）；**套餐未配置菜单时兜底为全部业务菜单（`scope=2`）**。切勿实现时拍脑袋给全量或给空——给全量会突破套餐约束、给空则新租户无任何菜单。
- [ ] `/options` `/current` `/{id}/switch` `/{id}/menuIds` `/{id}/menus` `/{id}/status`
- [ ] **每端点权限码（对齐 Java 原版权限码，逐一显式声明 `requirePerm`，勿凭感觉写）**：

  | 端点 | 方法 | requirePerm |
  |---|---|---|
  | `/tenants` | GET | `['sys:tenant:list']` |
  | `/tenants/{id}/form` | GET | `['sys:tenant:update']` |
  | `/tenants/{id}/menuIds` | GET | `['sys:tenant:plan-assign']` |
  | `/tenants` | POST | `['sys:tenant:create']` |
  | `/tenants/{id}` | PUT | `['sys:tenant:update']` |
  | `/tenants/{id}/menus` | PUT | `['sys:tenant:plan-assign']` |
  | `/tenants/{ids}` | DELETE | `['sys:tenant:delete']` |
  | `/tenants/{id}/status` | PUT | `['sys:tenant:change-status']` |
  | `/tenants/options` | GET | 仅 `auth: true`（切换下拉，无独立权限码） |
  | `/tenants/current` | GET | 仅 `auth: true`（任何登录用户取自身租户） |
  | `/tenants/{id}/switch` | POST | 仅 `auth: true` + 超管短路，见 §4（不加 `sys:tenant:switch`） |
- [ ] **平台租户(id=0)硬守卫（必须修复，对齐 Java 原版 DEFAULT_TENANT_ID / PLATFORM_TENANT_ID 保护）**：
  - `DELETE /tenants/{ids}`：若 `ids` 含 `0` → **400**（平台租户不可删）；
  - `PUT /tenants/{id}/status`：若 `id=0 && status=0` → **400**（平台租户不可禁用）。
  - 理由：平台租户是系统运行基础；且本期 JWT **不主动吊销**——若被软删/禁用，已有平台用户 token 仍有效、`tenantId=0` 继续工作，而 `findActiveTenantById` 只拦**新**切换、拦不住已登录会话，故必须在写操作入口硬拒，杜绝误操作。
- [ ] **套餐菜单边界校验（🟡#3，对应 Java `getTenantMenuIds`/`updateTenantMenus`）**：
  - `GET /tenants/{id}/menuIds`：返回 `tenantMenuIds ∩ planMenuIds`（`resolveTenantPlanMenuIds` 取套餐菜单；套餐未配置则兜底全部业务菜单）；
  - `PUT /tenants/{id}/menus`：校验提交的 `menuIds ⊆ 套餐菜单集合`，否则 400「租户菜单只能从套餐菜单中选择」。
- [ ] **平台租户菜单守卫扩展（🟡#4）**：`GET /tenants/{id}/menuIds` 与 `PUT /tenants/{id}/menus` 当 `id=0` 时 → 400「平台租户不支持配置菜单」（Java `:357/:400` `!PLATFORM_TENANT_ID` 断言；平台租户菜单由 `sys_tenant_menu(0)` 全量固定，不接受配置）。
- [ ] **删前用户校验（🟡#5）**：`DELETE /tenants/{ids}` 软删前，若任一目标非平台租户下仍 `userCount>0`，→ 400「租户下存在用户，无法删除」（Java `:589-593`；即便软删，留用户指向已软删租户会使其数据全空，故拦截）。
- [ ] 单测覆盖

### Step 6 · tenant-plan 模块 CRUD（0.5d）
- [ ] `modules/tenant-plan/{schema,types,errors,routes,queries}.ts`：8 个端点
- [ ] **每端点权限码（与 Step 5 同模式，逐一显式声明 `requirePerm`，勿凭感觉写）**：

  | 端点 | 方法 | requirePerm |
  |---|---|---|
  | `/tenant-plans` | GET | `['sys:tenant-plan:list']` |
  | `/tenant-plans/{id}/form` | GET | `['sys:tenant-plan:update']` |
  | `/tenant-plans/{id}/menuIds` | GET | `['sys:tenant-plan:assign']` |
  | `/tenant-plans/options` | GET | `['sys:tenant-plan:list']` |
  | `/tenant-plans` | POST | `['sys:tenant-plan:create']` |
  | `/tenant-plans/{id}` | PUT | `['sys:tenant-plan:update']` |
  | `/tenant-plans/{id}/menus` | PUT | `['sys:tenant-plan:assign']` |
  | `/tenant-plans/{ids}` | DELETE | `['sys:tenant-plan:delete']` |

  全部 `auth: true` + 仅平台运营角色持有这些 perm（天然绕过 tenant 隔离，普通租户用户不可见套餐管理）。**⚠️ `requirePerm` 是 `user.perms.includes(p)` 的 ANY 匹配**（`src/plugins/permission.ts:55`），故**每个端点只声明自身对应的那一枚权限码**，绝不能把 4 码塞进同一数组（否则有任一权限即能访问全部端点，等于无区分）；**非**前缀/通配，不能写 `sys:tenant-plan:*`（该字面量匹配不到真实按钮权限）；`*:*:*` 仅超管通配短路，与此无关。
- [ ] `/options` `/{id}/menuIds` `/{id}/menus`
- [ ] **套餐菜单 `scope=2` 业务菜单校验（🟠 本轮 A，对应 Java `TenantPlanServiceImpl:175-187`）**：`PUT /tenant-plans/{id}/menus` 更新时，校验提交的**所有 `menuId` 必须为业务菜单（`scope=2`）**，否则 400「套餐菜单只能选择业务菜单」。这是**套餐级**上限（限定套餐能纳入哪些菜单），与 Step 5 的**租户级**上限（`menuIds ⊆ 套餐菜单`）是不同层的两道校验，两者都要有。
- [ ] 单测覆盖

### Step 7 · 联调 + 验证（0.5d）
- [ ] `bun run tsc` + `bun run lint` + 全量测试零回归
- [ ] 端到端：开关 `VITE_APP_TENANT_ENABLED=true` 下，前端登录→切租户→业务数据隔离验证
- [ ] 更新 `docs/plan/README.md` 进度看板 + 本文档验收清单

---

## 6. 风险与取舍

| 风险 | 应对 |
|---|---|
| Step 4 改所有 query 易漏 / 易泄漏 | 单测强制断言跨租户不可见；helper 集中一处，避免散落；Step 4 末设硬门禁 |
| 登录无 tenantId 的歧义（改复合唯一后同名跨租户） | **不引入** `(username, tenant_id)` 复合唯一：保持 username 全局唯一，登录按 username 解析、tenantId 取用户所属租户；复合唯一会制造无前端配合的登录歧义（前端登录不发 tenantId） |
| 平台用户是否看跨租户业务数据 | 本期：平台用户仅在本租户(0)上下文；跨租户管理只走 tenant 模块（绕过隔离） |
| `db:push` 给现有表加列需默认值 | `default(0)` + `notNull`，历史数据归平台租户，安全 |
| 字典/菜单共享 vs 租户私有 | 跟原版：共享（平台级），租户仅通过 `sys_tenant_menu` 取子集 |
| 权限缓存 key 是否需 tenant 维度 | **不需** tenant 维度：perms/roles/菜单树一律从用户 home tenant（`sys_user.tenant_id`）装载（§4.x 定案），与 token 当前 tenantId 无关；平台超管切到任意租户 perms 恒不变，`userPerms(userId)` 不冲突。故 `redis-keys.ts` 维持 `userPerms(userId)` 现状，不预留 tenantId 维度 |
| 关联表 PK 是否含 tenantId | 不统一加：对齐原版 `sys_user_role` PK `(userId,roleId)`、`sys_role_menu` PK `(roleId,menuId)` 均不含 tenantId；仅 `sys_role_dept` 扩展为 `(tenantId,roleId,deptId)`（原版唯一索引含 tenant_id） |

---

## 7. 验收清单

- [ ] 所有业务表含 `tenant_id`，查询均按当前租户隔离
- [ ] 跨租户数据不可互见（单测证明）
- [ ] `auth/login` 写 tenantId；`auth/switch-tenant` 重新签发
- [ ] `/tenants` 11 端点 + `/tenant-plans` 8 端点全通，形状对齐前端类型
- [ ] `/tenants/options` `/current` `/{id}/switch` 与前端 store 流程吻合
- [ ] `bun run tsc` + `lint` + 全量测试通过
- [ ] 更新进度看板
