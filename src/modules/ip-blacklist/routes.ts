import { Elysia } from "elysia";
import { db } from "@/db/client";
import { ERR_CODE, notFound } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import { findIpBlacklists, removeIpFromBlacklist } from "./queries";
import {
	IpBlacklistListQuery,
	IpBlacklistParamsWithId,
	IpBlacklistResponse,
} from "./schema";

const parseItem = (item: Parameters<typeof IpBlacklistResponse.parse>[0]) => {
	const parsed = IpBlacklistResponse.parse(item);
	return { ...parsed, id: String(parsed.id) };
};

export const ipBlacklistRoutes = new Elysia({ prefix: "/api/v1/ip-blacklist" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const result = await findIpBlacklists(query, db);
			return {
				...result,
				list: result.list.map((item) => parseItem(item)),
			};
		},
		{
			auth: true,
			perm: ["sys:ip-blacklist:list"],
			query: IpBlacklistListQuery,
			detail: {
				tags: ["IpBlacklist"],
				summary: "IP 黑名单列表（分页）",
				description: "支持 IP 模糊搜索",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const item = await removeIpFromBlacklist(params.id, db);
			if (!item) throw notFound(ERR_CODE.USER_REQUEST_PARAMETER_ERROR);
			return true;
		},
		{
			auth: true,
			perm: ["sys:ip-blacklist:delete"],
			params: IpBlacklistParamsWithId,
			detail: {
				tags: ["IpBlacklist"],
				summary: "移出黑名单（软删）",
				description: "将 IP 移出黑名单，同时清除 Redis 缓存",
			},
		},
	);
