# 5.5 定时任务 · 设计文档

> 版本：v1.0（2026-07-12）
> 方法论：superpowers brainstorming
> 取代：`docs/plan/stage-5-modules.md` §5.5 原 pg-boss 方案

---

## 0. TL;DR

| 维度 | 决策 |
|---|---|
| 调度引擎 | **Bun 内置 `Bun.cron`**，零额外依赖 |
| pg-boss | ❌ 不用（为一个任务引入过度） |
| sys_job 表 + CRUD API | ❌ 不做（前端无对应页面，Java 原版也没有） |
| 第一版任务数 | 1 个：清理 30 天前操作日志（硬删） |
| IP 黑名单清理 | ❌ 不需要（Redis TTL 自动失效；DB 过期记录显示 bug 已在 commit `d50ae7d` 修复） |

---

## 1. 决策背景

### 1.1 Java 原版没有 job 管理模块

`youlai-boot` 只有：
- `framework/job/XxlJobConfig.java`：连接外部 XXL-JOB Admin 服务器（默认不启用）
- `system/handler/XxlJobSampleHandler.java`：一个打印 Hello World 的 demo handler
- `message/job/OnlineUserCountJob.java`：Spring `@Scheduled` 硬编码定时任务（SSE 在线用户统计）

无 `sys_job` 表，无 CRUD API，无 job 管理界面。

### 1.2 前端无 job 管理页面

`vue3-element-admin-v4.6.0` 中无 `views/system/job/` 和 `api/system/job/`。做了 CRUD API 也没有调用方。

### 1.3 IP 黑名单不需要定时清理

拦截逻辑走 Redis（`rate-limit.ts` 里 `redis.get(redisKeys.ipBlacklist(ip))`），封禁时 Redis key 带 TTL，到期自动失效，不需要定时清理。DB 层过期记录的显示 bug 已在 `d50ae7d` 通过查询过滤修复。

### 1.4 Bun 内置 cron，零依赖

Bun 1.x 内置 `Bun.cron`，支持标准 5 字段 cron 表达式及 `@daily` 等昵称，无需安装 pg-boss / croner / node-cron 等第三方包。

---

## 2. 实现范围

涉及文件共 **3 个**：

| 文件 | 操作 |
|---|---|
| `src/jobs/index.ts` | 新建：集中注册所有 `Bun.cron` 任务 |
| `src/modules/oper-log/queries.ts` | 追加：`cleanExpiredOperLogs` 函数 |
| `src/index.ts` | 追加一行：启动时调用 `startJobs()` |

---

## 3. 详细设计

### 3.1 `src/jobs/index.ts`

```ts
import { db } from "@/db/client";
import { cleanExpiredOperLogs } from "@/modules/oper-log/queries";

export const startJobs = () => {
    // 每天凌晨 3 点（UTC）硬删 30 天前的操作日志
    Bun.cron("0 3 * * *", async () => {
        const deleted = await cleanExpiredOperLogs(30, db);
        console.log(`[cron] 清理过期操作日志：${deleted} 条`);
    });
};
```

日后新增任务直接在此文件追加 `Bun.cron(...)` 即可。

### 3.2 `cleanExpiredOperLogs(retentionDays, db)`

```ts
export const cleanExpiredOperLogs = async (
    retentionDays: number,
    db: DB,
): Promise<number> => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const result = await db
        .delete(sysOperLog)
        .where(lt(sysOperLog.createTime, cutoff))
        .returning({ id: sysOperLog.id });
    return result.length;
};
```

- **物理删除**（硬删，不走软删）—— 对齐 `docs/notes/2026-06-29-oper-log-物理删除策略.md`
- 返回删除条数，供日志输出

### 3.3 `src/index.ts`

```ts
import { startJobs } from "@/jobs";
// ...existing code...
startJobs();
```

---

## 4. 关键设计点

- **时区**：`Bun.cron` 进程内模式使用 UTC。`0 3 * * *` = UTC 03:00 = 北京时间 11:00。日志清理对执行时间不敏感，UTC 可接受。
- **无重叠保证**：回调（含 Promise）完成后才计算下次触发，不会并发执行同一任务。
- **进程重启**：cron 随 `startJobs()` 重新注册，无需持久化。
- **错误处理**：handler 内 Promise 拒绝触发 `process.on("unhandledRejection")`，项目已有全局监听，不需额外包装。
- **`bun --hot`**：热重载时 cron 自动停止再重注册（Bun 内置行为）。

---

## 5. 测试策略

`cleanExpiredOperLogs` 单测：
1. 插入一条 `createTime = 31 天前` 的 oper_log 记录
2. 调用 `cleanExpiredOperLogs(30, db)`
3. 断言返回值为 `1`，且该记录已从 DB 消失

`startJobs` 本身不单测（cron 触发属于 Bun 内部，不测框架行为）。

---

## 6. 已知天花板与扩展路径

```
ponytail: 当前只支持硬编码任务配置（cron 表达式写死在代码里）。
          若需运行时动态调整 cron / 暂停 / 手动触发，升级路径：
          引入 pg-boss + sys_job 表 + CRUD API，startJobs() 改为从 DB 读取配置注册。
```

---

## 7. 验收清单

- [ ] `startJobs()` 启动后控制台可见 cron 注册
- [ ] `cleanExpiredOperLogs` 单测通过（插入 31 天前记录，删后返回 1）
- [ ] `bun run tsc` + `bun run check` 通过
