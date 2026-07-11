# 5.5 定时任务实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 使用 Bun 内置 `Bun.cron`，每天凌晨 3 点（UTC）硬删 30 天前的操作日志。

**架构：** `cleanExpiredOperLogs` 函数追加到现有 `oper-log/queries.ts`；`src/jobs/index.ts` 新建，集中注册所有 Bun.cron 任务；`src/index.ts` 启动时调用 `startJobs()`。

**技术栈：** Bun 内置 `Bun.cron`（零额外依赖）、Drizzle ORM `delete + lt`、`bun:test`

**设计文档：** [`docs/plan/stage-5.5-cron.md`](./stage-5.5-cron.md)

---

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/modules/oper-log/queries.ts` | 追加函数 | 新增 `cleanExpiredOperLogs` |
| `src/modules/test/cron-jobs.test.ts` | 新建 | `cleanExpiredOperLogs` 单测 |
| `src/jobs/index.ts` | 新建 | 注册 `Bun.cron` 任务 |
| `src/index.ts` | 追加一行 | 启动时调用 `startJobs()` |

---

## 任务 1：`cleanExpiredOperLogs` — TDD

**文件：**
- 修改：`src/modules/oper-log/queries.ts`
- 新建：`src/modules/test/cron-jobs.test.ts`

### - [ ] 步骤 1：写失败测试

新建 `src/modules/test/cron-jobs.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { cleanExpiredOperLogs } from "@/modules/oper-log/queries";

/** 测试专用标记，避免污染真实数据 */
const TEST_MODULE = "__test_cron_jobs__";

const cleanUp = async () => {
    await db.delete(sysOperLog).where(eq(sysOperLog.module, TEST_MODULE));
};

describe("cron jobs", () => {
    beforeAll(cleanUp);
    afterAll(cleanUp);

    test("cleanExpiredOperLogs 删除超过保留期的记录并返回条数", async () => {
        const now = Date.now();
        const ago31d = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
        const ago29d = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString();

        // 插入：31 天前（应被删）+ 29 天前（应保留）
        await db.insert(sysOperLog).values([
            {
                module: TEST_MODULE,
                action: "old",
                method: "GET",
                url: "/test",
                status: 1,
                createTime: ago31d,
            },
            {
                module: TEST_MODULE,
                action: "recent",
                method: "GET",
                url: "/test",
                status: 1,
                createTime: ago29d,
            },
        ]);

        const deleted = await cleanExpiredOperLogs(30, db);

        // 返回值：只删了 1 条
        expect(deleted).toBe(1);

        // 验证：31 天前的记录已删
        const remaining = await db
            .select({ action: sysOperLog.action })
            .from(sysOperLog)
            .where(eq(sysOperLog.module, TEST_MODULE));

        expect(remaining).toHaveLength(1);
        expect(remaining[0]?.action).toBe("recent");
    });
});
```

### - [ ] 步骤 2：确认测试红灯

```bash
cd H:/project/admin/elysia-vue-admin/youhui-elysia
bun test src/modules/test/cron-jobs.test.ts
```

预期：**FAIL**，报错 `cleanExpiredOperLogs is not a function` 或导入错误。

### - [ ] 步骤 3：实现 `cleanExpiredOperLogs`

在 `src/modules/oper-log/queries.ts` 末尾追加（`lt` 已在第 1 行 import，无需修改 import）：

```ts
/**
 * 清理过期操作日志（物理删除）
 *
 * 删除 createTime < now - retentionDays 天 的记录，返回删除条数。
 * 对齐 docs/notes/2026-06-29-oper-log-物理删除策略.md：oper_log 不走软删，定时硬删。
 */
export const cleanExpiredOperLogs = async (
    retentionDays: number,
    db: DB,
): Promise<number> => {
    const cutoff = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = await db
        .delete(sysOperLog)
        .where(lt(sysOperLog.createTime, cutoff))
        .returning({ id: sysOperLog.id });
    return result.length;
};
```

### - [ ] 步骤 4：确认测试绿灯

```bash
bun test src/modules/test/cron-jobs.test.ts
```

预期：**PASS**，1 个测试通过。

### - [ ] 步骤 5：全量回归

```bash
bun test
```

预期：所有测试通过，无新增失败。

### - [ ] 步骤 6：类型检查 + lint

```bash
bun run tsc && bun run check
```

预期：无错误，无 lint 修改。

### - [ ] 步骤 7：Commit

```bash
git add src/modules/oper-log/queries.ts src/modules/test/cron-jobs.test.ts
git commit -m "feat(cron): cleanExpiredOperLogs 硬删过期操作日志 + 单测"
```

---

## 任务 2：注册 `Bun.cron` + 接入启动入口

**文件：**
- 新建：`src/jobs/index.ts`
- 修改：`src/index.ts`

### - [ ] 步骤 1：新建 `src/jobs/index.ts`

```ts
import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { cleanExpiredOperLogs } from "@/modules/oper-log/queries";

/**
 * 注册所有定时任务（Bun 内置 cron，进程内模式，UTC 时区）
 *
 * 新增任务直接在此函数内追加 Bun.cron(...)。
 * 扩展路径：若需运行时动态配置，引入 pg-boss + sys_job 表替换此方案。
 */
export const startJobs = () => {
    // 每天凌晨 3 点（UTC）硬删 30 天前的操作日志
    Bun.cron("0 3 * * *", async () => {
        const deleted = await cleanExpiredOperLogs(30, db);
        logger.info({ deleted }, "[cron] 清理过期操作日志完成");
    });

    logger.info("[cron] 定时任务已注册");
};
```

### - [ ] 步骤 2：修改 `src/index.ts`，启动时调用 `startJobs()`

在现有文件中，`app.listen(config.PORT)` 之后追加导入和调用：

```ts
import { app } from "@/app";
import { config } from "@/config";
import { db } from "@/db/client";
import { logger } from "@/lib/logger";
import { startJobs } from "@/jobs";          // ← 新增

app.listen(config.PORT);
startJobs();                                  // ← 新增

// 启动横幅：端口、环境、数据库地址（密码用 *** 隐藏）
logger.info(
    {
        port: config.PORT,
        env: config.NODE_ENV,
        db: config.DATABASE_URL.replace(/\/\/.*@/, "//***@"),
    },
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

/** 优雅关停：先停 HTTP 服务，再关闭数据库连接池，最后退出进程 */
const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, "收到关闭信号，开始优雅关停...");
    try {
        app.server?.stop();
        await db.$client.end();
        logger.info("服务已干净关闭");
        process.exit(0);
    } catch (err) {
        logger.error({ err }, "关停过程出错");
        process.exit(1);
    }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
```

### - [ ] 步骤 3：类型检查 + lint

```bash
bun run tsc && bun run check
```

预期：无错误。

### - [ ] 步骤 4：烟雾测试（启动验证）

```bash
bun run dev
```

在启动日志中确认出现：

```
[cron] 定时任务已注册
```

确认后 `Ctrl+C` 退出。

### - [ ] 步骤 5：Commit

```bash
git add src/jobs/index.ts src/index.ts
git commit -m "feat(cron): 注册 Bun.cron 定时任务，startJobs 接入启动入口"
```

---

## 任务 3：更新阶段文档

**文件：**
- 修改：`docs/plan/stage-5-modules.md`（验收清单勾选）
- 修改：`docs/plan/README.md`（进度日志）

### - [ ] 步骤 1：勾选 stage-5-modules.md 验收清单

将 `docs/plan/stage-5-modules.md` 中定时任务验收清单的三项 `- [ ]` 改为 `- [x]`：

```markdown
### 定时任务
- [x] `Bun.cron` 注册成功，启动日志可见
- [x] `cleanExpiredOperLogs` 单测通过（插入 31 天前记录，删后返回 1）
- [x] `bun run tsc` + `bun run check` 通过
```

### - [ ] 步骤 2：追加 README.md 进度日志

在 `docs/plan/README.md` 进度日志末尾追加一行（保持与现有格式一致）：

```
[2026-07-12] 阶段 5.5 完成。Bun 内置 cron 接入（零依赖），cleanExpiredOperLogs 硬删 30 天前操作日志，startJobs 启动时注册。放弃 pg-boss（Java 原版无 job 管理、前端无页面）。阶段 5 全部完成。
```

同时将 README.md 进度看板中阶段 5 的状态从 `🟡 进行中` 改为 `✅ 已完成`。

### - [ ] 步骤 3：Commit

```bash
git add docs/plan/stage-5-modules.md docs/plan/README.md
git commit -m "docs(plan): 5.5 定时任务完成，阶段 5 全部收尾"
```
