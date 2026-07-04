import { and, count, desc, eq, gte, like, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { escapeLike } from "@/db/helpers/like";
import { sysLoginLog } from "@/db/schema/system/login-log";
import type { PageResult } from "@/lib/pagination";
import type { LoginLogRecord } from "./types";

/**
 * 登录日志列表查询
 *
 * 与 oper-log 类似，事件型表无软删，按 createTime 倒序。
 */
export const findLoginLogs = async (
	query: {
		pageNum: number;
		pageSize: number;
		username?: string;
		status?: string;
		startTime?: string;
		endTime?: string;
	},
	db: DB,
): Promise<PageResult<LoginLogRecord>> => {
	const where = [];

	if (query.username) {
		where.push(like(sysLoginLog.username, `%${escapeLike(query.username)}%`));
	}
	if (query.status) {
		where.push(eq(sysLoginLog.status, query.status));
	}
	if (query.startTime) {
		where.push(gte(sysLoginLog.createTime, query.startTime));
	}
	if (query.endTime) {
		where.push(lte(sysLoginLog.createTime, query.endTime));
	}

	const whereClause = where.length > 0 ? and(...where) : undefined;

	const list = await db
		.select()
		.from(sysLoginLog)
		.where(whereClause)
		.orderBy(desc(sysLoginLog.createTime))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysLoginLog)
		.where(whereClause);

	return { list, total };
};
