# 阶段 8 · 补充模块（计划外新增）

> 难度 ⭐⭐ · 工时按子任务估 · 学到：核对前端契约发现缺口、事后补设计记录
> 定位：前端 `vue3-element-admin-v4.6.0` 有、后端原 7 阶段计划从未规划的模块。

## 目标

把"计划外新增"的模块集中到一份文档管理，避免散落在 `docs/plan/README.md` 的一行清单里、设计过程只留在 commit message 中。

## 前置检查

- [x] 阶段 4/5 核心框架已就绪（复用数据权限、审计日志、模块三件套范式）

## 子任务清单

### 8.1 个人中心 (profile / password / mobile / email) ✅ 已完成

**涉及文件**：复用 `user` 模块，未单独建 `modules/profile/`
- `src/modules/user/schema.ts`：`UserProfileBody` / `PasswordChangeBody` / `MobileUpdateBody` / `EmailUpdateBody` / `PasswordVerifyBody`
- `src/modules/user/queries.ts`：`findUserProfileDetail` / `updateUserProfile` / `updateUserPassword` / `updateUserMobile` / `updateUserEmail`
- `src/modules/user/routes.ts`：9 个路由挂在 `/users` 前缀下

**接口**（详见 `docs/modules.md` user 模块）：
- `GET/PUT /users/profile`
- `PUT /users/password`
- `POST /users/mobile/code`、`PUT /users/mobile`、`DELETE /users/mobile`
- `POST /users/email/code`、`PUT /users/email`、`DELETE /users/email`

**关键设计**：
- 改密码成功后递增 `tokenVersion`，强制旧 token 失效（其他端需重新登录）
- 绑定/解绑手机号、邮箱前必须校验当前密码；短信/邮件服务未接入，验证码接口直接返回成功（占位，等接入三方服务再补真实发送）
- 个人中心详情聚合部门名称、角色名称（两次查询 `Promise.all` 并行）

**验收**：
- [x] `GET/PUT /users/profile` 正确读写，返回部门名/角色名
- [x] `PUT /users/password` 校验旧密码失败返回 401，成功后旧 token 失效
- [x] mobile/email 绑定解绑均需验证密码
- [x] 9 接口单测覆盖（`src/modules/test/user-profile.test.ts`）
- [x] `bun run check` + `bun run tsc` 通过

---

### 8.2 用户导入导出 (template / export / import) ✅ 已完成

**前端契约**（`src/api/system/user/index.ts`）：
- `GET /users/template`：下载导入模板，`responseType: blob`
- `GET /users/export`：按查询参数导出用户列表，`responseType: blob`
- `POST /users/import`：`multipart/form-data` 上传文件，返回 `ExcelResult`

```ts
// 前端 ExcelResult 类型（src/api/common.ts）
interface ExcelResult {
  code: string;
  invalidCount: number;
  validCount: number;
  messageList: string[];
}
```

**涉及文件（已建）**：
- `src/modules/user/queries.ts` 追加 `exportUsers` / `importUsers`
- `src/modules/user/routes.ts` 追加 3 个路由

**早已确认（实现时决策）**：
- Excel 库：`xlsx`（已安装）
- 模板文件：运行时生成
- 导入校验：用户名和密码必填，超长跳过；重复用户名由逐行 insert 感知，写入 `messageList`；非法行不中断整体导入，收集到 `messageList`

**验收**：
- [x] 模板含核心身份字段 7 列（用户名/密码/昵称/性别/手机号/邮箱/状态），部门与角色需导入后界面分配（已知缺口）
- [x] 导出遵循当前查询参数（keywords/status/deptId）
- [x] 导入返回 `validCount`/`invalidCount`/`messageList`，非法行不中断整体导入
- [x] `bun run check` + `bun run tsc` 通过

**前端对齐验证**（参照 `vue3-element-admin-v4.6.0`）：
- 接口契约：3 个接口路径、方法、`responseType: blob` 均与前端 `UserAPI` 一致
- 模板列：7 列与前端 `UserForm` 字段对应（avatar/remark 不导出，前端同样不包含；**dept/role 为已知缺口，见上方验收项**）
- 导出列：8 列覆盖前端 `UserItem` 全部业务字段
- 导入结果：`ExcelResult`（code/validCount/invalidCount/messageList）与前端 `common.ts` 定义完全匹配
- 编码映射：gender（男=1/女=2/空=0）、status（正常=1/禁用=0）前后端一致
- 已知差异：前端文件限制 1MB < 后端 50MB（前端校验更严格，不触发后端限制）；导入用户无部门/角色为设计意图

---

### 8.3 系统配置 (sys_config) ✅ 已完成

**前端契约**（`src/api/system/config/`）：
- `GET /configs`：分页
- `GET /configs/:id/form`：表单数据
- `POST /configs`：新增
- `PUT /configs/:id`：更新
- `DELETE /configs/:id`：删除
- `PUT /configs/refresh`：刷新配置缓存

**表结构（草案）**：`sys_config`
- `id` / `configName` / `configKey`（唯一索引）/ `configValue` / `remark` + `auditColumns`（软删）

**涉及文件（已建）**：`src/db/schema/system/config.ts` + `src/modules/config/{schema,queries,routes,types}.ts` + `src/modules/test/config.test.ts`

**关键设计点**：
- `configKey` 唯一性校验（新增/更新时）✅
- `withCache` ❌ 不接入——6 个接口均为管理端 CRUD（有 auth+perm），低频操作不值得缓存层；`PUT /configs/refresh` 主动清空 `config:*` 缓存 key，因模块未接入 withCache 故当前无缓存可清（等效 no-op，保留作前端契约占位）

**验收**：
- [x] 5 个 CRUD 接口 + 1 个刷新接口对齐前端契约
- [x] configKey 唯一性冲突返回 `A0481`
- [x] `bun run check` + `bun run tsc` 通过
- [x] 单测 `config.test.ts` 5 例 PASS
- [x] 种子数据：菜单 260 + 按钮 2601-2604，已挂 ADMIN 角色

---

### 8.4 通知公告 (sys_notice + sys_user_notice) ✅ 已完成

> 比 8.3 复杂：多一层状态机 + 双表关联 + 发布 fan-out 物化。
> **拆批原则**：任务细颗粒，一个任务只动 2-3 个文件、对应一次聚焦 commit。
> **先做第一批纯 CRUD（草稿态闭环），再做第二批状态机/物化/JOIN。**

**接口清单（10 个，路径与前端一致）**：

| 批次 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 一 | GET | `/notices` | 管理端分页（JOIN sys_user 取 publisherName） |
| 一 | POST | `/notices` | 新增（默认草稿 publishStatus=0） |
| 一 | GET | `/notices/:id/form` | 表单回填 |
| 一 | PUT | `/notices/:id` | 编辑 |
| 一 | DELETE | `/notices/:ids` | 批量删（逗号分隔，连带删 user_notice） |
| 二 | PUT | `/notices/:id/publish` | 发布（事务 fan-out 物化 user_notice） |
| 二 | PUT | `/notices/:id/revoke` | 撤回（删该 notice 的 user_notice） |
| 二 | GET | `/notices/:id/detail` | 详情（顺带置已读） |
| 二 | PUT | `/notices/read-all` | 全部已读 |
| 二 | GET | `/notices/my` | 我的通知（INNER JOIN user_notice，带 isRead） |

**表结构（定稿，参照原 Java 运行时 + 前端实际代码）**：

`sys_notice`：
- `id` / `title` / `content` / `type`(int) / `publisherId`(bigint, 发布时写) / `level`(varchar, L/M/H)
- `targetType`(int, **1=全部 / 2=指定**) / `targetUserIds`(varchar, 逗号串，草稿暂存)
- `publishStatus`(int, **0=草稿 / 1=已发布 / -1=已撤回**) / `publishTime` / `revokeTime`
- `+ auditColumns`（软删）

`sys_user_notice`：
- `id` / `noticeId` / `userId` / `isRead`(int, 0/1) / `readTime` + `auditColumns`（软删）

> **状态码定稿说明**：撤回态用 **`-1`**（前端 `system/notice/index.vue` 实际代码为准：查询下拉、列表标签、按钮显隐判断全用 `-1`；types.ts 注释写 `2` 是错的，忽略）。targetType `1=全部/2=指定`（前端提交逻辑 `targetType === 2 ? targetUsers : []` 佐证）。
>
> **编辑/删除/状态约定**（严格对齐前端 `system/notice/index.vue` 实际发出的请求，非 Java 原版、非 UI 想当然）：
> - **编辑**：前端对已发布行隐藏编辑入口且无批量编辑（`v-if="publishStatus != 1"`）→ 已发布编辑请求永不发出。**后端不设硬守卫**，`updateNotice` 保持纯数据操作（源头已挡，且 `NoticeUpdateBody` 不含 `publishStatus`，无法借编辑改状态）。
> - **删除**：前端行内删对已发布隐藏，但**工具栏批量删的勾选框不限制状态**（无 `:selectable`），已发布可经批量删发出。**后端允许删任意状态**（与 Java 原版一致），软删 + 事务级联软删 `sys_user_notice`。⚠️ 不要加"已发布不可删"守卫——那会打断前端"草稿+已发布混选批量删"这条不可改的合法路径。
> - **状态守卫只在 publish / revoke**（T8）：已发布不可重发（`NOTICE_ALREADY_PUBLISHED`）、仅已发布可撤回（`NOTICE_NOT_PUBLISHED`）；前端按钮显隐已保证不发非法流转，后端守卫为防御式加固，不与任何前端路径冲突。
> - 发布时先清理该 notice 旧的 `sys_user_notice`，再按最新内容和目标用户重新物化。

---

#### 第一批 · 纯 CRUD（草稿态闭环）

- [x] **T1 建表** — `src/db/schema/system/notice.ts`（sysNotice + sysUserNotice 两表同文件）+ drizzle 生成迁移。_文件：schema 1 + 迁移 1_
- [x] **T2 DTO/类型** — `src/modules/notice/schema.ts`（Zod：ListQuery/CreateBody/UpdateBody/Response/ParamsWithId）+ `types.ts`（$inferSelect 派生）。_文件：2_
- [x] **T3 queries** — `src/modules/notice/queries.ts`（findNotices 分页含 publisherName join / findNoticeById / createNotice / updateNotice / batchSoftDeleteNotices）。_文件：1_
- [x] **T4 routes + 注册** — `src/modules/notice/routes.ts`（5 个 CRUD 路由）+ `src/app.ts`（挂 noticeRoutes）。_文件：2_
- [x] **T5 测试** — `src/modules/test/notice.test.ts`（5 CRUD 用例：新增草稿/列表/表单回填/编辑/批量删）。_文件：1_
- [x] **T6 种子 + 菜单** — `scripts/seed.ts`（通知菜单 270 + 按钮 2701-2704，挂 ADMIN）。_文件：1_

**第一批验收**：
- [x] 5 个 CRUD 接口对齐前端契约（路径/方法/字段）
- [x] 新增默认存草稿（publishStatus=0），列表返回 publisherName
- [x] 批量删除逗号分隔，软删；`:ids` 解析健壮
- [x] `bun run check` + `bun run tsc` 通过 + 单测 PASS

---

#### 第二批 · 状态机 + 物化 + JOIN（先过 brainstorming）

> 前置：第一批已合并。动手前用 brainstorming 敲定下面 3 个论点。

**待确认论点**：
- 发布/撤回是否写操作日志（原 Java `@Log` 有标；建议接入阶段 5.1 audit-log plugin）
- `targetType=全部` 落库策略（原 Java：**发布时物化**给每个用户插一条 user_notice；发布后新增用户看不到旧通知，属可接受快照语义，用 `ponytail:` 标天花板）
- `read-all` 范围（原 Java：当前用户所有未读记录 update，与分页无关）

- [x] **T7 发布/撤回 queries** — 发布 fan-out（事务：删旧 user_notice → 按 targetType 捞用户 → 批量插）+ 撤回（改状态 + 删 user_notice）。_文件：queries 1_
- [x] **T8 发布/撤回 routes + 状态机** — 2 路由 + 三态流转校验（已发布不能重发、只有已发布能撤回）+ 错误码。_文件：routes 1（+ errors 1）_
- [x] **T9 已读 queries + routes** — 详情置已读 / read-all / 我的通知 JOIN 查询。_文件：queries 1 + routes 1_
- [x] **T10 第二批测试** — 状态机流转、fan-out 物化、已读、我的通知。_文件：test 1_（随 T7/T8/T9 TDD 流程一并完成，18/18 PASS）

**第二批验收**：
- [x] 状态机三态流转正确，非法流转（如撤回草稿）拒绝
- [x] 发布 fan-out：全部/指定两种 targetType 均正确物化 user_notice
- [x] `read-all` 与详情查看都能正确置已读
- [x] `GET /notices/my` 只返回当前用户可见范围（INNER JOIN + publishStatus=1）
- [x] `bun run check` + `bun run tsc` 通过 + 单测 PASS

**范围外（不做）**：
- SSE 实时推送（原 Java 发布/撤回时 `sseService.sendToUser` 推 notice/notice-revoke）。前端 REST 与 SSE 解耦，无 SSE 通知仍可正常收发，仅缺实时弹窗 + 控制台有连接失败日志。SSE 是横跨 dict 同步/在线数/通知的独立实时体系，另立任务，不并入 8.4。

---

## 验收清单（本阶段总览）

- [x] 8.1 个人中心
- [x] 8.2 用户导入导出
- [x] 8.3 系统配置
- [x] 8.4 通知公告

## 本阶段收获

- 双表设计：sys_notice 存内容与状态机，sys_user_notice 作物化快照（fan-out），职责分离清晰。
- 三态状态机（草稿 0 → 已发布 1 → 已撤回 -1）仅在 publish/revoke 路由设守卫，不在 CRUD 层限制，与前端按钮显隐逻辑配合，避免"已发布混选批量删"被误阻。
- 发布事务：先软删旧 user_notice 快照，再按最新 targetType 重新物化，保证重新发布时一致性。
- 路由顺序是 Elysia 的关键细节：静态路径（`/my`、`/read-all`）必须在动态参数（`/:id`）之前注册。
- T10 随 T7/T8/T9 TDD 流程一并完成，实践了"测试随实现走"而非单独补测试批次的节奏。
