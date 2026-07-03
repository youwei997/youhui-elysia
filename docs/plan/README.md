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

> 状态标记：⬜ 未开始 · 🟡 进行中 · ✅ 已完成 · ⚠️ 受阻

## 待办清单

> 阶段 5 已完成 6/7 子任务（5.1-5.4、5.6），仅剩 5.5（pg-boss 定时任务）。
> 仅列大模块。详细分析见 `.analysis/`（不纳入版本管理，没有就说明还没做）。
> 前端不改，缺失全部后端补。youlai-boot 仅作契约参考，技术栈以 ElysiaJS + Bun 为主。

### 阶段 4 遗留 bug（均已修复）

> 详见 `14a1e6e`：descendantsByTreePath LIKE 边界、seed 数据 E2E 矛盾、Menu treePath 级联更新。


### 已实现模块的契约差异
- **dict**：路径参数 dictCode vs id + 缺多个接口
- **log**：路径 `/logs` vs `/oper-logs`+`/login-logs` + 缺 analytics
- **user**：`findUsers` 已返回 deptName / roleNames；仍缺 profile / 导入导出 / 手机邮箱

### 阶段 5 计划内未完成子任务
- 定时任务（pg-boss，阶段 5.5）

### 新增模块（项目从未规划过）
- 个人中心（profile / password / mobile / email）
- 用户导入导出（template / import / export）
- 系统配置（sys_config）
- 通知公告（sys_notice + sys_user_notice）

### 待确认
- **tenant / tenant-plan**：前端有完整模块，受 `tenantEnabled` 开关控制。是否启用待定。

### 不做
- 社交登录（`sys_user_social`）、第三方登录、短信登录

## 核心节奏（按时间顺序）

```
阶段 1 · 地基（纯框架）        →  阶段 2 · 基础 CRUD（业务首秀）
        ↓
阶段 3 · 横切 Plugin（吃透 Elysia）
        ↓
阶段 4 · 权限核心（企业级真起点）→  阶段 5 · 进阶辅助模块（广度补齐）
        ↓
阶段 6 · 代码生成器（毕业作）    →  阶段 7 · 收尾 & 部署
```

每一阶段都使用前一阶段的能力——保证学到的范式立即被检验。

## 学习侧重分布

```
架构设计能力  ████████████████████ 60%
Elysia 范式吃透 █████████ 25%
完整跑通端到端 █████ 15%
```

## 关键风险与应对

| 风险 | 应对 | 状态 |
|---|---|---|
| Elysia 文档/示例少，范式踩坑 | 阶段 3 整段在做范式吃透，不绕开 | — |
| Drizzle 数据权限拼接复杂 | 阶段 4.6 留 1.5d，先做 ALL/SELF 两档再逐步扩展 | ✅ 已化解 |
| 代码生成器易过度工程 | 阶段 6 锁定 6 天硬上限，超时立即砍特性 | — |
| 全职易疲劳 | 每周日强制休息，每周写本周收获 | — |

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
[2026-06-30] 阶段 5.1-5.2 完成。5.1 操作日志：audit-log plugin（onAfterHandle/onError 双采集点 + setImmediate 异步落库 + audit-mask 脱敏截断）+ modules/oper-log 三件套（3 接口），设计决策：物理删除不走软删。5.2 登录日志 + 在线用户：sys_login_log 表 + Redis online:user:{id}（TTL=access token 过期）+ GET /online + DELETE /online/:userId（tokenVersion+1 强制下线）。auth 模块接入登录成功/失败记录。
[2026-06-30] 阶段 5.3a-5.3b 完成。5.3a 字典管理：sys_dict + sys_dict_item 双表 + modules/dict 三件套（10 接口）。5.3b withCache 缓存防击穿：双重检查 + 分布式锁（SET NX EX）+ 写操作主动失效，接入 GET /dicts/:type/items。已知口子：dict 路由用 :id 而非 :dictCode，与前端契约不一致（详见 .analysis/）。
[2026-07-02] 阶段 5.4 完成。5.4 文件存储抽象：Storage 接口（2 方法 put/delete）+ local-fs driver + createStorage 工厂 + sys_file 表 + modules/storage 三件套（POST /files multipart + DELETE /files?filePath=url）。@elysia/static 挂载 ./uploads/ → /uploads/* 静态服务。对齐前端契约（前端不改）。s3 driver 推迟。
[2026-07-02] 阶段 5.6 完成。rateLimit macro（Redis INCR+EXPIRE，触发 429+Retry-After）+ sys_ip_blacklist 表 + modules/ip-blacklist CRUD + 全局 ip-blacklist plugin（onRequest 检查，命中 403）+ 登录失败联动入黑名单（auth/routes.ts 接入 addIpToBlacklist）。app.ts 已注册。
[2026-07-04] 阶段 4/5 契约收尾：`findUsers` 补齐 deptName / roleNames（应用层聚合角色名，避免原生 SQL），各模块类型统一抽到 `types.ts`，删除 `INSERT ... RETURNING` 死代码 guard。更新 AGENTS.md 红线与重构实践保持一致。阶段 5 仍剩 5.5（pg-boss 定时任务）。
```
