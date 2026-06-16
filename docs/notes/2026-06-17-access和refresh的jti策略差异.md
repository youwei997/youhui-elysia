# access 和 refresh 的 jti 策略差异

## 背景

实现登录和刷新接口时，jti（JWT ID）到底该不该复用、什么时候该换新，搞清楚之前一直迷迷糊糊。

## 结论

- access token：每次签发用独立新 jti
- refresh token：刷新时旧 jti 入黑名单，新 jti 顶上
- logout：注销当前 access 的 jti，不动 refresh

## 为什么 access 用独立 jti

access 生命短（15min），自然过期即失效。不需要主动注销追踪（除非踢人）。

签名里的 jti 主要作用是给 refresh 用：refresh payload 里的 jti 和 access payload 的 jti 是两个不同的 UUID，refresh 黑名单只黑自己的 jti，不影响 access。

## 为什么 refresh 要换 jti + 黑名单

refresh 生命长（7d），必须可主动失效。如果不换 jti：

```
用户登录 -> refresh token (jti=A)
用户刷新 -> 还是 jti=A
旧 token 怎么办？ -> 还是合法
```

刷新时旧 jti 入黑名单，实现一次性使用：

```
用户登录 -> refresh (jti=A)
用户刷新 -> 验 jti=A -> 签新的 (jti=B) + 黑 A
旧 refresh 再次刷新 -> 黑名单命中 -> 拒绝
```

## refresh 换 jti 的副作用

用户连续刷新 N 次，Redis 黑名单里就有 N 条记录。但每条 TTL 是旧 token 剩余有效期（最坏 7d），所以：

- 第 1 次刷新后的旧 jti 会在 7d 后消失
- 第 2 次刷新后的旧 jti 会在 6d 23h 后消失

**不会无限膨胀**，因为每次新签的 jti 寿命都是 7d 起步。

## logout 的盲点

当前实现 logout 只黑 access 的 jti。**如果前端不主动删 refresh，7 天内还能换 access**。

要堵这个缺口需要 logout 时前端把 refresh token 也带上来（或者把 refresh 也存数据库而不是 JWT——超出当前阶段）。

属于已知小缺口，先记下来。

## 我之前的误解

以为 access 和 refresh 共享一个 jti 会简化逻辑。其实不行：

1. access 黑名单和 refresh 黑名单是分开查的
2. 共享 jti 意味着 logout 时得决定黑哪一个，逻辑复杂
3. jose 验签后 payload 是同一个 jti 没问题，但黑名单按 jti 查的话两边就耦合了

**独立 jti 让两个 token 互不干扰**，代价就是每次签发多调一次 crypto.randomUUID()，可忽略。
