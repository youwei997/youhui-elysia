# 项目计划总览

> 节奏：全职 6-8h/天 · 总计 28-33 个工作日 · 由易入难 · 边学边做

## 进度看板

| 阶段 | 难度 | 工时 | 状态 | 文档 |
|---|---|---|---|---|
| 1 · 地基 | ⭐ | 3-4d | ✅ 已完成 | [stage-1-foundation.md](./stage-1-foundation.md) |
| 2 · 基础 CRUD | ⭐⭐ | 2-3d | ✅ 已完成 | [stage-2-basic-crud.md](./stage-2-basic-crud.md) |
| 3 · 横切 Plugin 体系 | ⭐⭐⭐ | 4-5d | ⬜ 未开始 | [stage-3-plugins.md](./stage-3-plugins.md) |
| 4 · 权限核心 | ⭐⭐⭐⭐⭐ | 6-7d | ⬜ 未开始 | [stage-4-rbac.md](./stage-4-rbac.md) |
| 5 · 进阶辅助模块 | ⭐⭐⭐ | 4-5d | ⬜ 未开始 | [stage-5-modules.md](./stage-5-modules.md) |
| 6 · 代码生成器 | ⭐⭐⭐⭐ | 5-6d | ⬜ 未开始 | [stage-6-codegen.md](./stage-6-codegen.md) |
| 7 · 收尾 & 部署 | ⭐ | 2-3d | ⬜ 未开始 | [stage-7-deploy.md](./stage-7-deploy.md) |

> 状态标记：⬜ 未开始 · 🟡 进行中 · ✅ 已完成 · ⚠️ 受阻

## 核心节奏

```
地基(纯框架)  →  基础 CRUD(业务首秀)  →  横切 plugin(吃透 Elysia)
   ↓                                            ↓
权限核心(企业级真起点)  ←  进阶辅助模块(广度)  ←
   ↓
代码生成器(毕业作)  →  收尾 & 部署
```

每一阶段都使用前一阶段的能力——保证学到的范式立即被检验。

## 学习侧重分布

```
架构设计能力  ████████████████████ 60%
Elysia 范式吃透 █████████ 25%
完整跑通端到端 █████ 15%
```

## 关键风险与应对

| 风险 | 应对 |
|---|---|
| Elysia 文档/示例少，范式踩坑 | 阶段 3 整段在做范式吃透，不绕开 |
| Drizzle 数据权限拼接复杂 | 阶段 4.6 留 1.5d，先做 ALL/SELF 两档，DEPT 树查询单独验证 |
| 代码生成器易过度工程 | 阶段 6 锁定 6 天硬上限，超时立即砍特性 |
| 全职易疲劳 | 每周日强制休息，每周写本周收获 |

## 如何使用本目录

1. **开干前**：进入对应 stage doc，按"前置检查"确认依赖完成
2. **干活时**：参考"子任务清单"逐项推进，注意"避雷"
3. **完成后**：拿"验收清单"自查或让 AI 核对，全 ✅ 才能进下一阶段
4. **每阶段完成**：在本文档进度看板更新状态、写一句"本阶段收获"

## 进度日志

> 每完成一个阶段，在这里追加一行

```
[2026-06-14] 阶段 1 完成。收获：跑通 Docker + Drizzle + Elysia 地基，建好 config/logger/优雅关停体系，删掉 _smoke 测试表改走真实 user 表验证，typecheck 改用 bun 内置。进入阶段 2 开发。
[2026-06-14] 阶段 2 完成。收获：跑通 user 模块三件套（schema/queries/routes）范式，端到端类型推导不丢。两个核心坑：drizzle-orm/zod 的 refine 箭头函数参数不能标注 z.ZodType（否则 schema 退化为 unknown）、refine 对象不能抽共享 const（否则 noImplicitAny）。软删过滤补齐 findUsers/findUserById/updateUser 三处。进入阶段 3 开发。
```
