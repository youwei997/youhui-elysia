import { z } from "zod";

/**
 * 分页字段的 raw zod shape（pageNum + pageSize）
 * 单一来源：crud-dto.createListQuery 和 pageQuerySchema 都基于它构建，避免默认值/上限重复定义。
 */
export const pageFields = {
	/** 当前页码，从 1 开始 */
	pageNum: z.coerce.number().int().positive().default(1),
	/** 每页条数，最大 100 */
	pageSize: z.coerce.number().int().positive().max(100).default(20),
} as const;

/** 分页查询参数（pageFields 的完整 schema，供独立场景使用） */
export const pageQuerySchema = z.object(pageFields);

/** 分页响应 */
export type PageResult<T> = {
	list: T[];
	total: number;
};
