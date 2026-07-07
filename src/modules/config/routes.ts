import { Elysia } from "elysia";
import { db } from "@/db/client";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { authPlugin } from "@/plugins/auth";
import {
	createConfig,
	findConfigById,
	findConfigByKey,
	findConfigs,
	softDeleteConfig,
	updateConfig,
} from "./queries";
import {
	ConfigCreateBody,
	ConfigListQuery,
	ConfigListResponse,
	type ConfigListResponseInput,
	ConfigParamsWithId,
	ConfigResponse,
	type ConfigResponseInput,
	ConfigUpdateBody,
} from "./schema";

/** 列表响应转换：parse + id 转 string（不含 remark） */
const parseConfigList = (row: ConfigListResponseInput) => {
	const parsed = ConfigListResponse.parse(row);
	return { ...parsed, id: String(parsed.id) };
};

/** 详情/表单响应转换：parse + id 转 string（含 remark） */
const parseConfig = (row: ConfigResponseInput) => {
	const parsed = ConfigResponse.parse(row);
	return { ...parsed, id: String(parsed.id) };
};

/** 失效指定 configKey 的缓存（写操作后调用） */
const invalidateConfigCache = async (configKey: string): Promise<void> => {
	await redis.del(redisKeys.configCache(configKey));
};

export const configRoutes = new Elysia({ prefix: "/api/v1/configs" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query }) => {
			const result = await findConfigs(query, db);
			return {
				...result,
				list: result.list.map((c) => parseConfigList(c)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:config:list"],
			query: ConfigListQuery,
			detail: {
				tags: ["Config"],
				summary: "配置列表（分页）",
				description: "支持 keywords 模糊搜索（configName/configKey）",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params }) => {
			const row = await findConfigById(params.id, db);
			if (!row) throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
			return parseConfig(row);
		},
		{
			auth: true,
			requirePerm: ["sys:config:list"],
			params: ConfigParamsWithId,
			detail: {
				tags: ["Config"],
				summary: "配置表单数据",
				description: "编辑配置时回填表单",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			const existing = await findConfigByKey(body.configKey, db);
			if (existing) throw new BizError(ERR_CODE.CONFIG_KEY_DUPLICATE);
			const row = await createConfig(body, db);
			return parseConfig(row);
		},
		{
			auth: true,
			requirePerm: ["sys:config:create"],
			audit: "config:create",
			body: ConfigCreateBody,
			detail: {
				tags: ["Config"],
				summary: "创建配置",
				description: "configKey 全局唯一，不可重复",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findConfigById(params.id, db);
			if (!existing) throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
			const row = await updateConfig(params.id, body, db);
			if (!row) throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
			await invalidateConfigCache(existing.configKey);
			return parseConfig(row);
		},
		{
			auth: true,
			requirePerm: ["sys:config:update"],
			audit: "config:update",
			params: ConfigParamsWithId,
			body: ConfigUpdateBody,
			detail: {
				tags: ["Config"],
				summary: "更新配置",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const idStr = String(params.id);
			// 前端批量删除传 "1,2,3"，单条传 "1"
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));
				if (ids.length === 0) {
					throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
				}
				for (const id of ids) {
					const existing = await findConfigById(id, db);
					if (!existing) throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
					await softDeleteConfig(id, db);
					await invalidateConfigCache(existing.configKey);
				}
				return true;
			}
			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
			}
			const existing = await findConfigById(id, db);
			if (!existing) throw notFound(ERR_CODE.CONFIG_NOT_FOUND);
			await softDeleteConfig(id, db);
			await invalidateConfigCache(existing.configKey);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:config:delete"],
			audit: "config:delete",
			params: ConfigParamsWithId,
			detail: {
				tags: ["Config"],
				summary: "删除配置",
				description: "支持单条 ID 或逗号分隔的批量 ID",
			},
		},
	)
	.put(
		"/refresh",
		async () => {
			// ponytail: redis.keys() 在生产环境 O(n)，百万级 key 时需换 SCAN（同 online/routes.ts 已知天花板）
			const keys = await redis.keys("config:*");
			if (keys.length > 0) await redis.del(...keys);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:config:update"],
			audit: "config:refresh",
			detail: {
				tags: ["Config"],
				summary: "刷新配置缓存",
				description: "清空所有 config:* 缓存 key，下次读取时回源 DB",
			},
		},
	);
