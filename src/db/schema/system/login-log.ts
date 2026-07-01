import { auditColumns } from "@db/schema/_shared";
import { bigint, index, pgTable, text, varchar } from "drizzle-orm/pg-core";

/**
 * 系统登录日志表（事件型，物理删除）
 *
 * 设计要点：
 * - 数据来源：auth/routes.ts 在登录成功/失败处手动写入
 * - 清理策略：阶段 5.5 定时任务物理删除过期数据
 * - 字段 browser / os 暂未实现解析（从 user-agent 解析浏览器/OS 需要额外库），
 *   第一版存空字符串，ponytail: 接入 ua-parser-js 等库时填充
 */
export const sysLoginLog = pgTable(
	"sys_login_log",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

		/** 用户 ID（未登录请求为 0） */
		userId: bigint("user_id", { mode: "number" }).default(0).notNull(),
		/** 用户名（冗余存储，避免 join） */
		username: varchar("username", { length: 64 }).default(""),

		/** 客户端 IP */
		ip: varchar("ip", { length: 64 }),
		/** IP 归属地（预留字段，阶段 6+ 接入离线库） */
		ipRegion: varchar("ip_region", { length: 64 }),
		/** User-Agent */
		userAgent: varchar("user_agent", { length: 512 }),

		/** 浏览器类型（ponytail: 暂未解析，留待后续从 user-agent 解析） */
		browser: varchar("browser", { length: 64 }).default(""),
		/** 操作系统（ponytail: 同上） */
		os: varchar("os", { length: 64 }).default(""),

		/** 状态：success-成功 fail-失败 */
		status: varchar("status", { length: 16 }).notNull(),
		/** 失败时的异常信息 */
		errorMsg: text("error_msg"),

		/** 登录时间（局部复用 auditColumns.createTime） */
		createTime: auditColumns.createTime,
	},
	(table) => ({
		/** 用户维度查询 */
		userIdIdx: index("idx_login_log_user_id").on(table.userId),
		/** 时间维度查询 */
		createTimeIdx: index("idx_login_log_create_time").on(table.createTime),
	}),
);