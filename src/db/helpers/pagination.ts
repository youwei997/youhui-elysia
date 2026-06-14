import { z } from "zod";

/** 分页查询参数（带默认值和上限） */
export const pageQuerySchema = z.object({
	/** 当前页码，从 1 开始 */
	page: z.coerce.number().int().positive().default(1),
	/** 每页条数，最大 100 */
	pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** 分页响应 */
export type PageResult<T> = {
	list: T[];
	total: number;
	page: number;
	pageSize: number;
};
