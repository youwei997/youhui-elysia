import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gte,
	like,
	lt,
	lte,
	or,
} from "drizzle-orm";
import type { DB } from "@/db/client";
import { escapeLike } from "@/db/helpers/like";
import { sysOperLog } from "@/db/schema/system/oper-log";
import type { OperLogRecord } from "./types";

/**
 * 操作日志列表查询（事件型表无软删，按 createTime 倒序）
 */
export const findOperLogs = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		module?: string;
		status?: number;
		createTime?: [string, string];
	},
	db: DB,
): Promise<{ list: OperLogRecord[]; total: number }> => {
	const where = [];

	if (query.keywords) {
		// 关键字模糊匹配操作人 OR IP，escapeLike 防 LIKE 通配符注入
		where.push(
			or(
				like(sysOperLog.username, `%${escapeLike(query.keywords)}%`),
				like(sysOperLog.ip, `%${escapeLike(query.keywords)}%`),
			),
		);
	}
	if (query.module) {
		where.push(eq(sysOperLog.module, query.module));
	}
	if (query.status !== undefined) {
		where.push(eq(sysOperLog.status, query.status));
	}
	if (query.createTime) {
		const [start, end] = query.createTime;
		// 统一 UTC 比较，与 getVisitOverview/getVisitTrend 保持一致
		where.push(gte(sysOperLog.createTime, `${start}T00:00:00.000Z`));
		where.push(lte(sysOperLog.createTime, `${end}T23:59:59.999Z`));
	}

	const whereClause = and(...where);

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
 * 访问概览：今日/累计 PV UV + 增长率
 *
 * PV = 操作日志条数（页面访问量）
 * UV = 去重 username 数（独立访客）
 * 增长率 = (今日 - 昨日) / 昨日 × 100，昨日为 0 时返回 null
 *
 * 时间窗口用 UTC 零点的 Date 计算（对比绝对时刻），避免服务器时区影响"今日"判定，
 * 与 getVisitTrend 的 UTC 日期分组保持一致。
 */
export const getVisitOverview = async (
	db: DB,
): Promise<{
	todayUvCount: number;
	totalUvCount: number;
	uvGrowthRate: number | null;
	todayPvCount: number;
	totalPvCount: number;
	pvGrowthRate: number | null;
}> => {
	const now = new Date();
	// 以 UTC 零点对齐"今日"窗口
	const todayStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const todayEnd = new Date(todayStart.getTime() + 86_400_000);
	const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
	const yesterdayEnd = todayStart;

	// 今日 PV/UV
	const todayStats = await db
		.select({
			pv: count(),
			uv: countDistinct(sysOperLog.username),
		})
		.from(sysOperLog)
		.where(
			and(
				gte(sysOperLog.createTime, todayStart.toISOString()),
				lt(sysOperLog.createTime, todayEnd.toISOString()),
			),
		);

	// 累计 PV/UV
	const totalStats = await db
		.select({
			pv: count(),
			uv: countDistinct(sysOperLog.username),
		})
		.from(sysOperLog);

	// 昨日 PV/UV（用于计算增长率）
	const yesterdayStats = await db
		.select({
			pv: count(),
			uv: countDistinct(sysOperLog.username),
		})
		.from(sysOperLog)
		.where(
			and(
				gte(sysOperLog.createTime, yesterdayStart.toISOString()),
				lt(sysOperLog.createTime, yesterdayEnd.toISOString()),
			),
		);

	const todayPv = todayStats[0]?.pv ?? 0;
	const todayUv = todayStats[0]?.uv ?? 0;
	const totalPv = totalStats[0]?.pv ?? 0;
	const totalUv = totalStats[0]?.uv ?? 0;
	const yesterdayPv = yesterdayStats[0]?.pv ?? 0;
	const yesterdayUv = yesterdayStats[0]?.uv ?? 0;

	return {
		todayUvCount: todayUv,
		totalUvCount: totalUv,
		uvGrowthRate:
			yesterdayUv > 0
				? Math.round(((todayUv - yesterdayUv) / yesterdayUv) * 100)
				: null,
		todayPvCount: todayPv,
		totalPvCount: totalPv,
		pvGrowthRate:
			yesterdayPv > 0
				? Math.round(((todayPv - yesterdayPv) / yesterdayPv) * 100)
				: null,
	};
};

/**
 * 访问趋势：按日期分组 PV/UV 列表
 *
 * 按用户实际查询的日期范围聚合，补全无数据的日期（PV=0, UV=0）。
 * 应用层 UTC 日期分组（避免 sql 模板方言耦合），
 * 与日期循环的 key（toISOString().slice(0,10)）均为 UTC 字符串，确保 key 对齐。
 */
export const getVisitTrend = async (
	db: DB,
	startDate: string,
	endDate: string,
): Promise<{ dates: string[]; pvList: number[]; uvList: number[] }> => {
	const start = new Date(`${startDate}T00:00:00.000Z`);
	const end = new Date(`${endDate}T23:59:59.999Z`);

	// 应用层分组：只取原始时间 + username，避免 sql 模板
	const rows = await db
		.select({
			createTime: sysOperLog.createTime,
			username: sysOperLog.username,
		})
		.from(sysOperLog)
		.where(
			and(
				gte(sysOperLog.createTime, start.toISOString()),
				lte(sysOperLog.createTime, end.toISOString()),
			),
		);

	const dateMap = new Map<string, { pv: number; uv: Set<string> }>();
	for (const row of rows) {
		const ds = new Date(row.createTime).toISOString().slice(0, 10);
		let entry = dateMap.get(ds);
		if (!entry) {
			entry = { pv: 0, uv: new Set() };
			dateMap.set(ds, entry);
		}
		entry.pv++;
		if (row.username) {
			entry.uv.add(row.username);
		}
	}

	// 补全日期范围内无数据的日期
	const dates: string[] = [];
	const pvList: number[] = [];
	const uvList: number[] = [];

	const current = new Date(start);
	const rangeEnd = new Date(end);
	while (current <= rangeEnd) {
		const ds = current.toISOString().slice(0, 10);
		dates.push(ds);
		const entry = dateMap.get(ds);
		pvList.push(entry?.pv ?? 0);
		uvList.push(entry?.uv.size ?? 0);
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return { dates, pvList, uvList };
};

/**
 * 清理过期操作日志（物理删除）
 *
 * 删除 createTime < now - retentionDays 天 的记录，返回删除条数。
 * 对齐 docs/notes/2026-06-29-oper-log-物理删除策略.md：oper_log 不走软删，定时硬删。
 * 仅在 cron 任务中调用，不暴露为 REST 接口。
 */
export const cleanExpiredOperLogs = async (
	retentionDays: number,
	db: DB,
): Promise<number> => {
	const cutoff = new Date(
		Date.now() - retentionDays * 24 * 60 * 60 * 1000,
	).toISOString();
	const result = await db
		.delete(sysOperLog)
		.where(lt(sysOperLog.createTime, cutoff))
		.returning({ id: sysOperLog.id });
	return result.length;
};
