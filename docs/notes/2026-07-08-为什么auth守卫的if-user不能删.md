# 为什么 auth 守卫的 `if (!user)` 不能删

## 背景

`src/plugins/auth.ts` 用两层结构实现登录态注入与拦截：

```ts
.derive({ as: "global" }, async ({ headers }) => {
	// 缺 token / 格式错 / 验签失败 → 一律返回 { user: null }
	const payload = await verifyToken(token).catch(() => null);
	return { user: payload };   // user 的类型是 JwtPayload | null
})
.macro({
	auth: () => ({
		beforeHandle: ({ user }) => {
			if (!user) throw unauthorized();   // auth: true 路由的运行时拦截
		},
	}),
});
```

handler 里常见写法（如 `/me`、`/export`、`/profile`）：

```ts
const handler = async ({ user }) => {
	if (!user) throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401); // ← 这行
	return db.user.findUnique({ where: { id: user.sub } });  // user 已被收窄为 JwtPayload
};
```

实测中这行 `if (!user) throw` 容易被当成"冗余守卫 / 死代码"误删（§4.14 红线语境下），**删了之后 `tsc` 会报一堆 `user.sub` / `user.xxx` 类型错误**。本文解释为什么它必须留着。

## 机制：运行时拦截 ≠ 编译期收窄

这是理解整个问题的关键——`auth: true` 只解决"运行时"，不解决"类型层"：

| 层面 | `auth: true` macro 的 `beforeHandle` | handler 里的 `if (!user) throw` |
|------|--------------------------------------|--------------------------------|
| 时机 | 请求进 handler **之前** | handler **之内** |
| 作用 | 未登录直接抛 401，请求根本到不了 handler | 把 `user` 从 `JwtPayload \| null` 收窄成 `JwtPayload` |
| 类型影响 | **无**——TS 不知道 `beforeHandle` 跑过 | **有**——`throw` 之后 `user` 在 TS 眼里变成非空 |

`auth.ts` 第 9 行的类型定义白纸黑字：`user: JwtPayload | null`。`derive` 注入的字段类型就是可空的，`beforeHandle` 只是运行时拦一道，它**不会改 TS 的类型推断**。所以编译期 `ctx.user` 永远是 `JwtPayload | null`，`user.sub` 在 TS 看来是"可能在 null 上取值" → 报错。

只有 handler 内的 `if (!user) throw` 才能让 TS 在后续代码里把 `user` 当作非空使用。`beforeHandle` 抛错与否，对类型检查毫无帮助——TS 不会跨 hook 做"它抛过所以后面一定非空"的推理。

## 为什么 derive 不自己抛错

如果把拦截写在 `derive` 里（token 失效就 `throw`），那**所有路由**都会因为过 derive 而被拦截，公开路由（登录、验证码）也进不来了。`derive` 故意返回 `null` 不抛错，让公开/私有路由共用同一条注入链路，差异完全交给 `auth: true` macro 决定。这是"全局注入 + 按需门卫"的标准拆法。

## 为什么 macro 用 `beforeHandle` 而不是 `resolve`

- `resolve` 的语义是**往 ctx 注入计算值**给 handler 用。这里 `user` 已由全局 `derive` 注入，macro 内**没有值要提供**，唯一目的是"不满足条件就拒"。
- `beforeHandle` 在 Elysia 生命周期里**专门负责 handler 之前的拦截/短路**，正是"门卫"语义。项目里 `permission.ts` 的 macro 守卫同样用 `beforeHandle`（第 47、62 行），是全项目统一的惯用法。
- 两者都在 schema `transform` 之后运行，校验顺序无差别；区别纯在意图与约定。
- `resolve: ({user}) => { if(!user) throw ... }` 技术上也能拦，但属于"用注入钩子干拦截的活"，语义不干净。

> 补充：git 历史里 `auth.ts` 的 macro 自 `ae3612c`（Jun 16）起就是 `beforeHandle`，从未使用过 `resolve`，也没有"从 resolve 切到 beforeHandle"的提交。这个选择是代码惯例 + 语义驱动，不是某次踩坑后的 ADR。

## 误删的后果（血泪现场）

第四轮 review 时曾把 `/export` 路由的 `if (!user) throw` 当成 §4.14 死代码红线要求删除，结果 `tsc` 在 `user.sub` / `user.xxx` 上炸出一堆类型错误——因为 `beforeHandle` 的运行时拦截并没让 TS 把 `user` 当作非空。删掉 handler 内的守卫 = 同时删掉了唯一的类型收窄手段。

## 与 §4.14 死代码红线的边界

§4.14 反对的是"auth: true 已保证 user 存在、所以守卫多余"这种**错误前提**下的删除。事实相反：

- `auth: true` 保证的是**运行时**请求到不了 handler；
- 但它**不保证编译期** `user` 类型非空；
- 所以 `if (!user) throw` 是**类型收窄必需品**，不是 §4.14 说的"auth 已保证存在所以冗余的空判断"。

判据一句话：**凡是 `auth: true` 路由里用到 `user.sub` / `user.xxx` 的 handler，顶部的 `if (!user) throw` 一律保留，禁止以死代码为由删除。**

## 结论

- `auth` plugin：`derive` 注入可空 `user`（不抛错）+ `auth: true` macro 用 `beforeHandle` 运行时拦截。
- handler 内 `if (!user) throw` = 类型收窄，必须保留，不是死代码。
- 不要把"运行时拦截"和"编译期收窄"混为一谈，也不要用 §4.14 红线去删它。
- 若需要测试"未登录被拦截"，应验证 `beforeHandle` 抛 401，而非在 handler 里依赖那个守卫做业务逻辑（守卫只负责收窄类型 + 兜底，真正的门卫在 macro）。
