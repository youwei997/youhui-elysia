import type { AnyPgTable } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { pageFields } from "@/lib/pagination";

/**
 * 审计列黑名单：createInsertSchema / createUpdateSchema 直接从整张表派生时
 * 会把审计字段（createTime / createdBy / updateTime / updatedBy / deletedAt）
 * 一并暴露给前端，导致前端可篡改创建时间、反软删（清空 deletedAt）等。
 * 在各模块 schema.ts 中用 `.omit(auditKeys)` 统一排除。
 */
export const auditKeys = {
	id: true,
	createdBy: true,
	createTime: true,
	updatedBy: true,
	updateTime: true,
	deletedAt: true,
} as const;

/**
 * 创建列表查询 DTO：分页参数（复用 pageFields）+ 业务过滤字段
 * @param fields - 可选的业务查询字段，如 { username: z.string().optional() }
 */
export const createListQuery = <T extends AnyPgTable>(
	_table: T,
	fields?: Record<string, z.ZodType>,
) => {
	// 展开 pageFields 分页字段 + 业务字段，统一构造 schema
	// 用 z.object 而非 pageQuerySchema.extend(fields)，保证 TS 对字段类型正确推导
	return z.object({ ...pageFields, ...fields });
};

/**
 * 创建新增 DTO
 */
export const createInsertDto = <T extends AnyPgTable>(table: T) => {
	return createInsertSchema(table);
};

/**
 * 创建更新 DTO：所有字段可选
 */
export const createUpdateDto = <T extends AnyPgTable>(table: T) => {
	return createUpdateSchema(table);
};
