# perm 与 requireRole 的区别和选用

`2026-06-24` · 阶段 4.5 Permission macro 设计前置思考

---

## 起因

做 4.5 Permission macro 时要实现两个接口：

```ts
// 接口1：权限点控制
{ auth: true, perm: 'sys:user:create' }

// 接口2：角色控制
{ auth: true, requireRole: ['ADMIN', 'ROOT'] }
```

他俩都能拦住没权限的人，那到底什么场景用哪个？能不能同时用？

## 之前以为

权限 = 角色，角色 = 权限，一回事。一个接口要么用 perm 要么用 role，不会同时用。

按这个思路，`requireRole` 根本没必要做，有 `requirePerm` 就够了——用户拿到角色，角色有菜单，菜单有 perm，前端按钮控制到 perm，接口控制到 perm，完事。

## 真做的时候发现不对

**1. 权限点和角色不是一一映射**

权限点是粒度最细的：一个按钮（`sys:user:create`）、一个接口对应一个 perm。但角色是粒度的容器：管理员 = 100 个 perm 的集合，部门经理 = 50 个 perm 的集合。

这两个层级不能直接替换。如果只有 `requireRole`：前端要控制按钮显隐，需要每个按钮配角色？那角色一变，前端所有按钮配置都要改，不可维护。

如果只有 `requirePerm`：那框架级操作（如"查看在线用户""强制踢人"）没有对应按钮/菜单，怎么控？

**2. 有些接口不对应前端按钮，没有 perm**

```ts
GET  /online          → 没有按钮，是系统监控页面
POST /online/:id/force → 没有按钮，是管理员操作
POST /auth/logout-all → 每个用户都能用，但不需要 perm
GET  /users/me        → 用户自己的信息，不需要权限点
```

这些接口没有对应菜单项，也没有 `perm` 字符串。如果硬上 `perm`，就得给它们编一个"伪权限"（如 `sys:online:view`），那前端没有这个按钮，perm 哪来的？角色绑定菜单时才拿到 perm，而这些接口没有菜单。绕了一圈，最终逻辑就是：谁的角色是管理员，谁就能用。

**3. 高风险操作需要角色直接封死**

清空操作日志、改系统配置、重置任意用户密码——这些不是"你有没有某个按钮的权限"，而是"你的身份级别够不够"。即使某个管理员"恰好有"这个按钮（因为菜单绑定），但架构设计上应该直接用角色短路，而不是依赖菜单权限点的间接推导。

**4. 当前代码已经存在隐式角色判断**

```ts
// menus/routes.ts:72
const isRoot = user.roles.includes("ROOT");
```

ROOT 角色查全部菜单，其他角色按关联过滤。这实际上就是 `requireRole` 的逻辑，只是没封装成 macro。

**5. 同时声明 perm 和 requireRole 几乎不存在**

理论上是 AND：
```ts
{ auth: true, perm: 'sys:audit:list', requireRole: ['ADMIN'] }
// 语义：既是 ADMIN 又有 audit:list 权限
```

但现实中没用。如果 ADMIN 有权限点，那直接声明 `requirePerm` 就够了。如果 ADMIN 没有权限点（那它不应该能访问）。同时声明说明权限设计有问题，不是 macro 的问题。

## 想通后的判断

**perm 和 requireRole 是两个不同层级的东西，不是互斥而是互补。**

| 维度 | `requirePerm` | `requireRole` |
|---|---|---|
| 控制层级 | 细粒度（按钮/接口） | 粗粒度（角色身份） |
| 前端对应 | 菜单树 + 按钮显隐 | 页面级路由或特殊页面 |
| 数据来源 | 角色 → 菜单 → perm | 角色本身 |
| 适用场景 | 90% 的业务接口 | 框架级/系统级/特权级接口 |
| 典型接口 | `POST /users` / `DELETE /roles/:id` | `GET /online` / `POST /logout-all` |

**推荐用法**：
- 业务 CRUD → 用 `requirePerm`（有菜单树有按钮，自然有权限点）
- 系统监控/框架操作 → 用 `requireRole`（没有对应菜单，不需要造伪 perm）
- 两者同时声明 → 不做，设计上避免

`requireRole` 不是多余的，它是把那些散落在 routes 中的 `user.roles.includes(...)` 收编成统一 macro。

## 口诀

**`requirePerm` 管按钮能不能点，`requireRole` 管人是谁。**  
按钮用权限点，身份用角色。有按钮就有 perm，没按钮但有功能就用角色。
