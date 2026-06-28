# perm 和 dataScope 不是一回事

`2026-06-24` · 阶段 4.5 设计前补认知

---

## 起因

做 Permission macro 时突然意识到：我一直在说"权限"，但这个词在公司里同时指两种完全不同的东西：

- **开发**："这个用户没有权限调接口" → 报 403
- **产品**："这个用户只能看自己部门的数据" → 列表少了 80%

这两个都叫"权限"，但后端实现完全不同。如果混为一谈，阶段 4.5 和 4.6 会互相污染。

## 之前以为

"权限"就是能不能做，数据少看到几条是业务逻辑，不是权限问题。  
按这个思路：所有接口统一用 `perm` 判断，数据少的话就是前端过滤或后端查询条件加得严。

## 真做的时候发现不对

**1. 同一接口，三个人调用，返回完全不同**

```bash
curl /users -H "Authorization: Bearer $ADMIN_TOKEN"
# 返回 50 条（全部数据）

curl /users -H "Authorization: Bearer $MANAGER_TOKEN"
# 返回 12 条（本部门+子部门）

curl /users -H "Authorization: Bearer $STAFF_TOKEN"
# 返回 3 条（自己创建的）
```

三个人都能调通 `/users`（没有 403），但看到的数据不一样。这不是"能不能做"，是"能看到多少"。

**2. perm 拦不住数据，dataScope 不拦接口**

```ts
// perm 在接口层面：没权限的直接 403
{ perm: 'sys:user:list' }
// 没这个 perm 的人 → 403（按钮灰了，接口也调不了）

// dataScope 在查询层面：有权限的人，根据角色级别决定 SQL 的 WHERE 条件
const where = and(
  eq(users.deleteTime, null),
  dataScopeFilter(ctx, users)  // ← 这里决定能看到多少条
)
```

- `perm` 是路由门前的保安："没通行证，门都不让进"
- `dataScope` 是办公室里的工位划分："进了门，你坐哪片区域"

**3. 两者正交，不互相替代**

| 场景 | 需要 perm | 需要 dataScope | 结果 |
|---|---|---|---|
| 普通员工调 `/users` | ✅ 有 `sys:user:list` | ✅ `SELF` | 200，只看到自己 3 条 |
| 部门经理调 `/users` | ✅ 有 `sys:user:list` | ✅ `DEPT_AND_SUB` | 200，看到部门 12 条 |
| 管理员调 `/users` | ✅ 有 `sys:user:list` | ✅ `ALL` | 200，看到全部 50 条 |
| 没 perm 的人调 `/users` | ❌ 没有 | 不用跑 | 403 |

没有 perm 的人根本进不来。有 perm 的人，dataScope 决定看到几条。

**4. 代码里的真实对应**

```ts
// 4.5 阶段：perm 在 routes 层面，控制接口准入
export const userRoutes = new Elysia({ prefix: '/users' })
  .get('/', findUsersHandler, {
    auth: true,
    perm: 'sys:user:list',  // ← 保安：没通行证就 403
  })

// 4.6 阶段：dataScope 在 queries 层面，控制 SQL 过滤
export const findUsers = async (query, db, ctx) => {
  const where = [
    isNull(users.deleteTime),
    dataScopeFilter(ctx, users),  // ← 工位划分：SQL 里加 WHERE 条件
    // ...其他业务过滤
  ]
  return db.select().from(users).where(and(...where))
}
```

两者在一个请求里先后发生：先过 `perm`（门），再过 `dataScope`（工位）。

## 想通后的判断

**perm 和 dataScope 是两个正交维度，分别回答不同问题：**

| 维度 | `perm` | `dataScope` |
|---|---|---|
| 问什么 | "你能调这个接口吗？" | "你能看到哪些数据？" |
| 在哪里生效 | 路由层（入口） | 查询层（SQL WHERE） |
| 没通过时表现 | 403（接口拒绝） | 列表为空或数据少 |
| 数据来源 | 角色 → 菜单 → perm 字符串 | 角色表 `dataScope` 字段（1-5） |
| 前端对应 | 按钮显隐（v-permission） | 表格数据多少 |
| 典型值 | `sys:user:create` | `ALL` / `DEPT_AND_SUB` / `SELF` |

**关键认知**：  
- 一个接口可以**有 perm 但没有 dataScope**（如创建用户，只关心"能不能创建"，不关心"能看到谁"）  
- 一个查询可以**有 dataScope 但没有单独的 perm**（如首页统计图表，接口本身是公共的，但数据按权限范围展示）  
- 多数列表查询接口是**两者都有**（先过 perm 进门，再用 dataScope 过滤数据）

## 代码中的数据流

```ts
// 用户登录时，把两个维度的信息都写进 JWT
const payload = {
  sub: user.id,
  username: user.username,
  roles: ['ADMIN'],           // ← 给 dataScope 用
  perms: ['sys:user:list'],   // ← 给 perm 校验用
  dataScopes: [1, 2],        // ← 角色对应的数据范围（ALL=1, DEPT_AND_SUB=2）
  tokenVersion: 0,
  jti: 'xxx',
}

// 请求链路：
// 1. auth plugin → 验 token 有效性
// 2. perm macro → 检查 ctx.user.perms 是否包含 'sys:user:list'
//    → 没有？403 直接返回
// 3. handler 调用 queries → 执行 dataScopeFilter(ctx, users)
//    → 根据 ctx.user.dataScopes 拼接 SQL WHERE
// 4. DB 查询 → 返回过滤后的数据
```

## 口诀

**perm 管门，dataScope 管桌。**  
先看通行证（perm），再查坐哪片（dataScope）。  
没证门都进不去，有证也得按级别看数据。

## 为什么必须分开

如果把两者混在一起，比如"没 perm 就看不到数据"，那数据量变成了权限判断标准——管理员看 50 条就不是权限了吗？逻辑会乱。

分开后，perm 可以精确到按钮，dataScope 可以精确到部门树。按钮权限由产品经理管，数据范围由组织架构管，两者独立变更，不互相牵制。

---

## 延伸阅读

dataScope 的 ctx 字段对照、边界陷阱、ROOT 双层短路详解 →  
[`2026-06-28-dataScope的ctx字段对照.md`](./2026-06-28-dataScope的ctx字段对照.md)
