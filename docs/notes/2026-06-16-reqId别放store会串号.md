# reqId 别放 store，并发会串号

`2026-06-16` · 阶段 3 · 请求上下文

---

之前看 requestContext 代码总觉得"说不上来哪里不对劲"，今天终于想通了。

原来的写法是把 reqId 放在 Elysia 的全局 `store` 里：

```ts
.state("reqId", "")
.onRequest(({ store }) => { store.reqId = crypto.randomUUID() })
.derive(({ store }) => ({ reqId: store.reqId }))
```

三段绕来绕去，看着能跑，但总觉得别扭。后来一拍脑袋——**store 是全局共享的一个对象**，所有请求读的都是同一份。reqId 明明是"每个请求各一个"的东西，却塞进了一个大家共用的容器里。

这不就是把函数局部变量写成了全局变量吗。

## 怎么串号的

JS 单线程没错，但只要请求中间有 `await`（查库、读 body 都有），并发请求就会交错：

```
请求 A：store.reqId = "AAA"   → await 查库...
请求 B：store.reqId = "BBB"     ← 把 A 的覆盖了
请求 A：查完库，读 store.reqId  → 读到 "BBB" ❌
```

A 的日志里 traceId 变成了 B 的 uuid。本地一个人测根本发现不了，因为请求是排队来的；上线多人用才会偶发。

而且这是**单写者也防不住**的竞态——不是"注意别同时写"能解决的，问题在 store 共享本身。

## 改完就通顺了

把"生成 reqId"直接写进 derive 回调，一步到位：

```ts
.derive({ as: "global" }, () => {
    const reqId = crypto.randomUUID();   // 回调每请求跑一次，reqId 是局部变量
    return { reqId, startTime: performance.now(), logger: logger.child({ reqId }) };
})
```

reqId 是回调的函数局部变量，请求 A 调一次生成 "AAA"，请求 B 调一次生成 "BBB"，**互不可见**，根本不存在共享，哪来的竞态。

这不就是 Koa 里 `ctx.reqId = uuid()` 那套嘛。我一直觉得 Elysia 这个写法怪，原来是因为它绕了一圈没用上我最熟悉的 per-request ctx 模型。derive 的 return 就是给这个请求的 ctx 加字段，等价于 Koa 的 `ctx.xxx = ...`。

## 原来那三段为什么多余

想明白了：state 占位 → onRequest 生成 → derive 拷贝，这三步是**因为先把值放 store 再拷出来**才产生的负担。store 这个中转站本身就是多余的。去掉它，三步变一步。

那个 `.state("reqId", "")` 的空串初值，运行时**永远读不到**（onRequest 总会先覆盖），它存在的唯一意义是骗 TS 让 `store.reqId` 有类型。

## 一个判断口诀

以后挂数据前问一句：**这个值，所有请求该共享同一份，还是每个请求各一份？**

- 共享同一份（db 连接、redis、配置）→ `store` / `state`
- 每请求各一份（reqId、当前用户、开始时间）→ `derive` / `resolve`

Koa 从来不踩这坑，因为它压根没有 store，逼你只能用 ctx，没得选错。Elysia 给了自由，代价就是得自己判断。

## error-handler 的连带改动

reqId 不在 store 了，error-handler 那边 `onError` 读 reqId 的方式也得跟着改：从解构 `store.reqId` 改成直接解构 derive 注入的 `reqId`。为了让 TS 认识这个字段，error-handler 里加了个 `.use(requestContext)` 借类型。

这个 `.use` 一开始我犹豫会不会违反 AGENTS.md「plugin 互不 import」。但想清楚了：requestContext 是**纯 context provider**（只注入字段，没有业务逻辑），借它类型属于 Elysia「基础 plugin 提供共享 context 类型」的标准模式，不是被禁止的「plugin 互调业务逻辑」。而且两边 plugin 都有 name，Elysia 会去重，不会重复挂载。

## 一句话

reqId 这种 per-request 的东西放 store 是语义错配——store 是给 db/redis 这种"本来就该全局唯一"的东西准备的。放错了，本地无感，上线偶发日志串号。
