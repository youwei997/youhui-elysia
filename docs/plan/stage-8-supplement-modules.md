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
- 导入校验：用户名和密码必填，超长跳过；重复用户名由 DB 唯一约束报错（`A0403`）；非法行不中断整体导入，收集到 `messageList`

**验收**：
- [x] 模板下载可用 Excel 打开，字段与 `UserForm` 对应
- [x] 导出遵循当前查询参数（keywords/status/deptId）
- [x] 导入返回 `validCount`/`invalidCount`/`messageList`，非法行不中断整体导入
- [x] `bun run check` + `bun run tsc` 通过

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
- `withCache` ❌ 不接入——6 个接口均为管理端 CRUD（有 auth+perm），低频操作不值得缓存层；`PUT /configs/refresh` 保留作前端契约占位，当前为 no-op

**验收**：
- [x] 5 个 CRUD 接口 + 1 个刷新接口对齐前端契约
- [x] configKey 唯一性冲突返回 `A0481`
- [x] `bun run check` + `bun run tsc` 通过
- [x] 单测 `config.test.ts` 5 例 PASS
- [x] 种子数据：菜单 260 + 按钮 2601-2604，已挂 ADMIN 角色

---

### 8.4 通知公告 (sys_notice + sys_user_notice) ⬜ 未开始

**前端契约**（`src/api/system/notice/`），比 8.3 复杂，多一层状态机 + 用户关联表：
- `GET /notices`：分页（支持 `title`/`publishStatus`/`isRead` 过滤）
- `GET /notices/:id/form`：表单数据
- `POST /notices`：新增
- `PUT /notices/:id`：更新
- `DELETE /notices/:ids`：批量删除（逗号分隔）
- `PUT /notices/:id/publish`：发布（状态机：草稿→已发布）
- `PUT /notices/:id/revoke`：撤回（已发布→已撤回）
- `GET /notices/:id/detail`：查看详情
- `PUT /notices/read-all`：全部已读
- `GET /notices/my`：我的通知分页

**表结构（草案）**：
- `sys_notice`：公告本体，`status`（0 草稿 / 1 已发布 / 2 已撤回）+ `type` + `level` + `targetType` + `targetUsers` + `auditColumns`
- `sys_user_notice`：用户已读关联表（`userId` + `noticeId` + `readTime`）

**待确认（实现前先过 brainstorming）**：
- `发布`/`撤回` 是否需要写操作日志（涉及状态机变更，审计意义大）
- `targetType=全部` 时是否需要为每个用户写一条 `sys_user_notice`，还是查询时按"未读记录不存在即视为未读"处理（后者更省写入，但要注意历史用户/新增用户的语义一致性）
- `read-all` 的"全部"范围：当前用户可见的全部通知，还是只针对某次分页结果

**验收**：
- [ ] 状态机三态（草稿/已发布/已撤回）流转正确，非法流转（如撤回草稿）拒绝
- [ ] `read-all` 与详情查看（`GET /:id/detail`）都能正确置已读
- [ ] `GET /notices/my` 只返回当前用户可见范围
- [ ] `bun run check` + `bun run tsc` 通过

---

## 验收清单（本阶段总览）

- [x] 8.1 个人中心
- [x] 8.2 用户导入导出
- [x] 8.3 系统配置
- [ ] 8.4 通知公告

## 本阶段收获（完成后填写）
