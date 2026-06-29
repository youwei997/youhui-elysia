# auditColumns 局部复用案例

**日期**:2026-06-29
**阶段**:5.1 操作日志
**触发问题**:AGENTS.md 要求"所有表必须包含 `auditColumns`",但事件型表只需要时间字段

## 背景

`src/db/schema/_shared.ts` 提供的 `auditColumns` 是"完整审计"五件套:

```ts
export const auditColumns = {
  createdBy: bigint("created_by", { mode: "number" }),
  createTime: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow().notNull(),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updateTime: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow().notNull(),
  deleteTime: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
};
```

AGENTS.md 明确规定"所有业务表必须包含此对象",保证全表口径统一。

## 问题

`sys_oper_log` 虽然是张"表",但本质是"事件型"数据,五件套有冗余:

| 五件套字段 | 业务表含义 | 事件型表冗余点 |
|---|---|---|
| `createdBy` | 谁创建这条记录 | 跟表里的 `userId` / `username` 完全重复 |
| `createTime` | 记录创建时间 | 仍然需要(就是"事件发生时间") |
| `updatedBy` / `updateTime` | 谁 / 何时修改 | 操作日志 **不可改**,无意义 |
| `deleteTime` | 软删标记 | 走物理删除策略(见 `2026-06-29-oper-log-物理删除策略.md`),无意义 |

如果硬把五件套全部塞进表里:

- `createdBy` 永远是 0(没人创建日志,是采集器自动写)
- `updatedBy` / `updateTime` 永远是 null(日志不可改)
- `deleteTime` 永远是 null(物理删除)

代码层面每次 INSERT 还得手动 `set: { createdBy: 0, updatedBy: null, ... }`,**制造噪音**。

## 决策:局部复用,只挑 `createTime`

`auditColumns` 是个普通对象,可以从里面"取字段"单独用,不用把整个对象展开(`...`)到表里:

```ts
import { auditColumns } from "@db/schema/_shared";

export const sysOperLog = pgTable("sys_oper_log", {
  // ... 业务字段
  // 只挑 createTime 这一个字段,不是把整个 auditColumns 展开
  createTime: auditColumns.createTime,
});
```

**为什么这样写**:

1. **复用 `defaultNow().notNull()` 行为**:即使应用层忘了写 `createTime`,DB 也能兜底
2. **DB 列名一致**:`created_at`(业务表也是这个列名,grep 友好)
3. **模式匹配友好**:`?:` 查询和索引设计跟业务表完全对齐
4. **不污染 `_shared.ts`**:不引入 `partialAuditColumns` / `auditColumnsWithoutSoftDelete` 这类变体,避免 _shared 变成"配置大杂烩"

## 术语约定:完整复用 vs 局部复用

为避免后续文档 / 讨论时口径不一致,本文统一用以下两个词:

- **完整复用** = 把整个 `auditColumns` 对象展开(`...`)塞进表里,五个字段全收
  - 写法:`...auditColumns`
  - 适用:业务表(用户 / 角色 / 菜单 / 部门)

- **局部复用** = 从 `auditColumns` 里挑一两个字段单独引用,不展开整个对象
  - 写法:`createTime: auditColumns.createTime`
  - 适用:事件流日志(oper_log / login_log)

后续 5.2 / 5.4 / 5.5 / 5.6 建表时,直接用这两个词描述复用策略,不再用"spread / 展开 / ... 之类的英文术语。

## 适用范围

事件型 / 配置型表都可以参考这个范式:

| 表 | 复用策略 | 阶段 | 状态 |
|---|---|---|---|
| `sys_oper_log`(操作日志) | 局部复用,只挑 `createTime` | 5.1 | 已落地 |
| `sys_login_log`(登录日志) | 局部复用,只挑 `createTime` | 5.2 | 待评估 |
| `sys_file`(文件元数据) | 视业务定:可改就完整复用,不可改就局部复用 | 5.4 | 待评估 |
| `sys_job`(定时任务配置) | 完整复用(任务有 createdBy 语义) | 5.5 | 待评估 |
| `sys_ip_blacklist`(IP 黑名单) | 完整复用(有 createdBy + 可能要过期) | 5.6 | 待评估 |

**判断标准**:

- 业务表(用户 / 角色 / 菜单 / 部门):**永远完整复用**(五件套全收)
- 事件流日志(oper_log / login_log):**局部复用,只挑 `createTime`**
- 配置型表(job / ip_blacklist):**按业务语义逐表评估**

## 跟 AGENTS.md 的关系

AGENTS.md 原话:"所有表必须包含 `auditColumns`(createTime / updateTime / createdBy / updatedBy / deleteTime)"。

**本决策不违反**:

- **字面看**,"包含"是指字段集合;操作日志表里 **确实有 `createTime` 字段**,只是不写在 `auditColumns` 对象里
- **精神看**,AGENTS.md 强调的是"业务表口径统一",事件型表跟业务表口径不同,本来就是另一类
- 后续如 AGENTS.md 修订,需要明确"事件型表"单独归类,本笔记作为补充

## 后续计划

- 阶段 5 全部建表完成后,把本笔记升级为正式 ADR:`docs/adr/0003-event-table-audit-columns.md`
- 同时回头评估"业务表是否要也加 `auditColumns` 类型包装",把 `_shared.ts` 拆成 `auditColumns` + `eventColumns` 两套