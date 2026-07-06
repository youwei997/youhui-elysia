import { and, count, countDistinct, desc, eq, gte, like, lt, lte, sql } from "drizzle-orm";
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
		username?: string;
		module?: string;
		status?: number;
		startTime?: string;
		endTime?: string;
	},
	db: DB,
): Promise<{ list: OperLogRecord[]; total: number }> => {
	const where = [];

	if (query.username) {
		// 用户名模糊搜索，escapeLike 防 LIKE 通配符注入
		where.push(like(sysOperLog.username, `%${escapeLike(query.username)}%`));
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
		// endTime 是日期字符串（YYYY-MM-DD），延至当天 23:59:59 包含整天
		where.push(lte(sysOperLog.createTime, `${query.endTime} 23:59:59`));
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
 * 登录概览：今日/累计 PV UV + 增长率
 *
 * PV = 操作日志条数（页面访问量）
 * UV = 去重 username 数（独立访客）
 * 增长率 = (今日 - 昨日) / 昨日 × 100，昨日为 0 时返回 null
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
	const today = new Date().toISOString().slice(0, 10);
	const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

	// 今日 PV/UV
	const todayStats = await db
		.select({
			pv: count(),
			uv: countDistinct(sysOperLog.username),
		})
		.from(sysOperLog)
		.where(
			and(
				gte(sysOperLog.createTime, today),
				lt(sysOperLog.createTime, `${today} 23:59:59`),
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
				gte(sysOperLog.createTime, yesterday),
				lt(sysOperLog.createTime, `${yesterday} 23:59:59`),
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
		uvGrowthRate: yesterdayUv > 0 ? Math.round((todayUv - yesterdayUv) / yesterdayUv * 100) : null,
		todayPvCount: todayPv,
		totalPvCount: totalPv,
		pvGrowthRate: yesterdayPv > 0 ? Math.round((todayPv - yesterdayPv) / yesterdayPv * 100) : null,
	};
};

/**
 * 访问趋势：按日期分组 PV/UV 列表
 *
 * 按用户实际查询的日期范围聚合，补全无数据的日期（PV=0, UV=0）。
 */
export const getVisitTrend = async (
	db: DB,
	startDate: string,
	endDate: string,
): Promise<{ dates: string[]; pvList: number[]; uvList: number[] }> => {
	const raw = await db
		.select({
			date: sql`DATE(${sysOperLog.createTime})`.as("date"),
			pv: count(),
			uv: countDistinct(sysOperLog.username),
		})
		.from(sysOperLog)
		.where(
			and(
				gte(sysOperLog.createTime, startDate),
				lte(sysOperLog.createTime, `${endDate} 23:59:59`),
			),
		)
		.groupBy(sql`DATE(${sysOperLog.createTime})`)
		.orderBy(sql`DATE(${sysOperLog.createTime})`);

	// 补全日期范围内无数据的日期
	const dateMap = new Map(raw.map((r) => [r.date, { pv: r.pv, uv: r.uv }]));
	const dates: string[] = [];
	const pvList: number[] = [];
	const uvList: number[] = [];

	const current = new Date(startDate);
	const end = new Date(endDate);
	while (current <= end) {
		const ds = current.toISOString().slice(0, 10);
		dates.push(ds);
		const entry = dateMap.get(ds);
		pvList.push(entry?.pv ?? 0);
		uvList.push(entry?.uv ?? 0);
		current.setDate(current.getDate() + 1);
	}

	return { dates, pvList, uvList };
};
