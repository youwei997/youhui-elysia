import type { AnyPgTable } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";

/**
 * 创建列表查询 DTO：分页参数 + 业务过滤字段
 * @param fields - 可选的业务查询字段，如 { username: z.string().optional() }
 */
export const createListQuery = <T extends AnyPgTable>(
	_table: T,
	fields?: Record<string, z.ZodType>,
) => {
	return z.object({
		page: z.coerce.number().int().positive().default(1),
		pageSize: z.coerce.number().int().positive().max(100).default(20),
		...fields,
	});
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
