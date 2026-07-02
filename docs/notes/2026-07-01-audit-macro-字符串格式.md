# audit macro 从 object 改为字符串

**日期**:2026-07-01
**阶段**:5.1 操作日志 / 5.2 登录日志
**触发问题**:在给 role/menu/dept 路由挂 audit 声明时，`audit: { module: "dept", action: "create" }` 写法跟 `requirePerm: ["sys:dept:create"]` 风格不一致，问为什么不用 `audit: "dept:create"`。

---

## 决策

audit macro 从 `{ module, action }` object 改为 `"模块:动作"` 字符串。

### 原来

```ts
.post('/', handler, {
  auth: true,
  requirePerm: ["sys:dept:create"],
  audit: { module: "dept", action: "create" },
})
```

### 现在

```ts
.post('/', handler, {
  auth: true,
  requirePerm: ["sys:dept:create"],
  audit: "dept:create",
})
```

---

## 为什么 perm 用数组，audit 用字符串

这是两个不同的问题：

| | perm | audit |
|--|------|-------|
| 类型 | `string[]` | `string` |
| 为什么 | OR 权限是真实需求（有 A *或* B 即可），内部 `.some()` 不用 `Array.isArray` 判断类型 | 没有 OR 需求，一次操作不可能既是"创建"又是"删除" |
| 是否对齐 | — | **不需要强行对齐**，各有各的道理 |

### perm 用数组的两个理由

1. **OR 权限场景**：某些接口可以设 `requirePerm: ["sys:user:list", "sys:role:assign"]`，两个权限任一个有就行。如果用 `string`，遇到 OR 场景得改类型、改内部逻辑、改所有调用处。
2. **不用 `Array.isArray`**：如果类型是 `string | string[]`，内部要先判断是单值还是数组再归一。统一 `string[]` 直接 `.some()`，少一个分支。

### audit 不用数组的理由

一个操作不可能同时是"创建用户"和"删除用户"，没有 OR 场景。`string` 够了。

---

## 实现改动

macro 内部：

```ts
// 原来
audit: (opts: { module: string; action: string }) => {...}

// 现在
audit: (opts: string) => {
  const [module = "", action = ""] = opts.split(":");
  ...
}
```

7 个文件、41 行改 41 行（纯替换，无增无减）。

---

## 以后怎么写

所有路由的 audit 声明统一用 `"模块:动作"` 字符串：

```
user:create
user:update
user:delete
user:reset-password
role:create
role:assign-menu
menu:create
dept:delete
```