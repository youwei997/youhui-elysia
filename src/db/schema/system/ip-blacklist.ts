import { auditColumns } from "@db/schema/_shared";
import { bigint, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * IP 黑名单表
 *
 * 登录失败超限后自动加入，管理员也可手动添加。
 * 黑名单有过期时间（expireAt），到期后自动失效（由定时任务清理）。
 */
export const sysIpBlacklist = pgTable("sys_ip_blacklist", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

	/** 被封禁的 IP */
	ip: varchar("ip", { length: 64 }).notNull(),
	/** 封禁原因（如 "登录失败超限"、"手动添加"） */
	reason: text("reason"),
	/** 解封时间（null 表示永久封禁） */
	expireAt: timestamp("expire_at", { withTimezone: true, mode: "string" }),

	...auditColumns,
});
