import { and, count, desc, eq, gte, like, lt, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysOperLog } from "@/db/schema/system/oper-log";
import type { PageResult } from "@/lib/pagination";
import type { OperLogRecord } from "./types";

/**
 * 操作日志列表查询
 *
 * 与业务表不同，oper-log 是事件型表，无软删，不需要 isNull(deleteTime) 过滤。
 * 默认按 createTime 倒序（最新的在最前面），与前端日志查看习惯一致。
 */
export const findOperLogs = async (
	query: {
		pageNum: number;
		pageSize: number;
		username?: string;
		module?: string;
		status?: number;
		startTime?: string;
		endTime?: string;
	},
	db: DB,
): Promise<PageResult<OperLogRecord>> => {
	const where = [];

	if (query.username) {
		where.push(like(sysOperLog.username, `%${query.username}%`));
	}
	if (query.module) {
		where.push(eq(sysOperLog.module, query.module));
	}
	if (query.status !== undefined) {
		where.push(eq(sysOperLog.status, query.status));
	}
	if (query.startTime) {
		where.push(gte(sysOperLog.createTime, query.startTime));
	}
	if (query.endTime) {
		where.push(lte(sysOperLog.createTime, query.endTime));
	}

	const whereClause = where.length > 0 ? and(...where) : undefined;

	const list = await db
		.select()
		.from(sysOperLog)
		.where(whereClause)
		.orderBy(desc(sysOperLog.createTime))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysOperLog)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 硬删单条操作日志
 *
 * oper-log 走物理删除策略（详见 docs/notes/2026-06-29-oper-log-物理删除策略.md），
 * 不走软删，DELETE 直接从表中移除。
 */
export const deleteOperLogById = async (
	id: number,
	db: DB,
): Promise<boolean> => {
	const result = await db
		.delete(sysOperLog)
		.where(eq(sysOperLog.id, id))
		.returning({ id: sysOperLog.id });
	return result.length > 0;
};

/**
 * 按时间批量清理操作日志
 *
 * 删除 createTime < beforeTime 的所有记录。
 * 给 5.5 定时任务调用 + 管理员手动清理用。
 *
 * @returns 删除的记录数
 */
export const deleteOperLogsBefore = async (
	beforeTime: string,
	db: DB,
): Promise<number> => {
	const result = await db
		.delete(sysOperLog)
		.where(lt(sysOperLog.createTime, beforeTime))
		.returning({ id: sysOperLog.id });
	return result.length;
};
