# 阶段 7 · 收尾 & 部署

> 难度 ⭐ · 工时 2-3 天 · 学到：类型导出、Docker 多阶段、性能基线
> **完整闭环**：让别人能 clone 后一键跑

## 目标

把项目**整理成可发布、可部署、可被他人复现**的状态。包括：
- 类型导出供前端使用（Eden Treaty + OpenAPI 双路径）
- Docker 多阶段构建（最终镜像 < 200MB）
- 完整 README + 架构文档 + 全部 ADR
- 基线性能数据
- 学习复盘

## 前置检查

- [ ] 阶段 6 验收全 ✅
- [ ] 所有计划模块完成

## 子任务清单

### 7.1 类型导出 (0.5d)

**主路径：Eden Treaty**

`src/index.ts` 顶层：
```ts
export type App = typeof app
```

`docs/eden-treaty-usage.md`：示范前端项目怎么用：
```ts
import { treaty } from '@elysiajs/eden'
import type { App } from 'youhui-elysia'

const api = treaty<App>('http://localhost:3000')
const { data, error } = await api.users.get({ query: { page: 1 } })
```

注意：
- 前端 `import type` 即可，不引入运行时
- 包发布或路径别名都行（这一阶段先用路径别名 `tsconfig.paths`）

**逃生口：OpenAPI 导出**

- 已有 `@elysia/openapi` 在工作
- 加一个 `bun run openapi:export` 脚本，把 `/swagger/json` 内容导出到 `dist/openapi.json`
- 这样不用 Elysia 的客户端也能用 `openapi-typescript` 生成类型

### 7.2 Dockerfile + 部署 (1d)

`Dockerfile`（多阶段）：

```dockerfile
# Stage 1: deps
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Stage 2: build
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --target=bun --outdir=dist

# Stage 3: runtime
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
EXPOSE 3000
CMD ["bun", "dist/index.js"]
```

`docker-compose.prod.yml`：
- 引用线上 Neon / Redis Cloud / 对象存储（七牛 / R2 等）的 env
- 健康检查
- 重启策略 always

部署流程文档 `docs/deploy.md`：
- 本地构建：`docker build -t youhui-elysia:latest .`
- 推到 registry（GitHub Container Registry / Docker Hub）
- 服务器拉镜像 + docker-compose up

### 7.3 文档整合 (1d)

**`README.md`**（顶层，对外门面）：
- 项目介绍 + 截图 / gif
- 技术栈
- 快速开始（5 分钟跑起来）
- 目录结构（链接到 architecture.md）
- 路线图（链接到 plan/）
- License + 致谢

**`docs/getting-started.md`**：
- 详细的本地开发指南
- env 配置
- 常见问题

**`docs/architecture.md`**（已有）：补充实际落地后的微调

**`docs/adr/`**：
- 001 权限模型
- 002 codegen
- 至少再写 2-3 篇：错误体系 / 数据权限实现 / 缓存策略 / JWT 三层失效 ... 选你最得意的

**`docs/modules.md`**：
- 列出所有模块及其能力（阶段 5 已开始写，这里完善）

清理：
- 删除 `experiments/` 里没价值的代码
- 删除 TODO 标记里已完成的项
- 检查所有 README 链接有效

### 7.4 性能基线 (0.5d)

`scripts/bench.ts` 或 `tests/bench/`：

用 `k6` 或 `autocannon`（更轻量）压测核心接口：
- `POST /auth/login`
- `GET /users`（带 token）
- `GET /menus/my-tree`
- `POST /users`（写）

环境：
- 本地 Bun + 本地 PG
- 硬件配置写在文档里

记录：
- p50 / p95 / p99 响应时间
- QPS
- 内存占用

`docs/performance.md` 写下来，给他人参考（也方便你以后优化时对比）。

`bun:test` 核心覆盖：
- lib/jwt.ts（签发/校验）
- lib/result.ts
- db/helpers/data-scope.ts
- lib/cache.ts（防击穿）
- 至少这 4 个 lib 100% 覆盖

### 7.5 复盘博客 (1d)

`docs/retrospective.md` 或单独博客：

模板：
- **起因**：为什么做这个项目？
- **决策**：技术选型回顾（哪些选对了 / 选错了）
- **难点**：哪些卡了 1 天以上的问题
- **收获**：架构能力 / Elysia 范式 / 函数式实践
- **遗憾**：哪些没做完 / 做得不够好
- **未来**：下一版本计划

发布到博客 / 掘金 / GitHub README 都行，**强迫自己输出 = 真正学到**。

## 学习重点

- **Bun build 的产物**：单文件 vs 多文件、是否包 node_modules、性能影响
- **Docker 多阶段构建**：每阶段缓存粒度、最终镜像精简
- **k6 vs autocannon**：什么场景用哪个、压测脚本编写
- **OpenAPI 与代码同步**：为什么 Elysia 这样的"代码即文档"是杀手特性

## 避雷

- ❌ 不要把 `.env` commit 到镜像里（用 docker-compose env_file 或 K8s secret）
- ❌ 不要在生产 Dockerfile 里跑 dev 脚本（如 db:studio）
- ❌ 性能压测**别在你写代码的同一台机器上**（环境噪声）
- ❌ ADR 不要写得像流水账，要有"反对方案"和"取舍理由"
- ❌ README 截图不要太大（影响 GitHub 加载）
- ⚠️ Bun 的 `bun build` 对 native 依赖（如 argon2）打包要测试，可能要保留 node_modules
- ⚠️ Eden Treaty 跨包使用需要 monorepo 或路径别名，提前规划

## 验收清单

### 类型导出
- [ ] `export type App = typeof app` 已加
- [ ] Eden Treaty 用例文档已写
- [ ] `bun run openapi:export` 可导出 openapi.json
- [ ] 用 `openapi-typescript` 验证导出的 schema 可生成正确类型

### Docker
- [ ] Dockerfile 多阶段构建
- [ ] 最终镜像 < 200MB（用 `docker images` 验证）
- [ ] 镜像内不含 dev 依赖、源码、.env
- [ ] `docker run` 可启动
- [ ] docker-compose.prod.yml 含健康检查

### 文档
- [ ] README.md 完整（含截图 + 5 分钟跑通）
- [ ] architecture.md 与实际代码一致
- [ ] plan/ 全部阶段标记 ✅
- [ ] adr/ 至少 3 篇（含权限 / codegen / 你最得意的一项）
- [ ] modules.md 列全所有模块
- [ ] getting-started.md 含 troubleshooting

### 性能
- [ ] core lib 单测覆盖率 ≥ 90%
- [ ] 至少 4 个核心接口的性能基线已记录
- [ ] performance.md 写明环境 + 数据 + 解读

### 复盘
- [ ] retrospective.md 已写
- [ ] 含起因 / 决策 / 难点 / 收获 / 遗憾 / 未来
- [ ] 至少 2000 字（强迫深度反思）

### 整体
- [ ] 全项目 grep `TODO` / `FIXME`：每条都有 issue 或处理计划
- [ ] 全项目 grep `as any` / `as never`：每个都有理由（写 ADR 或注释）
- [ ] `bun run check && bun run typecheck && bun test` 全绿

### 可被复现
- [ ] 别人 clone 后按 README 5 分钟内跑起来
- [ ] 已找一位朋友实测过（或自己换一台机器实测）

## 完成标志

```bash
# 别人的视角
git clone <your-repo>
cd youhui-elysia
cp .env.example .env
docker compose up -d
bun install
bun run db:push
bun run db:seed
bun dev

# 5 分钟内看到 OpenAPI、能登录、能列表
```

## 本阶段收获（完成后填写）

## 项目总结（完成后填写）

> 整个项目的最终自评：你是否达成了"从零设计企业级框架"的学习目标？
