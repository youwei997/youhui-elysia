import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysLoginLog } from "@/db/schema/system/login-log";
import { createListQuery } from "@/lib/crud-dto";

/** 登录日志列表查询参数 */
export const LoginLogListQuery = createListQuery(sysLoginLog, {
	username: z.string().optional().describe("用户名（模糊匹配）"),
	status: z.string().optional().describe("状态：success-成功 fail-失败"),
	startTime: z.string().optional().describe("起始时间（ISO 字符串）"),
	endTime: z.string().optional().describe("结束时间（ISO 字符串）"),
}).describe("登录日志列表查询参数");

/** 登录日志响应 schema（排除 ipRegion 预留字段） */
export const LoginLogResponse = createSelectSchema(sysLoginLog)
	.omit({
		ipRegion: true,
	})
	.describe("登录日志信息");