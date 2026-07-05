# 模块能力总览

> 本文档列出后端所有模块及其接口能力，供前端对接、Code Review 参考。
> 接口前缀统一为 `/api/v1`，认证方式：Bearer Token（JWT）。

---

## auth · 认证

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/auth/captcha` | 公开 | 获取图形验证码（验证码 ID + base64 图片） |
| POST | `/auth/login` | 公开 | 用户登录（用户名 + 密码 + 验证码 ID） |
| POST | `/auth/refresh` | 公开 | 刷新 access token（用 refresh token） |
| POST | `/auth/logout` | 登录 | 登出（将当前 jti 加入黑名单） |
| DELETE | `/auth/kick-all` | 登录 | 踢全端下线（递增 tokenVersion） |

**关键设计：**
- JWT 三层失效：`exp`（过期时间）+ `tokenVersion`（改密码/踢全端失效）+ `jti` 黑名单（单 token 注销）
- 登录失败超过 5 次自动入 IP 黑名单

---

## user · 用户

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/users/me` | 登录 | 获取当前用户信息（含角色和权限列表） |
| GET | `/users/profile` | 登录 | 获取个人中心详情（含部门名称、角色名称） |
| PUT | `/users/profile` | 登录 | 更新个人中心资料（昵称/头像/性别，至少填一项） |
| PUT | `/users/password` | 登录 | 修改当前用户密码（旧密码 + 新密码，哈希入库后递增 tokenVersion 使旧 token 失效） |
| POST | `/users/mobile/code` | 登录 | 发送手机验证码（未接入短信服务，直接返回成功） |
| PUT | `/users/mobile` | 登录 | 绑定或更换手机号（需验证当前密码） |
| DELETE | `/users/mobile` | 登录 | 解绑手机号（需验证当前密码） |
| POST | `/users/email/code` | 登录 | 发送邮箱验证码（未接入邮件服务，直接返回成功） |
| PUT | `/users/email` | 登录 | 绑定或更换邮箱（需验证当前密码） |
| DELETE | `/users/email` | 登录 | 解绑邮箱（需验证当前密码） |
| GET | `/users/` | `sys:user:list` | 用户列表（分页，支持关键字/状态/部门过滤，含部门名称和角色名称） |
| GET | `/users/options` | `sys:user:list` | 用户下拉选项（供前端选择器） |
| GET | `/users/:id/form` | `sys:user:list` | 用户表单数据（含已绑定角色 ID 列表） |
| GET | `/users/:id` | `sys:user:list` | 用户详情 |
| POST | `/users/` | `sys:user:create` | 创建用户 |
| PUT | `/users/:id/password/reset` | `sys:user:reset-password` | 管理员重置指定用户密码 |
| PUT | `/users/:id` | `sys:user:update` | 更新用户（部分字段，未传字段保持原值） |
| DELETE | `/users/:id` | `sys:user:delete` | 删除用户（软删，支持单条/批量，批量用逗号分隔 ID） |

---

## role · 角色

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/roles/` | `sys:role:list` | 角色列表（分页） |
| GET | `/roles/options` | `sys:role:list` | 角色下拉选项 |
| GET | `/roles/:id` | `sys:role:list` | 角色详情 |
| GET | `/roles/:id/form` | `sys:role:list` | 角色表单数据（含已绑定部门 ID 列表，仅 CUSTOM dataScope） |
| POST | `/roles/` | `sys:role:create` | 创建角色 |
| PUT | `/roles/:id` | `sys:role:update` | 更新角色 |
| DELETE | `/roles/:id` | `sys:role:delete` | 删除角色（软删，支持批量） |
| GET | `/roles/:id/menu-ids` | `sys:role:list` | 查询角色已绑定的菜单 ID 列表 |
| GET | `/roles/:id/dept-ids` | `sys:role:list` | 查询角色已绑定的部门 ID 列表（仅 CUSTOM dataScope） |
| PUT | `/roles/:id/menus` | `sys:role:authorize` | 绑定角色菜单 |
| PUT | `/roles/:id/depts` | `sys:role:authorize` | 绑定角色部门（仅 CUSTOM dataScope） |

---

## dept · 部门

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/depts/tree` | `sys:dept:list` | 获取部门树形列表 |
| GET | `/depts/options` | `sys:dept:list` | 部门下拉选项 |
| GET | `/depts/:id` | `sys:dept:list` | 获取部门详情 |
| GET | `/depts/:id/form` | `sys:dept:list` | 获取部门表单数据 |
| POST | `/depts/` | `sys:dept:create` | 创建部门（treePath 由服务端根据 parentId 自动计算） |
| PUT | `/depts/:id` | `sys:dept:update` | 更新部门（parentId 变更时自动重算 treePath，级联更新子树） |
| DELETE | `/depts/:id` | `sys:dept:delete` | 删除部门（级联软删子部门，支持批量，逗号分隔 ID） |

**关键设计：**
- treePath 物化路径：`父节点 treePath + "," + 父节点 ID`，用于高效子树查询
- 级联软删：删除部门时自动删除所有子部门

---

## menu · 菜单

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/menus/my-tree` | 登录 | 当前用户菜单树 + 权限列表（用于前端动态路由） |
| GET | `/menus/routes` | 登录 | 当前用户路由列表（不含按钮，仅目录和菜单） |
| GET | `/menus/tree` | `sys:menu:list` | 菜单树形列表（含按钮） |
| GET | `/menus/options` | `sys:menu:list` | 菜单下拉选项 |
| GET | `/menus/:id/form` | `sys:menu:list` | 获取菜单表单数据 |
| POST | `/menus/` | `sys:menu:create` | 创建菜单（treePath 由服务端根据 parentId 自动计算） |
| PUT | `/menus/:id` | `sys:menu:update` | 更新菜单（parentId 变更时重算 treePath，级联更新子树） |
| DELETE | `/menus/:id` | `sys:menu:delete` | 删除菜单（级联软删子菜单，支持批量） |

**关键设计：**
- `/menus/my-tree` 返回 `{ menuTree, perms }`，供前端动态路由和 v-permission 使用
- 目录/菜单/按钮三级，type=按钮时 parentId 必填（Zod + routes 双重校验）

---

## oper-log · 操作日志

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/oper-logs/` | `sys:oper-log:query` | 操作日志列表（分页，支持 username/module/status/时间范围搜索） |
| DELETE | `/oper-logs/:id` | `sys:oper-log:delete` | 删除操作日志（硬删） |
| POST | `/oper-logs/batch-delete` | `sys:oper-log:delete` | 批量清理操作日志（按 createTime < beforeTime 删除） |

**关键设计：**
- 物理删除（不走软删，定时任务批量清理）
- password/token 等敏感字段自动脱敏
- 大 body 截断（超过 4KB 截断 + `"...truncated"` 标记）
- 异步落库（`setImmediate`，不阻塞响应）

---

## login-log · 登录日志

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/login-logs/` | `sys:login-log:query` | 登录日志列表（分页） |

---

## online · 在线用户

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/online/` | `sys:online-user:query` | 在线用户列表 |
| DELETE | `/online/:userId` | `sys:online-user:force-logout` | 强制下线（递增 tokenVersion 使旧 token 失效） |

---

## dict · 字典

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/dicts/` | `sys:dict:list` | 字典类型列表（分页） |
| GET | `/dicts/options` | `sys:dict:list` | 字典类型下拉列表 |
| GET | `/dicts/:id` | `sys:dict:list` | 字典类型详情 |
| GET | `/dicts/:id/form` | `sys:dict:list` | 字典类型表单数据 |
| POST | `/dicts/` | `sys:dict:create` | 创建字典类型 |
| PUT | `/dicts/:id` | `sys:dict:update` | 更新字典类型 |
| DELETE | `/dicts/:id` | `sys:dict:delete` | 删除字典类型（级联软删字典项） |
| GET | `/dicts/:id/items` | `sys:dict:list` | 字典项列表（分页） |
| GET | `/dicts/items/options` | 登录 | 字典项下拉列表（按 type 查询） |
| GET | `/dicts/items/:id/items/options` | 登录 | 字典项下拉列表（按字典项 ID 查询） |
| GET | `/dicts/:id/items/:itemId/form` | `sys:dict:list` | 字典项表单数据 |
| POST | `/dicts/:id/items` | `sys:dict:create` | 新增字典项（parentId=0） |
| PUT | `/dicts/:id/items/:itemId` | `sys:dict:update` | 更新字典项 |
| DELETE | `/dicts/:id/items/:itemId` | `sys:dict:delete` | 删除字典项（软删，支持批量） |
| GET | `/dicts/:type/items` | 登录 | 按字典类型获取字典项（用于前端标签颜色解码） |

**关键设计：**
- Cache-Aside 旁路缓存：withCache 双重检查锁防缓存击穿，写操作主动失效

---

## storage · 文件存储

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/files` | 登录 | 上传文件（multipart/form-data，返回文件 URL） |
| DELETE | `/files` | 登录 | 删除文件（query: `filePath`，同步删除存储侧文件） |

**关键设计：**
- Storage 存储抽象：`Storage` 接口 + `createStorage` 工厂，通过 env 切换 driver
- local-fs driver：文件存本地 `./uploads/`，路径穿越防护（`path.resolve` + 前缀校验）
- 文件元数据登记到 `sys_file` 表

---

## ip-blacklist · IP 黑名单

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/ip-blacklist/` | `sys:ip-blacklist:query` | IP 黑名单列表（分页） |
| POST | `/ip-blacklist/` | `sys:ip-blacklist:create` | 添加 IP 到黑名单 |
| DELETE | `/ip-blacklist/:id` | `sys:ip-blacklist:delete` | 移出黑名单（软删） |

**关键设计：**
- 全局 IP 黑名单 plugin：onRequest 阶段检查，命中直接 403
- 登录失败超过 5 次自动入黑名单

---

## 公共查询参数

列表类接口统一支持以下分页参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| pageNum | number | 1 | 页码 |
| pageSize | number | 10 | 每页条数（最大 100） |

---

## 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

错误码定义见 `src/lib/errors.ts`。
