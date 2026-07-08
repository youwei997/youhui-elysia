# 模块能力总览

> 本文档列出后端所有模块及其接口能力，供前端对接、Code Review 参考。
> 接口前缀统一为 `/api/v1`，认证方式：Bearer Token（JWT）。

---

## auth · 认证

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/auth/captcha` | 公开 | 获取图形验证码（验证码 ID + base64 图片） |
| POST | `/auth/login` | 公开 | 用户登录（用户名 + 密码 + 验证码 ID） |
| POST | `/auth/refresh-token` | 公开 | 刷新 access token（用 refresh token） |
| DELETE | `/auth/logout` | 登录 | 登出（将当前 jti 加入黑名单） |
| POST | `/auth/logout-all` | 登录 | 踢全端下线（递增 tokenVersion） |

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
| GET | `/roles/:id/menu-ids` | `sys:role:assign` | 查询角色已绑定的菜单 ID 列表 |
| GET | `/roles/:id/dept-ids` | `sys:role:assign` | 查询角色已绑定的部门 ID 列表（仅 CUSTOM dataScope） |
| PUT | `/roles/:id/menus` | `sys:role:assign` | 绑定角色菜单 |
| PUT | `/roles/:id/depts` | `sys:role:assign` | 绑定角色部门（仅 CUSTOM dataScope） |

---

## dept · 部门

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/depts/` | `sys:dept:list` | 获取部门树形列表（支持关键字模糊搜索和状态筛选） |
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
| GET | `/menus/` | `sys:menu:list` | 菜单树形列表（含按钮） |
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
| GET | `/logs/` | `sys:oper-log:query` | 操作日志列表（分页，支持关键字/模块/状态/时间范围筛选，按 createTime 倒序） |
| GET | `/logs/analytics/trend` | `sys:oper-log:query` | 访问趋势统计（按日期分组 PV/UV，用于仪表盘折线图） |
| GET | `/logs/analytics/overview` | `sys:oper-log:query` | 访问概览统计（今日/累计 PV UV + 增长率，用于仪表盘概览卡片） |

**关键设计：**
- 物理删除（不走软删，定时任务批量清理，删除接口待实现）
- password/token 等敏感字段自动脱敏
- 大 body 截断（超过 4KB 截断 + `"...truncated"` 标记）
- 异步落库（`setImmediate`，不阻塞响应）
- 响应字段映射到前端 LogItem（actionType/operatorId/operatorName/requestUri/requestMethod/executionTime/region）
- 时间窗口统一 UTC（`getVisitOverview`/`getVisitTrend`/`findOperLogs` 均显式 `Z` 后缀）

---

---

## online · 在线用户

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/online/` | `sys:online:list` | 在线用户列表 |
| DELETE | `/online/:userId` | `sys:online:kick` | 强制下线（递增 tokenVersion 使旧 token 失效） |

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
| GET | `/dicts/:id/items` | `sys:dict:list` | 字典项列表（分页，`:id` 支持数字 ID 或 dictCode） |
| GET | `/dicts/:id/items/options` | `sys:dict:list` | 字典项下拉列表（`:id` 支持数字 ID 或 dictCode，仅返回启用项） |
| GET | `/dicts/:id/items/:itemId/form` | `sys:dict:list` | 字典项表单数据 |
| POST | `/dicts/:id/items` | `sys:dict:create` | 新增字典项（parentId=0） |
| PUT | `/dicts/:id/items/:itemId` | `sys:dict:update` | 更新字典项 |
| DELETE | `/dicts/:id/items/:itemId` | `sys:dict:delete` | 删除字典项（软删，支持批量） |
| GET | `/dicts/by-type/:type/items` | 公开 | 按字典类型获取启用字典项（前端下拉/标签颜色解码，带 10 分钟缓存） |

**关键设计：**
- Cache-Aside 旁路缓存：withCache 双重检查锁防缓存击穿，写操作主动失效

---

## storage · 文件存储

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/files` | `sys:file:upload` | 上传文件（multipart/form-data，返回文件 URL） |
| DELETE | `/files` | `sys:file:delete` | 删除文件（query: `filePath`，同步删除存储侧文件） |

**关键设计：**
- Storage 存储抽象：`Storage` 接口 + `createStorage` 工厂，通过 env 切换 driver
- local-fs driver：文件存本地 `./uploads/`，路径穿越防护（`path.resolve` + 前缀校验）
- 文件元数据登记到 `sys_file` 表

---

## ip-blacklist · IP 黑名单

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/ip-blacklist/` | `sys:ip-blacklist:list` | IP 黑名单列表（分页） |
| DELETE | `/ip-blacklist/:id` | `sys:ip-blacklist:delete` | 移出黑名单（软删） |

**关键设计：**
- 全局 IP 黑名单 plugin：onRequest 阶段检查，命中直接 403
- 登录失败超过 5 次自动入黑名单（无手动添加接口，入名单仅走登录失败联动）

---

## config · 系统配置

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/configs/` | `sys:config:list` | 配置列表（分页，支持 keywords 模糊搜索 configName/configKey） |
| GET | `/configs/:id/form` | `sys:config:list` | 配置表单数据（编辑回填） |
| POST | `/configs/` | `sys:config:create` | 创建配置（configKey 全局唯一，冲突返回 `A0481`） |
| PUT | `/configs/:id` | `sys:config:update` | 更新配置 |
| DELETE | `/configs/:id` | `sys:config:delete` | 删除配置（支持单条 ID 或逗号分隔批量，软删） |
| PUT | `/configs/refresh` | `sys:config:update` | 刷新配置缓存（清空 `config:*` 缓存 key，当前为占位） |

**关键设计：**
- 配置存 `sys_config` 表，`configKey` 全局唯一
- 写操作接入 audit-log（create/update/delete/refresh）
- 未接入 withCache：均为管理端低频 CRUD；`/refresh` 保留作前端契约占位

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
  "code": "00000",
  "msg": "成功",
  "data": {}
}
```

- `code`：字符串业务码，成功固定 `"00000"`，错误码为 A/B/C 开头的 5 位字符串
- 失败时 `data` 固定为 `null`

错误码定义见 `src/lib/errors.ts`。
