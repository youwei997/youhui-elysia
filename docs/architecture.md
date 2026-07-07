# youhui-elysia · 架构文档

> 一份基于 **Bun + ElysiaJS + Drizzle + PostgreSQL** 的 TS 全栈、函数式优先的现代后台管理框架。

## 1. 设计目标

| 维度         | 选择                                                        | 反对的                                       |
| ------------ | ----------------------------------------------------------- | -------------------------------------------- |
| **范式**     | 函数式优先、模块即文件、依赖即闭包                          | OOP class 重度、装饰器魔法、DI 容器          |
| **类型**     | 端到端类型推导（Elysia + drizzle-orm/zod）                  | `as any` / `as never` 击穿类型               |
| **抽象层级** | 显式 > 隐式（数据权限是纯函数，不是 SQL 拦截器）            | "魔法" 切面 / 元数据反射 / 隐藏控制流        |
| **目录组织** | 按特性分包（`modules/<domain>/{schema,routes,queries}.ts`） | 按层分包（controller/service/mapper 四件套） |

## 2. 技术栈

```
Runtime:      Bun
Framework:    ElysiaJS
ORM:          Drizzle (drizzle-orm + drizzle-kit)
DB:           PostgreSQL  (docker dev / Neon prod)
Cache:        Redis        (docker dev / Redis Cloud Free prod)
Storage:      抽象层 + drivers (local-fs / s3 / 七牛 prod 候选)
Validation:   zod (env + body/query/params 校验，配合 drizzle-orm/zod 从表派生)
Auth:         JWT (jose) + Redis 三层失效（exp + tokenVersion + jti 黑名单）
              - jti 用 `crypto.randomUUID()` v4 UUID，单 token 精准注销
              - tokenVersion 用于批量失效（改密码 / 踢全部端）
Logger:       pino
Queue:        pg-boss (基于 PostgreSQL，零额外组件)
Test:         bun:test
Codegen:      eta 模板引擎 + Drizzle schema 反推
Lint/Format:  biome
Type Export:  Eden Treaty（主） + OpenAPI（备）
```

## 3. 目录结构

```
youhui-elysia/
├── src/
│   ├── index.ts                  # bootstrap + 优雅关停
│   ├── app.ts                    # Elysia 实例装配（plugin + 路由）
│   ├── config/                   # 配置加载（zod 校验 env）
│   ├── db/
│   │   ├── client.ts             # postgres.js + drizzle 客户端
│   │   ├── schema/
│   │   │   ├── _shared.ts        # auditColumns/软删 mixin
│   │   │   ├── system/           # user/role/menu/dept/dict/log/...
│   │   │   ├── codegen/          # gen_table / gen_table_column
│   │   │   └── monitor/          # online/job
│   │   └── helpers/
│   │       ├── tree.ts           # tree_path 子树查询
│   │       └── data-scope.ts     # ⭐ 数据权限纯函数
│   ├── modules/                  # 业务模块：一个领域 = 三文件
│   │   ├── auth/
│   │   │   ├── schema.ts         # Zod DTO（drizzle-orm/zod 派生）
│   │   │   ├── routes.ts         # Elysia plugin + 路由
│   │   │   └── queries.ts        # 纯函数 CRUD
│   │   ├── user/  role/  menu/  dept/  dict/
│   │   ├── oper-log/  online/  ip-blacklist/  storage/
│   │   └── job/  codegen/        # ⬜ 规划中，阶段 5.5 / 阶段 6 尚未建立
│   ├── plugins/                  # 横切关注点 = Elysia plugin
│   │   ├── error-handler.ts      # onError 全局
│   │   ├── response-wrap.ts      # onAfterHandle 统一壳
│   │   ├── request-context.ts    # reqId + 计时
│   │   ├── auth.ts               # derive ctx.user
│   │   ├── permission.ts         # macro: requirePerm/requireRole
│   │   ├── audit-log.ts          # onAfterHandle 操作日志
│   │   └── rate-limit.ts
│   │   # i18n 已跳过，理由见 docs/notes/2026-06-17-后端不做i18n.md
│   ├── lib/
│   │   ├── audit-mask.ts         # 操作日志敏感字段脱敏
│   │   ├── auth-constants.ts     # 登录失败次数/锁定时长等常量
│   │   ├── cache.ts              # withCache 防缓存击穿
│   │   ├── captcha.ts            # 验证码生成校验
│   │   ├── crud-dto.ts           # DTO 工厂（list/create/update）
│   │   ├── errors.ts             # 错误码 as const + BizError class
│   │   ├── jwt.ts                # jose 包装 + 三层失效
│   │   ├── login-lock.ts         # Redis 登录锁定
│   │   ├── logger.ts             # pino
│   │   ├── pagination.ts         # 通用分页 DTO（零 Drizzle）
│   │   ├── password.ts           # 密码哈希（Bun.password）
│   │   ├── redis-keys.ts         # Redis 键规约
│   │   ├── redis.ts              # Redis 客户端包装
│   │   ├── storage/              # 存储抽象 + drivers
│   │   └── test/                 # 单元测试
│   ├── codegen/                  # ⬜ 规划中，阶段 6 尚未建立
│   │   ├── meta-reader.ts        # 从 information_schema 读
│   │   ├── templates/            # eta 模板：schema/routes/queries
│   │   └── generator.ts
│   └── types/
│       └── context.ts            # Elysia ctx 扩展类型
├── scripts/
│   ├── seed.ts
│   └── gen.ts                    # 代码生成器 CLI
├── docs/
│   ├── architecture.md
│   ├── plan/                     # 阶段计划与验收
│   └── adr/                      # 架构决策记录
├── docker-compose.yml            # pg + redis（开发期）
├── drizzle.config.ts
├── biome.json
└── package.json
```

## 4. 核心约定

### 4.1 模块三件套

> **一个领域 = `schema.ts` + `routes.ts` + `queries.ts`**

| 文件         | 职责                                                        | 不准做的事                            |
| ------------ | ----------------------------------------------------------- | ------------------------------------- |
| `schema.ts`  | Zod DTO 定义（用 `drizzle-orm/zod` 从 Drizzle schema 派生） | 写业务逻辑、写 SQL                    |
| `queries.ts` | **纯函数** CRUD（输入参数 + db client → 数据）              | 触碰 HTTP / Elysia ctx / 抛 HttpError |
| `routes.ts`  | Elysia plugin（路由 + 校验 + 权限装饰） + 编排调用 queries  | 写复杂业务（拆到 queries 或 lib/）    |

#### 4.1.1 依赖方向（不可反向）

```
schema.ts → queries.ts → routes.ts
lib/      → 任何
plugins/  → lib/
modules/  → lib/ 和 db/，不依赖 plugins/
```

### 4.2 横切关注点 = Plugin

不准用：装饰器、AOP、拦截器、Reflector、metadata。
只能用：Elysia 的 `derive` / `resolve` / `macro` / `onError` / `onAfterHandle` / `mapResponse`。

**具体规范：**
- **plugin 必须命名**：`new Elysia({ name: 'auth' })` 启用去重，避免同名 plugin 重复挂载。
- **路由 detail 必填**：每个路由必须写 `detail: { tags: [...], summary: '...' }`，保证 OpenAPI 文档可读。
- **优先用 `derive` / `resolve` / `macro`** 注入横切逻辑，而不是手动在 `onBeforeHandle` 串多个 guard。
- **响应壳用 `onAfterHandle`**，不要在每个 handler 里手动包 `{ code, msg, data }`（`mapResponse` 要求返回 `Response` 对象，不适合此场景）。
- **路由声明权限用 macro**：`requirePerm: ['sys:user:create']`，不要写装饰器风格。
- **禁止装饰器、DI 容器等魔法机制**，详见 §4.14 项目红线。

**auth 守卫的 `if (!user) throw` 不能删**：`auth` plugin 用「全局 `derive` 注入可空 `user`（失败返回 `null`，不抛错）+ `auth: true` macro 在 `beforeHandle` 运行时抛 401」两层实现。`beforeHandle` 只做**运行时**拦截，**编译期** `ctx.user` 仍是 `JwtPayload | null`，handler 里必须保留 `if (!user) throw` 做类型收窄（否则 `user.sub` 等报类型错误）。它不是 §4.11 的死代码，禁止以"冗余守卫"为由删除（机制与误删后果见 `docs/notes/2026-07-08-为什么auth守卫的if-user不能删.md`）。

### 4.2.1 请求追踪（reqId）与日志体系

**reqId 是什么**：每次 HTTP 请求进来时临时生成的 uuid（v4），生命周期 = 一次请求从进来到响应发出。**不存任何数据库表**，只挂在内存的 ctx 和 store 上，请求结束即销毁。

**为什么需要它**：一次请求可能打多条日志（收到请求 → 查库 → 校验 → 出错），并发请求的日志会混在一起。带上同一个 reqId，`grep <reqId>` 就能捞出这次请求的全链路日志。错误响应里也返回 reqId，前端把它反馈给用户，后端凭编号直接定位是哪一次、哪一步炸的。

**实现**（`plugin/request-context`）：

```
HTTP 请求进来
  ↓ onRequest：生成 reqId（uuid v4）+ startTime，存到 ctx 和 store
  ↓ handler 跑业务，用 ctx.logger（子 logger，自动带 reqId）打日志
  ↓ 出错？→ error-handler 从 store 读 reqId 塞进错误响应
  ↓ onAfterResponse：打"请求完成"日志（reqId + 耗时 + status）
请求结束，reqId 随 ctx 销毁
```

**⚠️ 区分两类日志，不要混淆**：

|        | 请求日志（pino 输出）                  | 操作日志（业务表）                                   |
| ------ | -------------------------------------- | ---------------------------------------------------- |
| 存哪   | 控制台 / 文件 / 日志平台               | 数据库 `sys_oper_log` 表                             |
| 内容   | 技术细节：reqId、耗时、stack、SQL 错误 | 业务行为：谁（userId）何时做了何操作（"删除用户 5"） |
| 给谁看 | 后端开发排查 bug                       | 管理员审计、合规留痕                                 |
| reqId  | **每条都带**                           | 不带（业务维度，非技术维度）                         |

操作日志表是阶段 5 才做的事，阶段 3 只做请求日志 + reqId 追踪。

### 4.3 错误处理

- 错误码：**`as const` 字面量联合类型**（不是字符串）
- 业务错误：`BizError` **class**（extends Error，因为 `throw` 友好且 `instanceof` 判别清晰）
- `queries` 函数直接返回数据或 `undefined`，**不包 Result/Ok/Err 容器**；HTTP 错误判断放在 routes 层 throw 或 return
- 业务错误抛 `BizError`，不可预期错误抛原生 `Error`；`onError` plugin 统一序列化并返回对应 HTTP 状态码
- **禁止静默吞错**：catch 后只 `console.log` 或 `return null` 是禁忌，必须重抛或转 BizError

```ts
// ✅ 正确：引用 ERR_CODE 常量，与代码风格一致
if (!user) throw new BizError(ERR_CODE.USER_NOT_FOUND, undefined, 404)

// ❌ 错误
if (!user) throw new Error('user not found')  // 未走统一错误处理
if (!user) return null                          // 静默吞错
```

### 4.4 数据权限（关键）

#### 4.4.1 核心原则：显式 helper，不是 SQL 拦截器

```ts
// ❌ 不要：拦截器自动改 SQL（魔法、隐藏、难调试）
// ✅ 要：显式调用纯函数
const where = and(
  eq(t.deleted, false),
  dataScopeFilter(ctx, { user: sysUser, dept: sysDept }),
);
db.select().from(t).where(where);
```

`dataScopeFilter(ctx, tables)` 是纯函数，根据 `ctx.scopes` 返回 SQL fragment；`ctx` 由 routes 层通过 `buildDataScopeContext(...)` 装配（见 `src/db/helpers/data-scope.ts`）。

#### 4.4.2 三层权限全景

每个请求依次经过：

| 层级        | 触发点                                           | 不通过时表现               | 代码位置                   |
| ----------- | ------------------------------------------------ | -------------------------- | -------------------------- |
| 1. 认证     | `auth: true` macro                               | 401 未登录                 | `plugins/auth.ts`          |
| 2. 接口权限 | `requirePerm: [...]` macro                              | 403 权限不足               | `plugins/permission.ts`    |
| 3. 数据权限 | `dataScopeFilter(ctx, tables)` 在 queries 层调用 | 返回过滤后数据（不是错误） | `db/helpers/data-scope.ts` |

perm 管门，dataScope 管桌。多数列表查询两层都有；创建/更新类接口只用 perm。

#### 4.4.3 五档 × ctx 字段对照表（速查）

`DataScopeContext` 由 routes 层调 `buildDataScopeContext(userId, dataScopes, db)` 装配，下表说明每档用到哪些字段：

| dataScope（数值） | 含义           | 用 `ctx.userId` | 用 `ctx.deptId` | 用 `ctx.treePath`（由 deptId 派生） | 用 `ctx.scopes[i].customDeptIds` |
| ----------------- | -------------- | --------------- | --------------- | ----------------------------------- | -------------------------------- |
| 1 = ALL           | 所有数据       | -               | -               | -                                   | -                                |
| 2 = DEPT_AND_SUB  | 部门及子部门   | -               | -（间接派生）   | ✓                                   | -                                |
| 3 = DEPT          | 本部门         | -               | ✓               | -                                   | -                                |
| 4 = SELF          | 本人           | ✓               | -               | -                                   | -                                |
| 5 = CUSTOM        | 自定义部门列表 | -               | -               | -                                   | ✓                                |

**关键认知**：

- **`ctx.deptId` 只被 DEPT 档使用**（DEPT_AND_SUB 通过 treePath 间接用）。其他三档完全不看它。
- **`ctx.deptId` ≠ `sys_user.dept_id` 列**：前者是"当前登录用户属于哪个部门"（运行时值），后者是"被查询的用户属于哪个部门"（DB 列）。两件事都用 `dept_id` 命名但语义不同，详见 `notes/2026-06-24-perm和dataScope不是一回事.md` 末尾"延伸：ctx 字段对照"小节。
- **多角色并集**：`scopes` 是所有角色 scope 的扁平去重数组。任一 ALL（scope=1）短路返回 `undefined`（不加 WHERE）—— admin 即使有 CUSTOM 角色也看全部，安全语义核心。
- **安全降级**：`ctx.deptId = null` + DEPT 档 → `sql\`1=0\``（零结果，不抛错）。超管通常无部门，但 ROOT 是 ALL 短路根本不会到这两档。

#### 4.4.4 ROOT 双层短路

ROOT 角色（`roles.includes("ROOT")`）在 Layer 2 和 Layer 3 各有一个短路点：

- **Layer 2（perm 层）**：`isSuperUser()` 检测到 ROOT → 直接 return，跳过 perm 数组比对（详见 §4.5）
- **Layer 3（dataScope 层）**：`dataScopeFilter` 检测 `scopes.some(s => s.scope === ALL)` → 返回 `undefined`（不加 WHERE）

两个短路缺一不可：只短路 Layer 2 → 数据范围受限；只短路 Layer 3 → perm 卡死连入口都进不去。

### 4.5 超管短路机制

**`isSuperUser()` 判断逻辑**（`plugins/permission.ts`）：

- **ROOT 角色**（`roles.includes("ROOT")`）：按 seed 约定，ROOT 不绑菜单、perms 为空，必须靠 roles 判断 — **当前唯一生效的短路条件**
- **通配符 `*:*:*`**（`perms.includes("*:*:*")`）：RuoYi 体系惯例，表示"所有权限"。
  **当前项目状态**：seed 数据中没有任何角色被赋予此 perm。保留此检查仅作为防御性兜底，防止管理员手动在数据库设置该值后漏放行。

### 4.6 代码风格

- **所有函数统一用箭头函数**，不用 `function` 声明。
- **箭头函数体规则**：
  - 简单单行直接返回表达式的，允许简写体 `(param) => expression`，如 `(e) => e.path.join(".")`。
  - 多行逻辑、含副作用、需要变量声明或早返回的，必须用 `{}` 大括号包裹，如 `(items) => { const result = []; ...; return result; }`。
- **函数 > class**。仅这些场景允许 class：第三方接口要求、需要 `instanceof` 判别、明确状态机
- **闭包注入依赖 > 类构造器注入**
- **顶层 `const` 导出 > 单例模式**
- **`type` 别名 > `interface`**（除非要扩展第三方）
- **`as const` > 枚举**

#### 类型安全

- **禁用 `any`**。若必须用，写 `// @ts-expect-error <理由>` 或注释说明。
- **禁用 `as any` / `as never`** 击穿类型推导。
- **所有 `type` 和 `interface` 必须有中文注释**。
- **所有函数参数 / 返回值类型显式标注**，禁止依赖隐式推导作为公共 API。
- **TS 严格模式开启**：`strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`。

### 4.7 命名规范

| 对象             | 规则                                             | 示例                                    |
| ---------------- | ------------------------------------------------ | --------------------------------------- |
| 变量 / 函数      | camelCase                                        | `findUserById` / `userList`             |
| 类型             | PascalCase                                       | `type UserListQuery` / `type DataScope` |
| 全局常量         | UPPER_SNAKE_CASE；非全局常量优先 `as const` 对象 | `JWT_DEFAULT_TTL`                       |
| 文件名           | kebab-case；禁用 snake_case 和 camelCase         | `data-scope.ts` / `error-handler.ts`    |
| 目录名           | lowercase 单词或 kebab-case；禁用下划线          | `oper-log/`                             |
| 模块目录名       | 单数                                             | `user/` 不是 `users/`                   |
| schema 表名      | snake_case                                       | `sys_user` / `sys_role_menu`            |
| Drizzle 表对象名 | camelCase                                        | `sysUser` / `sysRoleMenu`               |

### 4.8 注释规范

- **独立工具函数文件（`lib/` 下）**：必须包含 JSDoc，含 `@param` / `@returns` / 中文功能描述。
- **模块内部函数**：仅保留中文功能描述（一句话 doc），避免堆砌解释性废话。
- **复杂逻辑**：行内中文注释解释“为什么这样写”，不解释代码本身做什么。
- **变量名达意时不写注释**；达意失败时优先改名，而不是补注释。

### 4.9 可读性

- **禁止难懂的链式 `reduce`**——需要聚合时用 `for...of` + 累加变量，或拆函数。
- **避免一行超 100 字符**（biome 已配置）。
- **避免三元嵌套**：超过一层用 `if/else` 或抽函数。
- **优先早返回（early return）** 替代深嵌套 `if`。
- **函数单一职责**：超过 50 行考虑拆分。

### 4.10 软删过滤规则

Drizzle 没有全局查询过滤器，每个查询必须手动加软删条件。

记忆法：**改已有数据必加、查列表默认加、新增/删本身不加**。

| 操作类型                      | 例子                                 | 需 `eq(deleteTime, null)` | 理由                 |
| ----------------------------- | ------------------------------------ | ------------------------- | -------------------- |
| 修改已有数据                  | `updateUser` / 登录校验 / 唯一性校验 | ✅ 必须                   | 不能改活已删记录     |
| 列表 / 详情（普通用户）       | `findUsers` / `findUserById`         | ✅ 默认加                 | 前端不应看到已删数据 |
| 列表 / 详情（管理员查回收站） | 加 `includeDeleted` 参数             | ⚠️ 由调用方决定           | 数据恢复场景         |
| 纯粹新增                      | `createUser`                         | ❌ 不需要                 | 不存在“已删”         |
| 设 `deleteTime`               | `softDelete` / `restore`             | ❌ 不需要                 | 自身就是操作这个字段 |

示例：

```ts
const where = and(eq(users.deleteTime, null), eq(users.status, 1));
const list = await db.select().from(users).where(where).limit(20);
```

### 4.11 前端响应约定

**所有模块的响应字段统一遵守以下规则：**

| 规则                                 | 说明                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `id` / `parentId` 输出 `string`      | 前端 JS 数字精度有限（大数如 9223372036854775807 会丢精度），后端用 `bigint` 主键时统一 string 化输出                    |
| `createTime` / `updateTime` 保留输出 | 前端列表和表单需要显示时间，响应 schema 原则上不能 omit 这两个字段。例外：菜单树形列表（`MenuResponse`）无需返回时间字段 |
| `deleteTime` 不输出                  | 软删时间不暴露给前端                                                                                                     |
| `treePath` 不输出                    | 物化路径是后端查询用，前端不需要                                                                                         |
| `createdBy` / `updatedBy` 按需保留   | 如果前端展示创建人/更新人则输出，否则 omit                                                                               |

**实现方式：** 在 `schema.ts` 的 `*Response` 中用 `.omit()` 或 `.extend()` 控制输出字段。
`id`/`parentId` 在 routes 层做 `String()` 转换（因为 `buildTree` 等工具需要数字类型，不能在 schema 层直接改）。

### 4.12 Drizzle 数据库规范

- **schema 即 TS 值**，不要把 schema 写成 class。
- **所有表必须包含 `auditColumns`**（createTime / updateTime / createdBy / updatedBy / deleteTime），事件型表可局部复用（详见 docs/notes/2026-06-29-auditColumns-局部复用案例.md）。
- **软删用 `deleteTime: timestamp`**，禁用 `is_deleted: boolean`。
- **不要写 Repository 包装类**——直接用 Drizzle 链式 API，保留类型推导。
- **严禁使用 `sql` 模板或原生 SQL 字符串**拼接业务查询；聚合/子查询/批量关联走 Drizzle 类型安全 API 或应用层逻辑（详见 AGENTS.md §4）。
  例外：`db/helpers/`（tree.ts、data-scope.ts）等结构性 helper 中，Drizzle API 无法表达的 `REPLACE`/正则 `~`/`ILIKE`/`1=0` 短路允许使用 `sql` 模板。
- **事务必须用 `db.transaction(async tx => ...)`**，禁止裸调用。

### 4.13 高内聚 低耦合

- **queries 函数禁止访问全局 store / 单例**——需要 `userId` / `redis` / `db` → 通过参数传入。
- **plugin 之间不互相 import**——需要交互通过 ctx。
- **不要在 schema.ts 里 import routes.ts / queries.ts**（schema 是底层，被依赖方）。
- **lib/ 下的工具不依赖 modules/**（lib 是底层，被依赖方）。

### 4.14 项目红线

以下行为在项目中**严格禁止**，违反即视为架构违规：

- **禁止创建 Java 风格目录**：`services/`、`controllers/`、`repositories/`、`interfaces/`、`impl/` 等。
- **禁止装饰器控制器（`@Controller`/`@Get`/`@Post` 等）**。
- **禁止 DI 容器**：`@Module`、`forwardRef`、`@Injectable`、reflect-metadata。
- **禁止 `class XxxService` 等业务服务类**。
- **禁止 `as any` / `as never`** 击穿类型推导。
- **禁止静默吞错**：catch 后只 `console.log` 或 `return null` 是禁忌，必须重抛或转 BizError。
- **严禁使用 `sql` 模板或原生 SQL 字符串**拼接业务查询（方言耦合，换库即失效），例外见 §4.12。
- **禁止删除 `auth` 守卫的类型收窄**：`auth: true` 路由 handler 顶部的 `if (!user) throw ...` 是 `JwtPayload | null` 收窄成非空的必需手段（`beforeHandle` 只做运行时拦截，不影响编译期类型），**不是死代码**，禁止以"auth 已保证存在"为由删除，详解见 `docs/notes/2026-07-08-为什么auth守卫的if-user不能删.md`。

### 4.15 测试规范

- **测试框架**：内置 `bun:test`。
- **`lib/` 下所有工具必须有单测**（jwt / cache / data-scope 等）。
- **queries 推荐写集成测试**（用真实 PG，隔离 schema 或测试库）。
- **路由可写少量端到端 smoke test**。
- **不强制覆盖率目标，但核心 lib 应 ≥ 90%**。

### 4.16 性能原则

- **第一版只追求"对"，不追求"快"**——先有功能再谈优化。
- **不主动加缓存**，仅高频查询（如字典、菜单）走 `withCache`。
- **列表分页 `pageSize` 必须有上限**（默认 100）。
- **不主动加索引**，**实测慢查询**才加，加完写理由。

## 5. 反例参考（不要做）

来自三项目分析，已确认要避开：

| 反例                                                 | 出处         | 替代                                |
| ---------------------------------------------------- | ------------ | ----------------------------------- |
| `abstract class BaseEntity { ... }` 实体继承         | youlai-nest  | Drizzle `auditColumns` 对象 spread  |
| `@Permissions("sys:user:create")` 装饰器 + Reflector | youlai-nest  | `requirePerm(perm)` Elysia macro    |
| `@Module + forwardRef + APP_GUARD` DI 容器           | youlai-nest  | 函数闭包 / Elysia decorate          |
| `class CreateUserDto { @IsString @ApiProperty ... }` | youlai-nest  | Zod schema                          |
| `ResponseInterceptor` + RxJS Observable              | youlai-nest  | Elysia `mapResponse`                |
| 自建路由表 + `as never` 强转                         | elysia-admin | Elysia 原生 `.use(plugin).get(...)` |
| Repository 包装 `CreateQueryBuilder().eq().like()`   | elysia-admin | 直接用 Drizzle 链式 API             |
| MyBatis 拦截器自动改 SQL（数据权限）                 | youlai-boot  | `dataScope(ctx)` 显式纯函数         |
| 字符串错误码 `"A0001"`                               | youlai-boot  | `as const` 字面量联合               |
| `is_deleted: tinyint`                                | youlai-boot  | `delete_time: timestamp NULL`       |
| `process.env.XXX` 直接读                             | —            | 走 `src/config/` 的 zod schema      |
| `` sql`DATE(...)` `` / 原生 SQL 字符串拼接           | —            | Drizzle 类型安全 API 或应用层聚合（例外见 §4.12） |

## 6. 借鉴清单（要抄的）

| 设计                                          | 出处                     | 用途                                                      |
| --------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| RBAC 8 表结构                                 | youlai-boot              | 完整、生产验证                                            |
| 菜单三级（C/M/B）+ perm 字符串                | youlai-boot              | 一表表达"路由树+按钮+接口权限"                            |
| 部门 `tree_path` 物化路径                     | youlai-boot              | 子树查询比 CTE 简单                                       |
| `data_scope` 5 档枚举                         | youlai-boot              | ALL/DEPT/DEPT_AND_SUB/SELF/CUSTOM                         |
| JWT 三层失效（tokenVersion + jti + exp）      | youlai-boot/nest         | 安全性完整                                                |
| `sys_log` 表字段设计（IP/UA/耗时）            | youlai-boot              | 操作日志完整                                              |
| `sys_dict` + `sys_dict_item` 双表             | youlai-boot              | 字典管理标准                                              |
| `gen_table` + `gen_table_column` 元数据       | youlai-boot              | 代码生成器持久化配置                                      |
| `WithCache` 缓存防击穿（双重检查 + 分布式锁） | elysia-admin             | `lib/cache.ts`                                            |
| `drizzle-typebox` + `CrudDto` 工厂            | elysia-admin             | DTO 一行派生（本项目改用 `drizzle-orm/zod` 实现 CrudDto） |
| 文件存储 provider 抽象                        | youlai-boot/elysia-admin | `lib/storage/`                                            |
| 双调度器思路（本地 cron + 分布式队列）        | elysia-admin             | 用 pg-boss 实现                                           |

## 7. Git 工作流

- 规范见 [`AGENTS.md`](../AGENTS.md) §5。
