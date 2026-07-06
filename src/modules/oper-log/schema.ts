import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysOperLog } from "@/db/schema/system/oper-log";
import { createListQuery } from "@/lib/crud-dto";

/**
 * 操作日志列表查询参数
 *
 * 与业务表不同，oper-log 没有软删字段，
 * 不需要 isNull(deleteTime) 过滤，列表查询直接按时间倒序返回。
 */
export const OperLogListQuery = createListQuery(sysOperLog, {
	keywords: z.string().optional().describe("关键字（操作人 / IP 模糊匹配）"),
	module: z.string().optional().describe("业务模块（精确匹配）"),
	status: z.coerce.number().int().optional().describe("状态：1-成功 0-失败"),
	createTime: z
		.tuple([z.string(), z.string()])
		.optional()
		.describe("操作时间范围 [起始, 结束]（YYYY-MM-DD）"),
}).describe("操作日志列表查询参数");

/**
 * 趋势统计查询参数
 */
export const AnalyticsTrendQuery = z
	.object({
		startDate: z.string().describe("起始日期（YYYY-MM-DD）"),
		endDate: z.string().describe("结束日期（YYYY-MM-DD）"),
	})
	.describe("访问趋势查询参数");

/**
 * 操作日志响应 schema（对齐前端 LogItem 字段名）
 *
 * 后端列名与前端 LogItem 不一致，这里用 transform 做映射：
 * action→actionType、userId→operatorId、username→operatorName、
 * url→requestUri、method→requestMethod、costMs→executionTime、ipRegion→region。
 * title/content/device/browser/os 后端无对应列，留空（前端 optional，JSON 序列化自动省略）。
 */
export const OperLogResponse = createSelectSchema(sysOperLog)
	.transform((r) => ({
		/** 日志ID */
		id: r.id,
		/** 模块 */
		module: r.module,
		/** 操作类型 */
		actionType: r.action,
		/** 操作标题（oper-log 无此列，留空） */
		title: undefined,
		/** 自定义日志内容（oper-log 无此列，留空） */
		content: undefined,
		/** 操作人ID */
		operatorId: r.userId,
		/** 操作人名称 */
		operatorName: r.username,
		/** 请求路径 */
		requestUri: r.url,
		/** 请求方法 */
		requestMethod: r.method,
		/** IP地址 */
		ip: r.ip,
		/** 地区 */
		region: r.ipRegion,
		/** 设备（oper-log 仅存 userAgent，未解析，留空） */
		device: undefined,
		/** 浏览器（同上，留空） */
		browser: undefined,
		/** 操作系统（同上，留空） */
		os: undefined,
		/** 状态：0失败 1成功 */
		status: r.status,
		/** 执行时间(毫秒) */
		executionTime: r.costMs,
		/** 错误信息 */
		errorMsg: r.errorMsg,
		/** 操作时间 */
		createTime: r.createTime,
	}))
	.describe("操作日志信息（对齐前端 LogItem）");

/** OperLogResponse.parse 的输入类型 */
export type OperLogResponseInput = z.input<typeof OperLogResponse>;
