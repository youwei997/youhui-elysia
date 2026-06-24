# youhui-elysia · AI 工作规则

> 项目：基于 **Bun + ElysiaJS + Drizzle + PostgreSQL** 的 TS 全栈、函数式优先后台管理框架
> 配套文档：[`docs/architecture.md`](./docs/architecture.md) · 阶段计划：[`docs/plan/`](./docs/plan/)

---

## 🌐 通用约定

- **始终用中文回答**，代码注释、ADR、commit message 全部用中文
- 系统：**Windows**（路径用正斜杠 `/`，shell 命令使用 bash 兼容语法,powershell)
- 生成代码前**先查项目已有约定**（先读 `docs/architecture.md` 和已有模块的写法），不要凭空创造范式
- 不确定的设计决策**主动问**,不要默认猜测后埋雷
- **禁止过度工程**——第一版只追求"对",不追求"快"

---

## 📁 项目结构与模块范式

### 模块三件套（核心约定）

> **一个领域 = `schema.ts` + `routes.ts` + `queries.ts`**

| 文件 | 职责 | 不准做 |
|---|---|---|
| `schema.ts` | Zod DTO 定义（用 `drizzle-orm/zod` 从 Drizzle 表派生） | 写业务、写 SQL |
| `queries.ts` | **纯函数** CRUD（输入 `db` + 参数 → 数据） | 触碰 Elysia ctx、抛 HTTP 错误、`import { Elysia }` |
| `routes.ts` | Elysia plugin（路由 + 校验 + 权限装饰）+ 编排调用 queries | 写 SQL、写复杂业务（拆到 queries 或 lib/） |

### 目录约定

- `src/db/schema/<domain>/` — Drizzle schema（按业务域分文件）
- `src/modules/<domain>/` — 业务模块三件套
- `src/plugins/` — 横切关注点（错误处理 / 响应壳 / 鉴权 / 日志 / i18n / 限流）
- `src/lib/` — 工具与抽象（result / errors / jwt / cache / storage / queue / logger / pagination）
- `src/db/helpers/` — 通用查询工具（tree / data-scope）
- `scripts/` — CLI 脚本（seed / gen）
- **不要**创建 `services/` / `controllers/` / `repositories/` / `interfaces/impl/` 这种 Java 风格目录

### 依赖方向（不可反向）

```
schema.ts → queries.ts → routes.ts
lib/      → 任何
plugins/  → lib/
modules/  → lib/ 和 db/，不依赖 plugins/
```

---

## ⚙️ 编码规则

### 范式：函数式优先

- **优先函数 + 闭包**，禁止 class 重度使用
- **所有函数统一用箭头函数**，不用 `function` 声明
- **箭头函数体规则**：
  - 简单单行直接返回表达式的，允许简写体 `(param) => expression`，如 `(e) => e.path.join(".")`
  - 多行逻辑、含副作用、需要变量声明或早返回的，必须用 `{}` 大括号包裹，如 `(items) => { const result = []; ...; return result; }`
- **仅以下场景允许 class**：第三方库要求、需要 `instanceof` 判别、明确的状态机；其他一律用函数
- **依赖注入用闭包或 Elysia `decorate` / `derive`**，禁止任何形式的 DI 容器、`@Injectable`、reflect-metadata
- **顶层 `const` 导出 > 单例模式**

### 类型安全

- **禁用 `any`**。若必须用，写 `// @ts-expect-error <理由>` 或注释说明
- **禁用 `as any` / `as never`** 击穿类型推导
- **`type` 别名 > `interface`**（除非要扩展第三方库类型）
- **`as const` 字面量联合 > `enum`**
- **所有 `type` 和 `interface` 必须有中文注释**
- 所有函数参数 / 返回值类型显式标注，**禁止依赖隐式推导**作为公共 API
- TS 严格模式开启：`strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`

### 注释规范

- **独立工具函数文件（`lib/` 下）**：必须包含 JSDoc，含 `@param` / `@returns` / 中文功能描述
- **模块内部函数**：仅保留中文功能描述（一句话 doc）
- **复杂逻辑**：行内中文注释解释**为什么**这样写，不解释代码本身做什么
- **变量名达意时不写注释**，达意失败时优先改名而不是补注释

### 可读性

- **禁止难懂的链式 `reduce`**——需要聚合时用 `for...of` + 累加变量，或拆函数
- **避免一行超 100 字符**（biome 已配）
- **避免三元嵌套**：超过一层用 `if/else` 或抽函数
- 优先**早返回（early return）** 替代深嵌套 `if`
- 函数单一职责：**超过 50 行考虑拆**

### 🖥️ 前端响应约定

- **`id` / `parentId` 响应给前端时统一转 `string`**（`bigint` 主键避免 JS 精度丢失）
- **`createTime` / `updateTime` 保留输出**，前端列表和表单需要显示时间
- **`deleteTime` / `treePath` 不输出**（软删时间 + 物化路径不暴露给前端）
- 完整规则见 [`docs/architecture.md` 第 4.6 节](./docs/architecture.md#46-前端响应约定)

---

## 🗄️ 数据库（Drizzle）

- **schema 即 TS 值**，不要把 schema 写成 class
- **所有表必须包含 `auditColumns`**（createTime / updateTime / createdBy / updatedBy / deleteTime）
- **软删用 `deleteTime: timestamp`**，禁用 `is_deleted: boolean`
- **不要写 Repository 包装类**——直接用 Drizzle 链式 API，保留类型推导
- 复杂查询用 SQL fragment（`` sql`...` ``），不要拼字符串
- 事务必须用 `db.transaction(async tx => ...)`，禁止裸调用

### 软删过滤规则

> Drizzle 没有全局查询过滤器，每个查询手动加
> 记忆法：**改已有数据必加、查列表默认加、新增/删本身不加**

| 操作类型 | 例子 | 需 `eq(deleteTime, null)` | 理由 |
|---|---|---|---|
| 修改已有数据 | `updateUser` / 登录校验 / 唯一性校验 | ✅ 必须 | 不能改活已删记录 |
| 列表/详情（普通用户） | `findUsers` / `findUserById` | ✅ 默认加 | 前端不应看到已删数据 |
| 列表/详情（管理员查回收站） | 加 `includeDeleted` 参数 | ⚠️ 由调用方决定 | 数据恢复场景 |
| 纯粹新增 | `createUser` | ❌ 不需要 | 不存在"已删" |
| 设 `deleteTime` | `softDelete` / `restore` | ❌ 不需要 | 自身就是设这个值 |

```ts
const where = and(eq(users.deleteTime, null), eq(users.status, 1))
const list = await db.select().from(users).where(where).limit(20)
```

---

## 🛡️ 错误处理

- **错误码用 `as const` 字面量联合**，按业务域分组（A=认证 / B=用户 / C=权限 / ...）
- **业务错误在 routes 层抛 `BizError`**（工厂函数或 class 二选一，全局统一）
- **`queries` 直接返回数据或 `undefined`**，不包 Result/Ok/Err 容器；HTTP 错误判断放在 routes 层
- **不可预期的错误抛 `Error`**，由 `onError` plugin 统一打日志 + 返回 500
- **绝不**在 catch 后只 `console.log` 然后吞错（`return null` 是禁忌）

```ts
// ✅
if (!user) throw bizError('A0404', '用户不存在', 404)

// ❌
if (!user) throw new Error('user not found')
if (!user) return null  // 静默吞错
```

---

## 🔌 Elysia 范式（关键）

- **横切关注点 = Elysia plugin**（不是装饰器、不是 AOP、不是 Reflector）
- **优先用 `derive` / `resolve` / `macro`** 而不是手动 `onBeforeHandle` 串多个 guard
- **响应壳用 `onAfterHandle`**，不要在每个 handler 里手动包 `{ code, msg, data }`（`mapResponse` 要求返回 `Response` 对象，不适合此场景，详见 troubleshooting）
- **路由声明权限用 macro**：`requirePerm: 'sys:user:create'`，不要写装饰器风格
- **plugin 必须命名**：`new Elysia({ name: 'auth' })` 启用去重
- **路由 detail 必填**：`detail: { tags: [...], summary: '...' }`，让 OpenAPI 文档可读
- **禁止**：`reflect-metadata`、`@Controller` 装饰器、自建路由表 + `as never` 强转

---

## 📝 命名规范

- **变量 / 函数**：camelCase（`findUserById` / `userList`）
- **类型 / 接口**：PascalCase（`type UserListQuery` / `type DataScope`）
- **常量**：UPPER_SNAKE_CASE 仅用于真正的全局常量（`JWT_DEFAULT_TTL`），其他用 `as const` 对象
- **文件名**：kebab-case（`data-scope.ts` / `error-handler.ts`），**禁用** snake_case 和 camelCase 文件名
- **目录名**：lowercase 单词或 kebab-case（`oper-log/`），禁用下划线
- **模块目录名**：单数（`user/` 不是 `users/`）
- **schema 表名**：`snake_case`（PG 惯例：`sys_user`、`sys_role_menu`）
- **Drizzle 表对象名**：camelCase（`sysUser` / `sysRoleMenu`）

---

## 🧱 高内聚 低耦合

- **queries 函数禁止访问全局 store / 单例**——需要 `userId` / `redis` / `db` → 通过参数传入
- **plugin 之间不互相 import**——需要交互通过 ctx
- **不要在 schema.ts 里 import routes.ts / queries.ts**（schema 是底层，被依赖方）
- **lib/ 下的工具不依赖 modules/**（lib 是底层，被依赖方）

---

## 🚫 明确禁止清单

> 快速查阅，具体理由见上文对应章节

| 禁止 | 替代 |
|---|---|
| `class XxxService { @Inject ... }` | 模块导出函数 + 闭包注入依赖 |
| `class Dto { @IsString @ApiProperty }` / `abstract class BaseEntity` | Zod schema + `auditColumns` spread |
| `@Controller` / `@Get` / `@Post` 装饰器 | Elysia 链式 API |
| `is_deleted: tinyint` | `deleteTime: timestamp` |
| 静默 catch（吞错 + return null） | 重抛或转 BizError |
| `process.env.XXX` 直接读 | 走 `src/config/` 的 zod schema |

---

## 🧪 测试

- 测试框架用内置 `bun:test`
- **`lib/` 下所有工具必须有单测**（jwt / cache / data-scope 等）
- queries 推荐写集成测试（用真实 PG，但隔离 schema 或测试库）
- 路由可写少量端到端 smoke test
- **不强制覆盖率目标**，但核心 lib 应 ≥ 90%

---

## 📦 Git 提交

- **commit message 必须中文**，遵循模板：`<类型>: <简述>`
  - 类型：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `perf`
- 单次 commit 聚焦一件事，**不要混合**重构和新功能
- 提交前运行 `bun run check`（biome）+ `bun run typecheck`
- 关键决策同步写入 `docs/adr/`

---

## 🚀 性能（不做过早优化）

- **第一版只追求"对"，不追求"快"**——先有功能再谈优化
- 不主动加缓存，**仅高频查询**（如字典、菜单）走 `withCache`
- 列表分页 `pageSize` 必须有上限（默认 100）
- 不主动加索引，**实测慢查询**才加，加完写理由

---

## 🔧 开发工作流

- 每个阶段开始前**读 `docs/plan/stage-N-*.md`** 的"前置检查"
- 每完成一个子任务**勾选验收清单**
- 阶段全部完成后**让 AI 拿验收清单核对一遍**才进下一阶段
- 关键决策写到 `docs/adr/`（含决策、理由、反对方案、取舍）
- 每完成一阶段更新 `docs/plan/README.md` 进度看板

---

## 📚 重要参考

- 项目架构：[`docs/architecture.md`](./docs/architecture.md)
- 阶段计划：[`docs/plan/`](./docs/plan/)
- 反例参考（不要做）：`docs/architecture.md` 第 5 节
- 借鉴清单（要抄）：`docs/architecture.md` 第 6 节
