# 阶段 1 · 地基（基础设施 + 目录约定）

> 难度 ⭐ · 工时 3-4 天 · 学到：项目骨架、Drizzle、Docker、配置体系
> **不涉及**：业务模块、权限、复杂 plugin

## 目标

跑通**纯框架地基**——`docker compose up` 起本地基础设施，`bun run db:push` 建表，`bun dev` 启动有日志输出且可优雅关停，OpenAPI 仍可访问。**还没有任何业务**。

## 前置检查

- [x] Bun 已装、`bun --version` >= 1.2
- [x] Docker Desktop 可用
- [x] 项目骨架已有（elysia + openapi + zod + biome）
- [x] `package.json` 中有 `dev` 脚本

## 子任务清单

### 1.1 Docker compose 基础设施 (0.5d)

写 `docker-compose.yml`，**仅两个服务**：
- **PostgreSQL 18**：端口 5432，初始库 `youhui`，账号密码走 `.env`
- **Redis 8**：端口 6379

两者持久化用 named volume（`youhui_pg_data` / `youhui_redis_data`）。

> **不放 MinIO 进 docker-compose**：开发期 storage driver 用 `local-fs`（写 `./uploads/`），需要测 S3 协议时再 `docker run --rm minio/minio` 临时起。
> **不用 PG 存文件**：备份慢、不能流式、无 S3 协议；Storage 抽象层（阶段 5.4）才是正路。

写 `.env.example`（必须 commit）+ `.env`（gitignore）。

### 1.2 配置加载（zod 校验 env）(0.5d)

`src/config/index.ts`：
- 用 zod schema 校验所有环境变量（DATABASE_URL / REDIS_URL / JWT_SECRET / NODE_ENV / PORT 等）
- **启动时立即校验**，缺值/格式错直接 fail-fast
- 导出 `config` 对象（强类型），全项目从这里读配置
- **不准**直接用 `process.env.XXX`

### 1.3 目录骨架 (0.5d)

按 `docs/architecture.md` 的目录结构建空目录 + `.gitkeep`：
```
src/{config,db,modules,plugins,lib,types}
src/db/{schema,helpers}
src/db/schema/{system,codegen,monitor}
src/lib/storage
docs/{plan,adr}
scripts
```

更新 `tsconfig.json`：
- `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`
- `paths` 别名：`@/*` → `src/*`、`@db/*` → `src/db/*`

完善 `biome.json`：
- formatter（缩进 2 空格、行宽 100）
- linter 严格规则
- 集成到 `package.json` scripts：`lint` / `format` / `check`

### 1.4 Drizzle 接入 (1d)

安装：`drizzle-orm`、`drizzle-kit`、`postgres`（postgres.js 驱动）。

`drizzle.config.ts`：
- schema 路径：`./src/db/schema/**/*.ts`
- migrations 输出：`./drizzle`
- dialect: `postgresql`

`src/db/client.ts`：
- 创建 postgres.js 客户端（从 `config.database.url`）
- 创建 drizzle 实例并导出 `db`
- 导出类型 `DB = typeof db`

`src/db/schema/_shared.ts`：
- `auditColumns`：createdAt / updatedAt / createdBy / updatedBy / deletedAt（**不要 is_deleted**）
- 导出可被 spread 的对象
- 导出 helper：`tablePrefix`（如果要前缀）

写一张测试表 `src/db/schema/_smoke.ts`（仅 id + name），验证：
```bash
bun run db:generate   # 生成迁移
bun run db:push       # 应用到本地 pg
```

### 1.5 logger（pino）+ 优雅关停 (1d)

`src/lib/logger.ts`：
- pino + pino-pretty（开发环境）
- 结构化 JSON 日志（生产环境）
- 暴露 `logger.child({ reqId })` 子 logger 能力

`src/index.ts` 改造：
- 启动横幅：版本、端口、环境、连接的 DB/Redis 摘要
- `process.on('SIGINT' / 'SIGTERM')`：先停 Elysia → 关 DB pool → 关 Redis → 退出
- 启动失败立即退出（**不要静默失败**）

### 1.6 package.json scripts 统一 (0.5d)

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "check": "biome check --write .",
    "typecheck": "tsc --noEmit"
  }
}
```

## 学习重点

- **Drizzle 的"schema 即 TS 值"特性**——不是 class、不是装饰器，schema 是 const
- **drizzle-kit push vs generate**——开发期 push 即可，上生产前再切 generate
- **postgres.js 连接池配置**（max connections、idle timeout）
- **pino 的子 logger 链路**——为后续 `request-context` 铺垫
- **biome 比 eslint+prettier 快得多**——感受一下 DX

## 避雷

- ❌ 不要直接用 `process.env.XXX`，必须走 `config`
- ❌ 不要用 `is_deleted: tinyint`，软删用 `deletedAt: timestamp` 更具表达力
- ❌ `tsconfig.json` 不要保留 `strict: false` 留下的妥协
- ❌ 不要在 `src/db/schema/` 里写业务逻辑，schema 文件只声明表
- ⚠️ docker-compose 的 volume 命名要带项目前缀（如 `youhui_pg_data`），避免和其他项目冲突

## 验收清单

> 完成后逐项核对。**全部 ✅ 才能进下一阶段。**

### 基础设施
- [ ] `docker compose up -d` 一键起 pg + redis
- [ ] `docker compose down` 干净关停，volume 数据保留
- [ ] `.env.example` 包含所有必要变量，`.env` 已 gitignore

### 配置体系
- [ ] 启动时 zod 校验环境变量，缺值会 fail-fast 报具体错误
- [ ] 全项目 grep `process.env` 仅在 `src/config/` 里出现
- [ ] config 对象有完整类型推导

### 目录与代码风格
- [ ] 目录结构与 `docs/architecture.md` 一致
- [ ] `tsconfig.json` 严格模式开启（含 `noUncheckedIndexedAccess`）
- [ ] `bun run check` 通过（biome 无报错）
- [ ] `bun run typecheck` 通过

### Drizzle
- [ ] `drizzle.config.ts` 配置正确
- [ ] `src/db/client.ts` 导出 `db` 和 `DB` 类型
- [ ] `src/db/schema/_shared.ts` 含 `auditColumns`
- [ ] 测试表 `_smoke` 可通过 `db:push` 建表
- [ ] `bun run db:studio` 能可视化看到表

### 启动与关停
- [ ] `bun dev` 输出结构化日志（开发期 pretty 模式）
- [ ] 启动横幅显示版本、端口、环境
- [ ] Ctrl+C 优雅关停（先停 HTTP，再关连接池）
- [ ] 启动失败时进程立即退出（不静默）

### 端到端
- [ ] OpenAPI 文档 `http://localhost:3000/swagger` 可访问
- [ ] `GET /` 仍返回 "Hello Elysia"

## 完成标志

```bash
docker compose up -d
bun run db:push
bun dev
# 看到启动横幅 + 结构化日志
curl http://localhost:3000/      # Hello Elysia
open http://localhost:3000/swagger
# Ctrl+C 干净退出
```

## 本阶段收获（完成后填写）

> 完成后用一段话总结你学到了什么、踩了什么坑、对什么有了新理解。
