import { Elysia } from "elysia";
import { db } from "@/db/client";
import { authPlugin } from "@/plugins/auth";
import { findLoginLogs } from "./queries";
import { LoginLogListQuery, LoginLogResponse } from "./schema";

/** 响应转换：id 转 string */
const parseLog = (log: Parameters<typeof LoginLogResponse.parse>[0]) => {
	const parsed = LoginLogResponse.parse(log);
	return {
		...parsed,
		id: String(parsed.id),
	};
};

export const loginLogRoutes = new Elysia({ prefix: "/api/v1/login-logs" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const result = await findLoginLogs(query, db);
			return {
				...result,
				list: result.list.map((log) => parseLog(log)),
			};
		},
		{
			auth: true,
			perm: ["sys:login-log:query"],
			query: LoginLogListQuery,
			detail: {
				tags: ["LoginLog"],
				summary: "登录日志列表（分页）",
				description:
					"支持 username 模糊搜索、status 筛选（success/fail）和时间范围筛选，按 createTime 倒序",
			},
		},
	);
