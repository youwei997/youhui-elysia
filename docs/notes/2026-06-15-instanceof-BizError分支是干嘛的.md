# `instanceof BizError` 这个分支是干嘛的

`2026-06-15` · 阶段 3 · 错误体系

---

看 error-handler 代码，4 个分支里有个 `if (error instanceof BizError)`。确认了一下：**这个分支专门处理业务层主动抛的错误。**

routes 里写 `throw notFound()` / `throw new BizError(...)`，这些抛出的就是 BizError 实例，会落到这个分支。它和另外三个分支的区别：

- VALIDATION 分支：框架自己抛的（校验失败）
- PG 23505 分支：依赖库抛的
- 兜底分支：没预料到的 bug

只有 BizError 这一支是"我们自己主动抛、自己定义含义"的。其他三种都是被动接住的。

所以业务层抛错的本质是：**我们主动告诉 errorHandler"这种情况算业务错误，用这个码、这个状态码响应"**，而不是等 errorHandler 去猜。
