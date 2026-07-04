import { Elysia } from "elysia";
import { db } from "@/db/client";
import { ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	deleteOperLogById,
	deleteOperLogsBefore,
	findOperLogs,
} from "./queries";
import {
	OperLogBatchDeleteBody,
	OperLogListQuery,
	OperLogParamsWithId,
	OperLogResponse,
	type OperLogResponseInput,
} from "./schema";

/** 响应转换：id 保持 number，对齐前端 LogItem.id: number */
const parseLog = (log: OperLogResponseInput) => {
	const parsed = OperLogResponse.parse(log);
	return {
		...parsed,
		id: parsed.id,
	};
};

export const operLogRoutes = new Elysia({ prefix: "/api/v1/oper-logs" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const result = await findOperLogs(query, db);
			return {
				...result,
				list: result.list.map((log) => parseLog(log)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:oper-log:query"],
			query: OperLogListQuery,
			detail: {
				tags: ["OperLog"],
				summary: "操作日志列表（分页）",
				description:
					"支持 username 模糊搜索、module 精确筛选、status 和时间范围筛选，按 createTime 倒序",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const deleted = await deleteOperLogById(params.id, db);
			if (!deleted) {
				throw notFound(ERR_CODE.OPER_LOG_NOT_FOUND);
			}
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:oper-log:delete"],
			params: OperLogParamsWithId,
			detail: {
				tags: ["OperLog"],
				summary: "删除操作日志（硬删）",
				description: "操作日志不走软删，DELETE 直接物理删除",
			},
		},
	)
	.post(
		"/batch-delete",
		async ({ body }) => {
			const deletedCount = await deleteOperLogsBefore(body.beforeTime, db);
			return { count: deletedCount };
		},
		{
			auth: true,
			requirePerm: ["sys:oper-log:delete"],
			body: OperLogBatchDeleteBody,
			detail: {
				tags: ["OperLog"],
				summary: "批量清理操作日志（按时间）",
				description: "删除 beforeTime 之前的所有日志，用于定时清理任务调用",
			},
		},
	);
