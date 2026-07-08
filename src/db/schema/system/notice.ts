import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	pgTable,
	smallint,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统通知公告表
 * 草稿期保存公告内容，发布后由业务层写入 publisherId / publishTime / publishStatus。
 */
export const sysNotice = pgTable("sys_notice", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 公告标题 */
	title: varchar("title", { length: 128 }).notNull(),
	/** 公告内容 */
	content: varchar("content", { length: 5000 }).notNull(),
	/** 公告类型（预留，和前端保持数字枚举） */
	type: smallint("type").default(0).notNull(),
	/** 发布人 ID */
	publisherId: bigint("publisher_id", { mode: "number" }),
	/** 公告等级：L/M/H */
	level: varchar("level", { length: 1 }).default("M").notNull(),
	/** 目标类型：1=全部 2=指定 */
	targetType: smallint("target_type").default(1).notNull(),
	/** 指定用户 ID 列表，草稿期暂存逗号串 */
	targetUserIds: varchar("target_user_ids", { length: 2000 })
		.default("")
		.notNull(),
	/** 发布状态：0=草稿 1=已发布 -1=已撤回 */
	publishStatus: smallint("publish_status").default(0).notNull(),
	/** 发布时间 */
	publishTime: timestamp("publish_time", {
		withTimezone: true,
		mode: "string",
	}),
	/** 撤回时间 */
	revokeTime: timestamp("revoke_time", { withTimezone: true, mode: "string" }),

	...auditColumns,
});

/**
 * 系统用户通知关联表
 * 发布时按用户物化，一条记录表示某用户收到某公告。
 */
export const sysUserNotice = pgTable("sys_user_notice", {
	/** 主键 ID */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 公告 ID */
	noticeId: bigint("notice_id", { mode: "number" }).notNull(),
	/** 用户 ID */
	userId: bigint("user_id", { mode: "number" }).notNull(),
	/** 是否已读：0=未读 1=已读 */
	isRead: smallint("is_read").default(0).notNull(),
	/** 读取时间 */
	readTime: timestamp("read_time", { withTimezone: true, mode: "string" }),

	...auditColumns,
});
