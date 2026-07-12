# youhui-elysia

基于 **Bun + ElysiaJS + Drizzle ORM + PostgreSQL** 的后台管理框架，函数式优先、全栈 TypeScript。

对齐 [vue3-element-admin-v4.6.0](https://github.com/youlaiorg/vue3-element-admin) 前端契约，后端补全 REST 接口 + SSE 实时推送。

## 技术栈

| 层 | 技术 |
|---|---|
| 运行时 | Bun |
| 框架 | ElysiaJS |
| ORM | Drizzle ORM |
| 数据库 | PostgreSQL |
| 缓存 | Redis |
| 日志 | pino |
| 验证 | Zod |
| JWT | jose |
| 文档 | OpenAPI + Scalar |
| 前端对照 | vue3-element-admin-v4.6.0 |

## 快速开始

```bash
# 安装依赖
bun install

# 配置环境变量（复制 .env.example 为 .env 并填写）
cp .env.example .env

# 迁移数据库
bun run db:generate && bun run db:migrate && bun run db:seed

# 启动开发服务器（热重载）
bun run dev

# 数据库浏览 GUI
bun run db:studio
```

## 常用命令

```bash
bun run dev              # 开发服务器（watch 模式）
bun run start            # 生产启动
bun run tsc              # 类型检查（只读）
bun run check            # biome 格式化 + lint + organizeImports
bun run check:dev        # 运行时检查（同 dev，但加 --check 标志）
bun test                 # 运行全部测试
bun run db:seed          # 种子数据
bun run db:studio        # Drizzle Studio
```

## 项目结构

```
src/
├── app.ts                # Elysia 应用组装（路由 + 插件 + openapi）
├── index.ts              # 启动入口 + 优雅关停
├── config/               # 配置（环境变量、端口）
├── db/                   # Drizzle 连接 + schema 定义
├── lib/                  # 通用工具（errors、jwt、logger、redis、cache）
├── plugins/              # 横切关注点（auth、permission、rate-limit、audit-log…）
├── jobs/                 # Bun.cron 定时任务
├── modules/              # 业务模块（三件套：schema / queries / routes）
│   ├── auth/
│   ├── user/
│   ├── role/
│   ├── menu/
│   ├── dept/
│   ├── dict/
│   ├── notice/
│   ├── oper-log/
│   ├── online/
│   ├── storage/
│   ├── config/
│   ├── ip-blacklist/
│   └── sse/              # SSE 实时推送（阶段 10）
└── modules/test/         # 单测文件
```

## 模块三件套

每个业务模块遵循统一结构：

- `schema.ts` — Zod DTO（请求/响应类型 + 校验规则）
- `queries.ts` — 纯函数数据库查询（事务、软删、缓存）
- `routes.ts` — Elysia 路由（权限、审计、响应转换）

## 核心约定

- 无 `as any`、无 DI 容器、无装饰器控制器
- 响应统一壳 `{ code, msg, data }`（`response-wrap` 插件），SSE 流除外
- 软删：`deleteTime` 审计列，查询默认排除软删记录
- 横切关注点统一用 Elysia plugin（auth、permission、rate-limit…）
- 广播跨模块调用直接 `import`，不走 DI 容器

## 文档导航

| 文档 | 说明 |
|---|---|
| [`docs/architecture.md`](./docs/architecture.md) | 架构蓝图（技术栈、目录、编码规范） |
| [`docs/plan/README.md`](./docs/plan/README.md) | 阶段计划进度看板 |
| [`docs/plan/stage-N-*.md`](./docs/plan/) | 各阶段详细设计 + 验收清单 |
| [`docs/modules.md`](./docs/modules.md) | 模块接口总览 |
| [`docs/troubleshooting.md`](./docs/troubleshooting.md) | 踩坑修复记录 |

## 开发节奏

阶段式增量开发，每个阶段完成后跑通全量测试再进入下一阶段。详见 [`docs/plan/README.md`](./docs/plan/README.md)。
