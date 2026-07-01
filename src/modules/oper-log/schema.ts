import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { createListQuery } from "@/lib/crud-dto";

/**
 * 操作日志列表查询参数
 *
 * 与 role/dept 等业务表不同，oper-log 没有软删字段，
 * 不需要 isNull(deleteTime) 过滤，列表查询直接按时间倒序返回。
 */
export const OperLogListQuery = createListQuery(sysOperLog, {
	username: z.string().optional().describe("操作用户名（模糊匹配）"),
	module: z.string().optional().describe("业务模块（精确匹配）"),
	status: z.coerce.number().int().optional().describe("状态：1-成功 0-失败"),
	startTime: z.string().optional().describe("起始时间（ISO 字符串）"),
	endTime: z.string().optional().describe("结束时间（ISO 字符串）"),
}).describe("操作日志列表查询参数");

/**
 * 操作日志响应 schema
 *
 * 排除无意义的字段（ipRegion 预留暂不返回），
 * id 从 number 转 string 与其他模块保持一致。
 */
export const OperLogResponse = createSelectSchema(sysOperLog)
	.omit({
		ipRegion: true,
	})
	.describe("操作日志信息");

/** 操作日志 ID 路径参数 */
export const OperLogParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("操作日志 ID 路径参数");

/** 批量清理请求体：按时间清理此时间之前的日志 */
export const OperLogBatchDeleteBody = z
	.object({
		beforeTime: z.string().describe("清理此时间之前的日志（ISO 字符串），必传"),
	})
	.describe("批量清理操作日志请求体");
