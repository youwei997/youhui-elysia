# 阶段 2 · 基础 CRUD（模块三件套范式首秀）

> 难度 ⭐⭐ · 工时 2-3 天 · 学到：Elysia 路由组织、Zod 校验、drizzle-orm/zod、模块三件套
> **不涉及**：鉴权、权限、横切 plugin（先把范式跑通，再上鉴权）

## 目标

把 **"一个领域 = `schema.ts` + `routes.ts` + `queries.ts`"** 的模块范式跑通——以 `user` 模块为样板，端到端实现列表分页/详情/增改删，类型推导端到端不丢，OpenAPI 文档自动生成。

## 前置检查

- [x] 阶段 1 验收全 ✅
- [x]  `db` 客户端可用、`auditColumns` 已就位
- [x]  `bun dev` 可起、OpenAPI 可访问

## 子任务清单

### 2.1 sys_user 表 + seed (0.5d)

`src/db/schema/system/user.ts`：
- 字段：id（serial）/ username / password / nickname / email / phone / gender / status / deptId / avatar / remark + auditColumns
- 索引：username 唯一、deptId
- 软删：`deleteTime`

`scripts/seed.ts`：
- 插入 1 个 admin 用户（密码先用 plain text，反正阶段 3 才接 bcrypt）
- 插入 5-10 个测试用户

`package.json` 加 `db:seed` 脚本。

### 2.2 分页工具（pagination）(0.25d)

`src/db/helpers/pagination.ts`：
- `pageQuerySchema`（zod）：page + pageSize，带默认值和上限
- `PageResult<T>`：list / total / page / pageSize
- **不抽象 `paginate` helper**，各 queries 自己写 count + list 两个查询，等摸清模式后再抽

### 2.3 CrudDto 工厂 (0.5d)

`src/lib/crud-dto.ts`：

参考 elysia-admin 思路，但用 drizzle-orm/zod 简化：
- `createListQuery(table, queryFields?)`：列表查询 DTO（page + pageSize + 业务过滤字段）
- `createInsertDto(table)`：新增 DTO（自动排除 id/审计字段）
- `createUpdateDto(table)`：更新 DTO（全部可选 + id 必填）

**关键**：用 `drizzle-orm/zod` 的 `createInsertSchema` 派生，然后用 `.partial()` / `.extend()` 加工。

### 2.4 user 模块三件套 (1d)

`src/modules/user/schema.ts`：
- import sys_user table + CrudDto 工厂
- 用 CrudDto 工厂派生：`UserListQuery` / `UserCreateBody` / `UserUpdateBody`
- 导出响应类型（敏感字段如 password 用 `z.omit()` 剔除）

`src/modules/user/queries.ts`：
- 纯函数，直接返回数据或 undefined，不包 Result/Ok/Err 容器
- 导出：`findUsers` / `findUserById` / `createUser` / `updateUser` / `softDeleteUser`
- **不准**触碰 Elysia ctx、不准抛 HTTP 错误

`src/modules/user/routes.ts`：
- 导出 `userRoutes = new Elysia({ prefix: '/users' }).get(...).post(...)...`
- 用 `body` / `query` / `params` 选项接 schema 自动校验
- handler 调 queries 函数，包一层 ok response

`src/app.ts`：
- 创建 Elysia 实例，`.use(userRoutes)`
- `src/index.ts` 改为 import app 启动

### 2.5 OpenAPI 完善 (0.5d)

- 在路由上挂 `detail: { tags: ['User'], summary: '...', description: '...' }`
- 验证 Scalar UI 能看到分组、参数、schema、示例
- 给 schema 加 `description` 字段，让生成的文档更友好

## 学习重点

- **Elysia 链式 API**：`.get(path, handler, opts)` 的类型推导是怎么做到的
- **Zod in Elysia**：Zod schema 直接传 `body` / `query` / `params`，框架自动校验 + 自动 OpenAPI
- **drizzle-orm/zod**：从一张 Drizzle 表自动派生 insert schema，一行搞定
- **模块作为 plugin**：`new Elysia({ prefix }).get(...)` 本身就是一个 plugin，`.use()` 即挂载
- **Route schema vs 全局 schema**：开始养成"小颗粒度声明 schema"的习惯

## 避雷

- ❌ 不要在 `routes.ts` 里写 SQL 或复杂业务逻辑，只做编排
- ❌ 不要在 `queries.ts` 里 `import { Elysia }` —— 纯函数和 HTTP 框架解耦
- ❌ 不要把响应壳（`{ code, msg, data }`）硬编码在 handler 里 —— 阶段 3 会用 `mapResponse` 统一处理，这阶段先返回裸数据
- ❌ 不要写 `class UserService` —— 你是函数式优先
- ❌ 不要在 schema 文件里手动复制字段定义 —— 用 `drizzle-orm/zod` 派生
- ⚠️ 列表分页的 `pageSize` 必须有上限（如 100），否则 `?pageSize=99999` 会拖死 DB
- ⚠️ 软删要在所有查询里默认加 `eq(deleteTime, null)`，可考虑在 `queries.ts` 内统一封装

## 验收清单

### 数据
- [x] `sys_user` 表结构正确（含 auditColumns）
- [x] `bun run db:seed` 可重复执行（先清后插）
- [x] `db:studio` 能看到种子数据

### 模块结构
- [x] `modules/user/` 严格三文件：schema.ts / routes.ts / queries.ts
- [x] `queries.ts` 不 import Elysia
- [x] `routes.ts` 不写 SQL（除非是 join 的 select 字段映射）
- [x] `schema.ts` 用 drizzle-orm/zod 派生，不重写字段

### 路由能力
- [x] `GET /users` 列表分页（默认 page=1, pageSize=20）
- [x] `GET /users?page=2&pageSize=5&username=admin` 分页 + 过滤
- [x] `GET /users/:id` 详情，不存在时 404
- [x] `POST /users` 创建，body 校验失败返回 422
- [x] `PUT /users/:id` 更新（部分字段）
- [x] `DELETE /users/:id` 软删（`deleteTime` 被设置，记录还在 DB）
- [x] 删除后再查列表 / 详情都查不到（findUsers/findUserById/updateUser 三处已补 isNull(deleteTime)，见 commit 7eb9bff）

### 类型推导
- [x] handler 内 `body` / `query` / `params` 完整类型推导
- [x] `queries.ts` 的返回值类型可以一路推导到 handler
- [x] 全项目 grep `as any` / `as never` 应当为 0（除了少量真的必要场景）

### OpenAPI
- [x] Scalar UI 能看到 User 分组下所有接口
- [x] 每个接口有 description（5 个路由 handler 均已补 detail.description，见 commit fa5dd51）
- [x] schema 字段有 description，前端读得懂（schema.ts inline refine 全字段 .describe()，见 commit 170a732）
- [x] 在线"试一试"功能可用

### 工具
- [x] `pagination.ts` 已实现（PageResult + pageQuerySchema，位于 db/helpers/）

### 已知 Blockers（需完成才能进阶段 3）
- [x] queries 的 select 查询补 `eq(deleteTime, null)` 过滤（实际用 isNull，改了 3 处：列表/详情/更新，见 commit 7eb9bff）
- [x] OpenAPI 字段补 `.describe()`、路由补 `description`（见 commit fa5dd51 / 170a732）

> ✅ **Blockers 全部清空**（2026-06-14）：软删过滤与 OpenAPI 字段描述均已完成，阶段 2 验收全 ✅，可进阶段 3。

## 完成标志

```bash
bun run db:seed
bun dev
curl http://localhost:3000/users
curl http://localhost:3000/users/1
curl -XPOST http://localhost:3000/users -d '{"username":"new","password":"x"}' -H "Content-Type: application/json"
curl -XPUT http://localhost:3000/users/2 -d '{"nickname":"updated"}' -H "Content-Type: application/json"
curl -XDELETE http://localhost:3000/users/3
# 在 Scalar UI 里能完整玩一遍
```

## 本阶段收获（已完成）

跑通了「schema.ts + queries.ts + routes.ts」三件套范式，端到端类型推导不丢。核心收获：

1. **drizzle-orm/zod 的 refine 必须用箭头函数且参数不能标注 `z.ZodType`**——标注基类会让 `.describe()` 返回基类，整个 schema 退化为 `unknown`，下游 `db.insert().values()` 类型全炸。正确做法是去掉标注让 drizzle 推导成具体子类（如 `z.ZodString`）。
2. **refine 对象不能抽成共享 const**——TS 的反向推导只在对象字面量直接作为函数实参时触发，抽常量会让箭头函数参数退化为 `any`（`noImplicitAny`）。Create/Update 共享描述时只能各 inline 一份。
3. **软删过滤是纪律问题**：按 AGENTS.md 软删规则表，`findUsers`/`findUserById`/`updateUser` 三处必须加 `isNull(deleteTime)`，尤其 `updateUser` 能改活已删记录是隐患。用 `isNull()` 而非 `eq(deleteTime, null)`，Drizzle 推荐写法。

以上两个类型坑详见 `docs/troubleshooting.md`。
