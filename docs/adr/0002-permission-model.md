# ADR-0002 权限模型设计

- **状态**: 已接受
- **日期**: 2026-06-29
- **阶段**: 阶段 4 完成后

## 背景

阶段 4 实现了完整的 RBAC + 数据权限体系，涉及多个设计决策需要记录，包括：接口权限校验方式、数据权限实现策略、超管短路逻辑、多角色聚合策略、角色变更生效机制。

## 决策

### 1. 接口权限：显式 Elysia macro，不使用 SQL 拦截器

路由通过 `perm` macro 声明所需权限编码（如 `perm: 'sys:user:create'`），permission plugin 在 `beforeHandle` 阶段校验 JWT 中的 `perms` 数组是否包含所需权限。

**实现位置**: `src/plugins/permission.ts`

```ts
// 路由声明
.post('/users', handler, { perm: ['sys:user:create'] })

// plugin 校验（beforeHandle）
const hasPerm = requiredPerms.some((p) => user.perms.includes(p));
if (!hasPerm) throw forbidden();
```

### 2. 数据权限：显式 query helper，不使用 SQL 拦截器

每个列表查询主动调用 `dataScopeFilter(ctx, tables)` 拼接 WHERE 条件，不使用 MyBatis 拦截器风格的全局 SQL 改写。

**实现位置**: `src/db/helpers/data-scope.ts`

```ts
const where = and(
  isNull(sysUser.deleteTime),
  dataScopeFilter(ctx, { user: sysUser, dept: sysDept }),
);
```

### 3. 超管短路：roles + perms 双层判断

两种条件任一满足即跳过所有权限校验：

| 条件 | 值 | 来源 |
|---|---|---|
| `roles.includes("ROOT")` | 角色编码 | JWT payload |
| `perms.includes("*:*:*")` | 通配权限 | JWT payload（防御性兜底） |

ROOT 角色按约定不绑定菜单（perms 为空），必须靠 roles 判断，否则会被 perm macro 误判为无权限。

### 4. 多角色聚合：取并集（OR 语义）

同一用户有多个角色时：
- **接口权限**：用户 perms 是所有角色权限的并集（登录时合并），包含任一即放行
- **数据权限**：多角色 dataScope 取并集（OR 拼接），任一角色 ALL 则短路为不限

```ts
// 数据权限：admin(ALL) + staff(SELF) = ALL（短路，不限）
if (ctx.scopes.some((s) => s.scope === DATA_SCOPE.ALL)) return undefined;
```

### 5. 角色变更生效策略：tokenVersion + 1

角色/权限变更后，通过 `tokenVersion + 1` 强制用户重新登录：

1. 管理员修改角色菜单/数据权限绑定
2. 触发 `tokenVersion + 1` 写入 sys_user 表
3. Redis 中 `auth:user:{id}:tokenVersion` 更新
4. 用户下次请求时 token 中的 version 与 Redis 不匹配 → 401
5. 用户重新登录获取最新 perms / roles / dataScopes

**perms 不做实时查库**，全部来自 JWT payload。理由：
- 列表接口高频调用，实时查库链路长（user → role → role_menu → menu）
- 角色变更频率极低，重新登录成本可接受
- 避免缓存一致性问题

## 理由

### 显式 > 隐式

1. **可调试**：每个路由的权限需求一目了然（`perm: 'sys:user:create'`），出问题时能快速定位
2. **类型友好**：macro 参数有明确类型，IDE 自动补全和检查
3. **无魔法**：SQL 拦截器在运行时静默改写 SQL，调试时看不到"谁改了什么条件"
4. **可测试**：纯函数 + 宏组合，单元测试直接验证，不需要启动完整请求链路

### dataScopeFilter 纯函数

1. **输入明确**：ctx + tables → SQL | undefined，无副作用
2. **不查表、不抛 HTTP 错**：符合 queries 层职责边界
3. **边界降级**：deptId/treePath 为 null 时返回 `1=0`（零结果），不抛错
4. **可测试**：8 个单测覆盖 5 档 + 边界场景

## 反对方案

### 方案 B：MyBatis 拦截器风格

参考 youlai-boot 的 `@DataScope` 注解 + MyBatis 拦截器自动改写 SQL。

- 优点：每个 mapper 方法加注解即可，不用手动拼 WHERE
- 缺点：魔法行为（运行时改写 SQL 难调试）、类型不友好（注解参数是字符串）、与 Drizzle 链式 API 不兼容
- 否决理由：与项目"函数式优先 + 显式 > 隐式"的核心原则冲突

### 方案 C：装饰器 + 元数据

参考 youlai-nest 的 `@RequiresPermissions` + 反射元数据。

- 缺点：需要 `reflect-metadata`、`class-validator` 等装饰器生态依赖
- 否决理由：AGENTS.md 明确禁止 `reflect-metadata` 和装饰器风格

### 方案 D：perms 实时查库

每次请求从数据库查用户权限，不依赖 JWT 缓存。

- 优点：角色变更立即生效，无需重新登录
- 缺点：每次请求多 2-3 次 SQL 查询（高频接口性能差）、需要 Redis 缓存 + 失效策略（复杂度上升）
- 否决理由：角色变更频率极低，重新登录成本可接受，第一版不追求实时性

## 后果

- **每个需要权限校验的路由**必须显式声明 `perm` macro，遗漏时接口无权限保护（靠 code review 兜底）
- **每个需要数据权限的列表查询**必须主动调用 `dataScopeFilter`，遗漏时返回全量数据（靠约定 + code review）
- **角色变更后用户需重新登录**才能看到新权限，tokenVersion+1 机制保证旧 token 失效
- **前端 v-permission 指令**依赖 `/menus/my-tree` 返回的 perms 列表，与后端 perm macro 使用同一套权限编码（`sys:xxx:yyy` 格式）
