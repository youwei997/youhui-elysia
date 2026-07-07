import { Elysia } from "elysia";
import { db } from "@/db/client";
import { authPlugin } from "@/plugins/auth";
import { findOperLogs, getVisitOverview, getVisitTrend } from "./queries";
import {
	AnalyticsTrendQuery,
	OperLogListQuery,
	OperLogResponse,
	type OperLogResponseInput,
} from "./schema";

/** 响应转换：字段映射在 OperLogResponse.transform 中完成，这里直接 parse */
const parseLog = (log: OperLogResponseInput) => OperLogResponse.parse(log);

export const operLogRoutes = new Elysia({ prefix: "/api/v1/logs" })
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
					"支持关键字（操作人/IP）模糊搜索、module 精确筛选、status 和时间范围筛选，按 createTime 倒序",
			},
		},
	)
	.get(
		"/analytics/trend",
		async ({ query }) => {
			const { startDate, endDate } = query;
			if (!startDate || !endDate) {
				return { dates: [], pvList: [], uvList: [] };
			}
			return getVisitTrend(db, startDate, endDate);
		},
		{
			auth: true,
			requirePerm: ["sys:oper-log:query"],
			query: AnalyticsTrendQuery,
			detail: {
				tags: ["OperLog"],
				summary: "访问趋势统计",
				description: "按日期返回 PV/UV 列表，用于仪表盘折线图",
			},
		},
	)
	.get(
		"/analytics/overview",
		async () => {
			return getVisitOverview(db);
		},
		{
			auth: true,
			requirePerm: ["sys:oper-log:query"],
			detail: {
				tags: ["OperLog"],
				summary: "访问概览统计",
				description: "返回今日/累计 PV UV 及增长率，用于仪表盘概览卡片",
			},
		},
	);
