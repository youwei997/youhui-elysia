import { timestamp, bigint } from "drizzle-orm/pg-core";

/**
 * 通用审计字段 mixin（所有业务表必须 spread 此对象）
 * 使用 deletedAt（timestamp）而非 is_deleted（boolean），语义更明确且可保留删除时间
 */
export const auditColumns = {
  /** 创建人 ID */
  createdBy: bigint("created_by", { mode: "number" }),
  /** 创建时间 */
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** 更新人 ID */
  updatedBy: bigint("updated_by", { mode: "number" }),
  /** 更新时间 */
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  /** 删除时间（非空 = 已删除），语义优于 is_deleted */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};