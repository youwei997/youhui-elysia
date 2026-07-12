# 阶段 9 · 接口核对报告

> 难度 ⭐ · 工时 < 0.5d · 学到：核对 API 不能只看后端，必须以前端实际调用为准
> 对照：youlai-boot (Java 后端) + vue3-element-admin-v4.6.0 (Vue 前端)
> **规则：接口是否缺失，只看 Vue 前端是否调用且我们没有**

## 结论

前端实际调用的全部 API 已覆盖。需实现的新模块：

- **SSE**：`GET /sse/connect`（推送 online-count / dict / notice / notice-revoke 事件）
- **租户管理 + 租户套餐**：约 20 个接口（含 `POST /auth/switch-tenant`）

## 三方对照表

| 端点 | Java 有 | Vue 调了 | 我们做了 | 结论 |
|---|---|---|---|---|
| **Auth** | | | | |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/switch-tenant` | ❌ | ✅ | ❌ | 租户功能，要做 |
| `POST /auth/refresh-token` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /auth/logout` | ✅ | ✅ | ✅ | ✅ |
| `GET /auth/captcha` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/login/sms` | ✅ | ❌ | ❌ | 第三方，不做 |
| `POST /auth/sms/code` | ✅ | ❌ | ❌ | 第三方，不做 |
| **User** | | | | |
| `GET /users/me` | ✅ | ✅ | ✅ | ✅ |
| `GET /users` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /users/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /users` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /users/{ids}` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/{id}/password/reset` | ✅ | ✅ | ✅ | ✅ |
| `GET /users/template` | ✅ | ✅ | ✅ | ✅ |
| `GET /users/export` | ✅ | ✅ | ✅ | ✅ |
| `POST /users/import` | ✅ | ✅ | ✅ | ✅ |
| `GET /users/profile` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/profile` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/password` | ✅ | ✅ | ✅ | ✅ |
| `POST /users/mobile/code` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/mobile` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /users/mobile` | ✅ | ✅ | ✅ | ✅ |
| `POST /users/email/code` | ✅ | ✅ | ✅ | ✅ |
| `PUT /users/email` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /users/email` | ✅ | ✅ | ✅ | ✅ |
| `GET /users/options` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /users/{id}/status` | ✅ | ❌ | ❌ | 前端通过 `PUT /users/{id}` 更新状态，不做 |
| **Role** | | | | |
| `GET /roles` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /roles/options` | ✅ | ✅ | ✅ | ✅ |
| `GET /roles/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /roles` | ✅ | ✅ | ✅ | ✅ |
| `PUT /roles/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /roles/{ids}` | ✅ | ✅ | ✅ | ✅ |
| `GET /roles/{id}/menu-ids` | ✅ | ✅ | ✅ | ✅ |
| `PUT /roles/{id}/menus` | ✅ | ✅ | ✅ | ✅ |
| `GET /roles/{id}/dept-ids` | ✅ | ✅ | ✅ | ✅ |
| `PUT /roles/{id}/status` | ✅ | ❌ | ❌ | 前端通过 `PUT /roles/{id}` 更新状态，不做 |
| **Menu** | | | | |
| `GET /menus` (树形) | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/options` | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/routes` | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /menus` | ✅ | ✅ | ✅ | ✅ |
| `PUT /menus/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /menus/{id}` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /menus/{menuId}` (visible) | ✅ | ❌ | ❌ | 前端通过 `PUT /menus/{id}` 更新 visible，不做 |
| **Dept** | | | | |
| `GET /depts` (树形) | ✅ | ✅ | ✅ | ✅ |
| `GET /depts/options` | ✅ | ✅ | ✅ | ✅ |
| `GET /depts/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /depts` | ✅ | ✅ | ✅ | ✅ |
| `PUT /depts/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /depts/{ids}` | ✅ | ✅ | ✅ | ✅ |
| **Dict** | | | | |
| `GET /dicts` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /dicts/options` | ✅ | ✅ | ✅ | ✅ |
| `GET /dicts/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /dicts` | ✅ | ✅ | ✅ | ✅ |
| `PUT /dicts/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /dicts/{ids}` | ✅ | ✅ | ✅ | ✅ |
| `GET /dicts/{dictCode}/items` | ✅ | ✅ | ✅ | ✅ |
| `GET /dicts/{dictCode}/items/options` | ✅ | ✅ | ✅ | ✅ |
| `POST /dicts/{dictCode}/items` | ✅ | ✅ | ✅ | ✅ |
| `GET /dicts/{dictCode}/items/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `PUT /dicts/{dictCode}/items/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /dicts/{dictCode}/items/{ids}` | ✅ | ✅ | ✅ | ✅ |
| **Config** | | | | |
| `GET /configs` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /configs/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /configs` | ✅ | ✅ | ✅ | ✅ |
| `PUT /configs/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /configs/{id}` | ✅ | ✅ | ✅ | ✅ |
| `PUT /configs/refresh` | ✅ | ✅ | ✅ | ✅ |
| **Log** | | | | |
| `GET /logs` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /logs/analytics/trend` | ✅ | ✅ | ✅ | ✅ |
| `GET /logs/analytics/overview` | ✅ | ✅ | ✅ | ✅ |
| **Notice** | | | | |
| `GET /notices` (分页) | ✅ | ✅ | ✅ | ✅ |
| `GET /notices/my` | ✅ | ✅ | ✅ | ✅ |
| `GET /notices/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `GET /notices/{id}/detail` | ✅ | ✅ | ✅ | ✅ |
| `POST /notices` | ✅ | ✅ | ✅ | ✅ |
| `PUT /notices/{id}` | ✅ | ✅ | ✅ | ✅ |
| `PUT /notices/{id}/publish` | ✅ | ✅ | ✅ | ✅ |
| `PUT /notices/{id}/revoke` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /notices/{ids}` | ✅ | ✅ | ✅ | ✅ |
| `PUT /notices/read-all` | ✅ | ✅ | ✅ | ✅ |
| **File** | | | | |
| `POST /files` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /files?filePath=` | ✅ | ✅ | ✅ | ✅ |
| **SSE** | | | | |
| `GET /sse/connect` | ✅ | ✅ (via composable) | ❌ | ✅ 要做（推送 online-count / dict / notice / notice-revoke 事件） |
| **Codegen** | ✅ | ✅ | ❌ | ⏭️ 不做 |
| **Tenant** | ❌ | ✅ | ❌ | ✅ 要做 |
| **TenantPlan** | ❌ | ✅ | ❌ | ✅ 要做 |

## 前端调了但我们没做的接口

| 接口 | 模块 | 原因 |
|---|---|---|
| `POST /auth/switch-tenant` | Auth | 租户功能，要做 |
| `GET /sse/connect` | SSE | ✅ 要做（推送 online-count / dict / notice / notice-revoke 事件） |
| 租户 11 个接口 | Tenant | ✅ 要做 |
| 租户套餐 8 个接口 | TenantPlan | ✅ 要做 |
| 代码生成 6 个接口 | Codegen | ⏭️ 不做 |

## Java 有但前端没调的接口（无需实现）

| 接口 | 模块 | 说明 |
|---|---|---|
| `POST /auth/login/sms`、`POST /auth/sms/code` | Auth | 第三方短信，此版本前端无入口 |
| `POST /wxma/auth/*` (3 个) | WxMa | 微信小程序专用 |
| `PATCH /users/{id}/status` | User | Java 有独立接口，前端通过 `PUT /users/{id}` 编辑表单时一起更新 status，无需独立接口 |
| `PUT /roles/{id}/status` | Role | Java 有独立接口，前端通过 `PUT /roles/{id}` 编辑表单时一起更新 status，无需独立接口 |
| `PATCH /menus/{menuId}` (visible) | Menu | Java 有独立接口，前端通过 `PUT /menus/{id}` 编辑表单时一起更新 visible，无需独立接口 |

## 我们额外做的接口（Java 没有）

| 接口 | 模块 | 说明 |
|---|---|---|
| `GET /depts/{id}` | Dept | 部门详情，前端用 `:id/form` 取同量数据，无独立调用 |
| `GET /dicts/{id}` | Dict | 字典类型详情 |
| `GET /menus/my-tree` | Menu | 菜单树 + 权限列表合一接口 |
| `GET /online` + `DELETE /online/:userId` | Online | 在线用户管理 |
| `GET /ip-blacklist` + `DELETE /ip-blacklist/:id` | IpBlacklist | IP 黑名单管理 |
| `POST /auth/logout-all` | Auth | 全端登出 |

## 分类汇总

| 类别 | 决定 |
|---|---|
| 短信登录 / 微信小程序 | ❌ 第三方，不做 |
| SSE 实时推送 | ✅ 要做 |
| 代码生成器 | ❌ 不做 |
| **租户管理 + 租户套餐** | ✅ **要做** |
| 其余全部 | ✅ 已完成 |
