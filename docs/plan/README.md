# 项目计划总览

> 节奏：全职 6-8h/天 · 总计 28-33 个工作日 · 由易入难 · 边学边做

## 进度看板

| 阶段 | 难度 | 工时 | 状态 | 文档 |
|---|---|---|---|---|
| 1 · 地基 | ⭐ | 3-4d | ✅ 已完成 | [stage-1-foundation.md](./stage-1-foundation.md) |
| 2 · 基础 CRUD | ⭐⭐ | 2-3d | ✅ 已完成 | [stage-2-basic-crud.md](./stage-2-basic-crud.md) |
| 3 · 横切 Plugin 体系 | ⭐⭐⭐ | 4-5d | ✅ 已完成 | [stage-3-plugins.md](./stage-3-plugins.md) |
| 4 · 权限核心 | ⭐⭐⭐⭐⭐ | 6-7d | ✅ 已完成 | [stage-4-rbac.md](./stage-4-rbac.md) |
| 5 · 进阶辅助模块 | ⭐⭐⭐ | 4-5d | 🟡 进行中 | [stage-5-modules.md](./stage-5-modules.md) |
| 6 · 代码生成器 | ⭐⭐⭐⭐ | 5-6d | ⬜ 未开始 | [stage-6-codegen.md](./stage-6-codegen.md) |
| 7 · 收尾 & 部署 | ⭐ | 2-3d | ⬜ 未开始 | [stage-7-deploy.md](./stage-7-deploy.md) |

> ## 已识别但未列入阶段计划的模块
> (来自 youlai-boot 的 `sql/youlai-admin.sql`，项目初期未注册)
> 
> - **`sys_config`** — 系统配置(键值对)。1 个表 + CRUD。`vue3-element-admin-v4.6.0` 前端有 `src/api/system/config`。**如不急可跳过**，前端不依赖此接口开菜单。
> - **`sys_notice`** — 通知公告。2 个表(`sys_notice` + `sys_user_notice`)。`vue3-element-admin-v4.6.0` 前端有完整 CRUD + 发布/撤回/已读。**侧边菜单有入口，点进去就报 C0113(接口不存在)**。
> - **`sys_user_notice`** — 用户-通知关联(已读状态)。依赖 `sys_notice`。
> 
> 社交(`sys_user_social`)、第三方登录 — 不做ocial`)、第三方登录 — 不做。"]
| 7 · 收尾 & 部署 | ⭐ | 2-3d | ⬜ 未开始 | [stage-7-deploy.md](./stage-7-deploy.md) |

> 状态标记：⬜ 未开始 · 🟡 进行中 · ✅ 已完成 · ⚠️ 受阻

## 核心节奏

```
地基(纯框架)  →  基础 CRUD(业务首秀)  →  横切 plugin(吃透 Elysia)
   ↓                                            ↓
权限核心(企业级真起点)  ←  进阶辅助模块(广度)  ←
   ↓
代码生成器(毕业作)  →  收尾 & 部署
```

每一阶段都使用前一阶段的能力——保证学到的范式立即被检验。

## 学习侧重分布

```
架构设计能力  ████████████████████ 60%
Elysia 范式吃透 █████████ 25%
完整跑通端到端 █████ 15%
```

## 关键风险与应对

| 风险 | 应对 |
|---|---|
| Elysia 文档/示例少，范式踩坑 | 阶段 3 整段在做范式吃透，不绕开 |
| Drizzle 数据权限拼接复杂 | 阶段 4.6 留 1.5d，先做 ALL/SELF 两档，DEPT 树查询单独验证 |
| 代码生成器易过度工程 | 阶段 6 锁定 6 天硬上限，超时立即砍特性 |
| 全职易疲劳 | 每周日强制休息，每周写本周收获 |

## 如何使用本目录

1. **开干前**：进入对应 stage doc，按"前置检查"确认依赖完成
2. **干活时**：参考"子任务清单"逐项推进，注意"避雷"
3. **完成后**：拿"验收清单"自查或让 AI 核对，全 ✅ 才能进下一阶段
4. **每阶段完成**：在本文档进度看板更新状态、写一句"本阶段收获"

## 进度日志

> 每完成一个阶段，在这里追加一行

```
[2026-06-14] 阶段 1 完成。收获：跑通 Docker + Drizzle + Elysia 地基，建好 config/logger/优雅关停体系，删掉 _smoke 测试表改走真实 user 表验证，验收脚本含 `bun run check` + `bun run tsc`（运行时校验用 `bun run check:dev`）。进入阶段 2 开发。
[2026-06-14] 阶段 2 完成。收获：跑通 user 模块三件套（schema/queries/routes）范式，端到端类型推导不丢。两个核心坑：drizzle-orm/zod 的 refine 箭头函数参数不能标注 z.ZodType（否则 schema 退化为 unknown）、refine 对象不能抽共享 const（否则 noImplicitAny）。软删过滤补齐 findUsers/findUserById/updateUser 三处。进入阶段 3 开发。
[2026-06-17] 阶段 3.1-3.6 完成。3.7 i18n 跳过（理由见 docs/notes/2026-06-17-后端不做i18n.md，参照 youlai 不做）。auth 模块（Bun.password + 三层失效）跑通。queries 函数 db 参数化（为 Drizzle 事务铺垫）。下一步 3.8：user 模块挂 auth: true + OpenAPI Authorization 安全方案。
[2026-06-21] 阶段 4.1 完成。Drizzle 迁移生成 + 6 表建表 + 种子数据（7 角色/3 部门/25 菜单/7 用户/64 关联）。进入 4.2 Role 模块。
[2026-06-22] 阶段 4.2 完成。Role 模块三件套落地（8 路由 + 11 queries 函数），核心：1）软删 4 表事务级联清理（先解绑再软删本体）；2）replaceRoleMenus/Depts 事务换绑模式；3）业务规则在 routes 入口前置校验（queries 保持纯函数）；4）7 个 Role 业务错误码 A0410-A0416。已知口子：改完菜单不踢用户登录态，等 4.5 接入 tokenVersion + 1。进入 4.3 Menu 模块。
[2026-06-23] 阶段 4.3 完成。Menu 模块三件套落地（8 路由 + 10 queries 函数），核心：1）treePath 物化路径自动维护；2）treePath ~ 正则级联软删 + sys_role_menu 事务清理；3）isParentIdCyclic 纯字符串检测防循环；4）type=B perm 必填双保险（Zod refine + routes 防御）；5）/menus/routes 按 ROOT/角色返回前端动态路由树（不含按钮）。已知口子：未返回 perm 列表（前端 v-permission 依赖，等 4.7 合并到 /menus/my-tree）。进入 4.4 Dept 模块。
[2026-06-23] 阶段 4.4 完成。Dept 模块三件套落地（5 路由 + 8 queries 函数），核心：1）treePath 在 insert/update 时自动维护，update 改父部门时事务级联更新子树 treePath；2）treePath 正则匹配级联软删子树 + sys_role_dept 事务清理；3）isParentIdCyclic 防循环 + routes 层前置校验链（父存在→防循环→用户引用）；4）descendantsByTreePath helper 供数据权限使用。docs/notes 补充设计要点笔记。进入 4.5 Permission macro。
[2026-06-28] 阶段 4.5-4.6 完成。4.5 Permission macro：鉴权与权限分离（auth plugin + permission plugin），isSuperUser ROOT/*:*:* 双层短路，perm/requireRole 两个 macro + 6 单测。4.6 dataScope：纯函数 dataScopeFilter（5 档 switch + ALL 短路 + 边界降级）+ 8 单测 + buildDataScopeContext 装配 + GET /users 接入。进入 4.7 菜单树接口。
[2026-06-29] 阶段 4.7-4.8 完成。4.7 新增 GET /menus/my-tree 接口，复用 buildUserMenuTree + JWT perms，返回 { menuTree, perms } 供前端动态路由 + v-permission 使用。同时重构 /routes 接口共享 buildUserMenuTree。4.8 ADR-0002 权限模型文档，记录 5 个设计决策（显式 macro、显式 query helper、超管短路、多角色并集、tokenVersion 生效策略）及反对方案。阶段 4 全部完成，进入阶段 5。
```
