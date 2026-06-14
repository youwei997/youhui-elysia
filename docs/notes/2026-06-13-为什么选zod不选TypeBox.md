# 为什么选 zod 不选 TypeBox

`2026-06-13` · 阶段 2 初期决策

---

## 起因

一开始 architecture.md 写的是 TypeBox（借鉴 elysia-admin）。我和 AI 讨论选型时，AI 力推 TypeBox，理由是：**TypeBox 能从 Drizzle 表直接导出 schema，然后直接给路由用**——一份 schema 定义同时管"数据库结构 + 路由校验 + OpenAPI 文档"，听起来很美。

我一开始被这个卖点说服了。但真做 user 模块时发现：**表和路由的 schema 根本不是一回事**。

## 我发现的问题：表 schema ≠ 路由 schema

表里有「审计字段」——createdAt / createdBy / updatedAt / updatedBy / deletedAt。这些是**服务端控制**的，前端根本不该传：

- `createdAt` / `createdBy`：谁创建的、什么时候创建的，是服务端决定的，不能让前端指定
- `deletedAt`：这是软删标志，前端要是能传 `"deletedAt": null`，就能把已删记录"复活"（反软删）

所以"表 schema 直接给路由用"这个理想，实际落地是：**派生完还得手动 omit 掉一堆字段**。

后来查 Elysia 官方 Drizzle 集成文档，发现**官方示例自己就在 omit**：

```ts
const _createUser = createInsertSchema(table.user, {
  email: t.String({ format: 'email' })  // 还得手动 refine
})

new Elysia().post('/sign-up', ..., {
  body: t.Omit(_createUser, ['id', 'salt', 'createdAt'])  // ← 必须 omit
})
```

官方甚至专门写了个 `spread` 工具函数来缓解"每次都要 t.Pick/t.Omit 太烦"的问题。**这反过来证明：表和路由 schema 的不对应，是普遍痛点**，不是我的错觉。

## 那为什么还选 zod

我的判断标准其实很简单：**既然 TypeBox 做不到「碾压式」的优势，就选通用性更强的那个**。

TypeBox 的优势我能想到的：
- 性能（JIT 编译，比 zod 快）
- 原生 JSON Schema 输出

但这些在后台管理场景**不重要**——我们不是写高并发 API 网关，zod 慢那点性能差异完全无感。而 zod 的优势是实打实的：

- **跨框架通用**：Hono、各种 SSR 框架、React Hook Form 都把 zod 当一等公民。哪天换框架，schema 能带走
- **文档和社区资料多**：遇到问题搜得到答案
- **Elysia 原生支持**（1.4+ 通过 Standard Schema），不存在"非 TypeBox 不可"

TypeBox 没有像 Macro 那种「非它不可」的杀手锏（macro 是 Elysia 独有的声明式能力，离开 Elysia 没替代品）。既然如此，没必要绑死在 Elysia 专属方案上。

## 一个小感悟

这次让我对「AI 力推的方案」多了点警惕。AI 说"TypeBox 能直接用"，听起来很顺，但**它说的"直接用"是理想化的，实际落地还要 omit、refine、甚至官方都要给工具绕**。

以后听 AI 介绍某个方案的优势，要追问一句：**「这个优势在实际代码里能省多少事？还是会变成另一种麻烦？」** 卖点描述和落地体验，中间可能隔着一整个 omit 工具函数。

另一个感悟：**选型时，"通用性"和"不可替代性"要分开看。** 一个东西如果通用性强但不可替代性弱（zod），选它一般不会错；如果不可替代性强但通用性弱（TypeBox 绑 Elysia），要掂量值不值得绑死。真正难选的是「既通用又不可替代」的，那种才需要纠结。
