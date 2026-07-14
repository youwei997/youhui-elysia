import {
	bigint,
	pgTable,
	smallint,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统租户表（平台级配置表）
 *
 * 与 Java 原版对齐：不含软删和创建人/更新人追踪，只保留 create_time/update_time。
 * tenantId=0 为平台租户（系统运行基础），不可删除/禁用。
 */
export const sysTenant = pgTable("sys_tenant", {
	/** 主键 ID（0=平台租户） */
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	/** 租户名称 */
	name: varchar("name", { length: 128 }).notNull(),
	/** 租户编码（全局唯一，平台级定义） */
	code: varchar("code", { length: 64 }).notNull().unique(),
	/** 联系人 */
	contactName: varchar("contact_name", { length: 64 }),
	/** 联系电话 */
	contactPhone: varchar("contact_phone", { length: 32 }),
	/** 联系邮箱 */
	contactEmail: varchar("contact_email", { length: 128 }),
	/** 租户域名（全局唯一，用于域名路由） */
	domain: varchar("domain", { length: 128 }).unique(),
	/** Logo URL */
	logo: varchar("logo", { length: 255 }),
	/** 关联套餐 ID */
	planId: bigint("plan_id", { mode: "number" }),
	/** 状态（1-正常 0-停用） */
	status: smallint("status").default(1).notNull(),
	/** 备注 */
	remark: varchar("remark", { length: 255 }),
	/** 过期时间 */
	expireTime: timestamp("expire_time", { withTimezone: true, mode: "string" }),
	/** 创建时间（对齐 Java 原版 create_time） */
	createTime: timestamp("create_time", { withTimezone: true, mode: "string" })
		.defaultNow()
		.notNull(),
	/** 更新时间（对齐 Java 原版 update_time） */
	updateTime: timestamp("update_time", { withTimezone: true, mode: "string" })
		.defaultNow()
		.notNull(),
});
