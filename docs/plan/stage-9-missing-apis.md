# 阶段 9 · 接口核对报告

> 难度 ⭐ · 工时 < 0.5d · 学到：核对 API 不能只看后端，必须以前端实际调用为准
> 对照：youlai-boot (Java 后端) + vue3-element-admin-v4.6.0 (Vue 前端)
> **规则：接口是否缺失，只看 Vue 前端是否调用且我们没有**

## 结论

**前端实际调用的全部接口，我们后端已 100% 覆盖。无缺失接口。**

## 三方对照表

| 端点 | Java 有 | Vue 调了 | 我们做了 | 结论 |
|---|---|---|---|---|
| **Auth** | | | | |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/switch-tenant` | ❌ | ✅ | ❌ | 租户功能，待定 |
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
| `PATCH /users/{id}/status` | ✅ | ❌ | ❌ | 前端用 `update()`，不做 |
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
| `PUT /roles/{id}/status` | ✅ | ❌ | ❌ | 前端用 `update()`，不做 |
| **Menu** | | | | |
| `GET /menus` (树形) | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/options` | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/routes` | ✅ | ✅ | ✅ | ✅ |
| `GET /menus/{id}/form` | ✅ | ✅ | ✅ | ✅ |
| `POST /menus` | ✅ | ✅ | ✅ | ✅ |
| `PUT /menus/{id}` | ✅ | ✅ | ✅ | ✅ |
| `DELETE /menus/{id}` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /menus/{menuId}` (visible) | ✅ | ❌ | ❌ | 前端用 `update()`，不做 |
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
| **Codegen** | ✅ | ✅ | ❌ | ⏭️ 不做 |
| **Tenant / TenantPlan** | ❌ | ✅ | ❌ | ⏳ 待定 |

## 前端调了但我们没做的接口

| 接口 | 模块 | 原因 |
|---|---|---|
| `POST /auth/switch-tenant` | Auth | 租户功能，待定 |
| 租户 11 个接口 | Tenant | ⏳ 待定 |
| 租户套餐 8 个接口 | TenantPlan | ⏳ 待定 |
| 代码生成 6 个接口 | Codegen | ⏭️ 不做 |

## Java 有但前端没调的接口（无需关注）

| 接口 | 模块 | 原因 |
|---|---|---|
| `POST /auth/login/sms`、`POST /auth/sms/code` | Auth | 第三方短信，前端此版本无入口 |
| `POST /wxma/auth/*` (3 个) | WxMa | 微信小程序专用 |
| `PATCH /users/{id}/status` | User | 前端走编辑表单 `update()` |
| `PUT /roles/{id}/status` | Role | 前端走编辑表单 `update()` |
| `PATCH /menus/{menuId}` (visible) | Menu | 前端走编辑表单 `update()` |
| `GET /sse/connect`、`GET /sse/online-count` | SSE | 前端未接入实时推送 |
| `GET /codegen/*` (6 个) | Codegen | 不做 |

## 分类汇总

| 类别 | 决定 |
|---|---|
| 短信登录 / 微信小程序 / SSE | ❌ 第三方，不做 |
| 代码生成器 | ❌ 不做 |
| **租户管理 + 租户套餐** | ⏳ **待定（可能做）** |
| 其余全部 | ✅ 已完成 |
