import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统操作日志表(事件型,无软删 / 不可改)
 *
 * 设计要点:
 * - 数据来源:audit-log plugin 在 onAfterHandle / onError 异步落库
 * - 清理策略:阶段 5.5 定时任务物理删除过期数据
 * - 误删保护:依赖 PostgreSQL 定期 pg_dump 备份(本表不进入软删)
 * - 物理删除策略详见 docs/notes/2026-06-29-oper-log-物理删除策略.md
 *
 * 字段策略:
 * - 元数据(谁 / 什么 / 何时 / 何状态 / 失败原因)全量存
 * - requestParams:仅 POST / PUT / PATCH 存,4KB 截断 + 脱敏
 * - responseResult:仅失败请求存,4KB 截断;成功请求不写
 * - 时间字段:局部复用 auditColumns.createTime,详见 docs/notes/2026-06-29-auditColumns-局部复用案例.md
 */
export const sysOperLog = pgTable(
	"sys_oper_log",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
		/** 租户 ID */
		tenantId: bigint("tenant_id", { mode: "number" }).default(0).notNull(),

		/** 操作用户 ID(未登录 / 匿名请求为 0) */
		userId: bigint("user_id", { mode: "number" }).default(0).notNull(),
		/** 操作用户名(冗余存储,避免 join user 表) */
		username: varchar("username", { length: 64 }).default(""),

		/** 业务模块(如 'user' / 'role' / 'menu') */
		module: varchar("module", { length: 32 }).notNull(),
		/** 业务动作(如 'create' / 'update' / 'delete' / 'import') */
		action: varchar("action", { length: 32 }).notNull(),

		/** HTTP 方法 */
		method: varchar("method", { length: 8 }).notNull(),
		/** 请求 URL(含 query) */
		url: varchar("url", { length: 512 }).notNull(),

		/** 客户端 IP */
		ip: varchar("ip", { length: 64 }),
		/** IP 归属地(预留字段,阶段 6+ 接入离线库) */
		ipRegion: varchar("ip_region", { length: 64 }),
		/** User-Agent */
		userAgent: varchar("user_agent", { length: 512 }),

		/** 请求参数(jsonb,仅 POST / PUT / PATCH 存,4KB 截断 + 脱敏) */
		requestParams: jsonb("request_params").$type<Record<string, unknown>>(),
		/** 响应结果(jsonb,仅失败请求存,4KB 截断;成功不写) */
		responseResult: jsonb("response_result").$type<Record<string, unknown>>(),

		/** 状态(1=成功 0=失败) */
		status: smallint("status").notNull(),
		/** 失败时的异常信息(exception.getMessage()) */
		errorMsg: text("error_msg"),
		/** 耗时(毫秒) */
		costMs: integer("cost_ms").default(0).notNull(),

		/**
		 * 事件发生时间(局部复用 auditColumns.createTime 字段)
		 * 业务表关心"谁创建 / 谁修改",事件型表只关心"什么时候发生"
		 * 不写 createdBy / updatedBy / updateTime / deleteTime:
		 * - createdBy 与 userId 重复
		 * - 日志不可改,无需 update 列
		 * - 物理删除策略,无需 deleteTime
		 */
		createTime: auditColumns.createTime,
	},
	(table) => ({
		/** 用户维度查询:某用户最近的操作 */
		userIdIdx: index("idx_oper_log_user_id").on(table.userId),
		/** 时间维度:清理任务按时间窗口删 / 列表按时间倒序 */
		createTimeIdx: index("idx_oper_log_create_time").on(table.createTime),
		/** 模块 + 动作维度:某模块某动作的操作流水 */
		moduleActionIdx: index("idx_oper_log_module_action").on(
			table.module,
			table.action,
		),
	}),
);
