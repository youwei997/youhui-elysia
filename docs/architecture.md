# youhui-elysia · 架构文档

> 一份基于 **Bun + ElysiaJS + Drizzle + PostgreSQL** 的 TS 全栈、函数式优先的现代后台管理框架。

## 1. 设计目标

| 维度 | 选择 | 反对的 |
|---|---|---|
| **范式** | 函数式优先、模块即文件、依赖即闭包 | OOP class 重度、装饰器魔法、DI 容器 |
| **类型** | 端到端类型推导（Elysia + drizzle-orm/zod） | `as any` / `as never` 击穿类型 |
| **抽象层级** | 显式 > 隐式（数据权限是纯函数，不是 SQL 拦截器） | "魔法" 切面 / 元数据反射 / 隐藏控制流 |
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
Auth:         JWT (jose) + Redis 三层失效（tokenVersion + jti + exp）
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
│   │       ├── pagination.ts
│   │       ├── tree.ts           # tree_path 子树查询
│   │       └── data-scope.ts     # ⭐ 数据权限纯函数
│   ├── modules/                  # 业务模块：一个领域 = 三文件
│   │   ├── auth/
│   │   │   ├── schema.ts         # Zod DTO（drizzle-orm/zod 派生）
│   │   │   ├── routes.ts         # Elysia plugin + 路由
│   │   │   └── queries.ts        # 纯函数 CRUD
│   │   ├── user/  role/  menu/  dept/  dict/
│   │   ├── oper-log/  login-log/  online/
│   │   └── job/  storage/  codegen/
│   ├── plugins/                  # 横切关注点 = Elysia plugin
│   │   ├── error-handler.ts      # onError 全局
│   │   ├── response-wrap.ts      # mapResponse 统一壳
│   │   ├── request-context.ts    # reqId + 计时
│   │   ├── auth.ts               # derive ctx.user
│   │   ├── permission.ts         # macro: requirePerm/requireRole
│   │   ├── audit-log.ts          # onAfterHandle 操作日志
│   │   ├── rate-limit.ts
│   │   └── i18n.ts               # Accept-Language → 文案映射
│   ├── lib/
│   │   ├── errors.ts             # 错误码 as const + BizError 工厂
│   │   ├── jwt.ts                # jose 包装 + 三层失效
│   │   ├── cache.ts              # WithCache 防击穿
│   │   ├── crud-dto.ts           # DTO 工厂（list/create/update）
│   │   ├── storage/              # 存储抽象 + drivers
│   │   ├── queue.ts              # pg-boss 包装
│   │   └── logger.ts             # pino
│   ├── codegen/                  # ⭐ 后端代码生成器
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

| 文件 | 职责 | 不准做的事 |
|---|---|---|
| `schema.ts` | Zod DTO 定义（用 `drizzle-orm/zod` 从 Drizzle schema 派生） | 写业务逻辑、写 SQL |
| `queries.ts` | **纯函数** CRUD（输入参数 + db client → 数据） | 触碰 HTTP / Elysia ctx / 抛 HttpError |
| `routes.ts` | Elysia plugin（路由 + 校验 + 权限装饰） + 编排调用 queries | 写复杂业务（拆到 queries 或 lib/） |

### 4.2 横切关注点 = Plugin

不准用：装饰器、AOP、拦截器、Reflector、metadata。
只能用：Elysia 的 `derive` / `resolve` / `macro` / `onError` / `onAfterHandle` / `mapResponse`。

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

| | 请求日志（pino 输出） | 操作日志（业务表） |
|---|---|---|
| 存哪 | 控制台 / 文件 / 日志平台 | 数据库 `sys_oper_log` 表 |
| 内容 | 技术细节：reqId、耗时、stack、SQL 错误 | 业务行为：谁（userId）何时做了何操作（"删除用户 5"） |
| 给谁看 | 后端开发排查 bug | 管理员审计、合规留痕 |
| reqId | **每条都带** | 不带（业务维度，非技术维度） |

操作日志表是阶段 5 才做的事，阶段 3 只做请求日志 + reqId 追踪。

### 4.3 错误处理

- 错误码：**`as const` 字面量联合类型**（不是字符串）
- 业务错误：`BizError` 工厂函数（不是 class 继承）
- `queries` 函数直接返回数据或 `undefined`，HTTP 错误判断放在 routes 层 throw 或 return
- HTTP 抛出：通过 `onError` plugin 统一序列化

### 4.4 数据权限（关键）

**显式 query helper，不是 SQL 拦截器**：

```ts
// ❌ 不要：拦截器自动改 SQL（魔法、隐藏、难调试）
// ✅ 要：显式调用纯函数
const where = and(eq(t.deleted, false), dataScope(ctx, t))
db.select().from(t).where(where)
```

`dataScope(ctx, t)` 是纯函数，根据 `ctx.user.dataScopes` 返回 SQL fragment。

### 4.5 代码风格

- **函数 > class**。仅这些场景允许 class：第三方接口要求、需要 `instanceof` 判别、明确状态机
- **闭包注入依赖 > 类构造器注入**
- **顶层 `const` 导出 > 单例模式**
- **`type` 别名 > `interface`**（除非要扩展第三方）
- **`as const` > 枚举**

## 5. 反例参考（不要做）

来自三项目分析，已确认要避开：

| 反例 | 出处 | 替代 |
|---|---|---|
| `abstract class BaseEntity { ... }` 实体继承 | youlai-nest | Drizzle `auditColumns` 对象 spread |
| `@Permissions("sys:user:create")` 装饰器 + Reflector | youlai-nest | `requirePerm(perm)` Elysia macro |
| `@Module + forwardRef + APP_GUARD` DI 容器 | youlai-nest | 函数闭包 / Elysia decorate |
| `class CreateUserDto { @IsString @ApiProperty ... }` | youlai-nest | Zod schema |
| `ResponseInterceptor` + RxJS Observable | youlai-nest | Elysia `mapResponse` |
| 自建路由表 + `as never` 强转 | elysia-admin | Elysia 原生 `.use(plugin).get(...)` |
| Repository 包装 `CreateQueryBuilder().eq().like()` | elysia-admin | 直接用 Drizzle 链式 API |
| MyBatis 拦截器自动改 SQL（数据权限） | youlai-boot | `dataScope(ctx)` 显式纯函数 |
| 字符串错误码 `"A0001"` | youlai-boot | `as const` 字面量联合 |
| `is_deleted: tinyint` | youlai-boot | `deleted_at: timestamp NULL` |

## 6. 借鉴清单（要抄的）

| 设计 | 出处 | 用途 |
|---|---|---|
| RBAC 8 表结构 | youlai-boot | 完整、生产验证 |
| 菜单三级（C/M/B）+ perm 字符串 | youlai-boot | 一表表达"路由树+按钮+接口权限" |
| 部门 `tree_path` 物化路径 | youlai-boot | 子树查询比 CTE 简单 |
| `data_scope` 5 档枚举 | youlai-boot | ALL/DEPT/DEPT_AND_SUB/SELF/CUSTOM |
| JWT 三层失效（tokenVersion + jti + exp） | youlai-boot/nest | 安全性完整 |
| `sys_log` 表字段设计（IP/UA/耗时） | youlai-boot | 操作日志完整 |
| `sys_dict` + `sys_dict_item` 双表 | youlai-boot | 字典管理标准 |
| `gen_table` + `gen_table_column` 元数据 | youlai-boot | 代码生成器持久化配置 |
| `WithCache` 缓存防击穿（双重检查 + 分布式锁） | elysia-admin | `lib/cache.ts` |
| `drizzle-typebox` + `CrudDto` 工厂 | elysia-admin | DTO 一行派生（本项目改用 `drizzle-orm/zod` 实现 CrudDto） |
| 文件存储 provider 抽象 | youlai-boot/elysia-admin | `lib/storage/` |
| 双调度器思路（本地 cron + 分布式队列） | elysia-admin | 用 pg-boss 实现 |
