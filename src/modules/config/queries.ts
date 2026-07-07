import { and, asc, count, eq, isNull, like, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { escapeLike } from "@/db/helpers/like";
import { sysConfig } from "@/db/schema/system/config";
import { BizError, ERR_CODE } from "@/lib/errors";
import type { PageResult } from "@/lib/pagination";
import type { ConfigRecord } from "./types";

/**
 * 系统配置列表查询（分页，软删过滤，keywords 模糊匹配 configName/configKey）
 */
export const findConfigs = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string | undefined;
	},
	db: DB,
): Promise<PageResult<ConfigRecord>> => {
	const where = [isNull(sysConfig.deleteTime)];

	if (query.keywords) {
		const kwCond = or(
			like(sysConfig.configName, `%${escapeLike(query.keywords)}%`),
			like(sysConfig.configKey, `%${escapeLike(query.keywords)}%`),
		);
		// drizzle 的 or(...) 这里会被推成 SQL | undefined，需要先收窄类型再 push
		if (kwCond) where.push(kwCond);
	}

	const whereClause = and(...where);

	const list = await db
		.select()
		.from(sysConfig)
		.where(whereClause)
		.orderBy(asc(sysConfig.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysConfig)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查系统配置（软删过滤）
 */
export const findConfigById = async (
	id: number,
	db: DB,
): Promise<ConfigRecord | undefined> => {
	const [config] = await db
		.select()
		.from(sysConfig)
		.where(and(eq(sysConfig.id, id), isNull(sysConfig.deleteTime)));
	return config;
};

/**
 * 按 configKey 查系统配置（软删过滤）
 */
export const findConfigByKey = async (
	configKey: string,
	db: DB,
): Promise<ConfigRecord | undefined> => {
	const [config] = await db
		.select()
		.from(sysConfig)
		.where(
			and(eq(sysConfig.configKey, configKey), isNull(sysConfig.deleteTime)),
		);
	return config;
};

/**
 * 新增系统配置（INSERT ... RETURNING，返回值非空）
 */
export const createConfig = async (
	data: {
		configName: string;
		configKey: string;
		configValue: string;
		remark?: string | undefined;
	},
	db: DB,
): Promise<ConfigRecord> => {
	const [config] = await db.insert(sysConfig).values(data).returning();
	return config as ConfigRecord;
};

/**
 * 更新系统配置（configKey 变更时先校验唯一性）
 */
export const updateConfig = async (
	id: number,
	data: {
		configName?: string | undefined;
		configKey?: string | undefined;
		configValue?: string | undefined;
		remark?: string | undefined;
	},
	db: DB,
): Promise<ConfigRecord | undefined> => {
	if (data.configKey) {
		const existing = await findConfigByKey(data.configKey, db);
		if (existing && existing.id !== id) {
			throw new BizError(ERR_CODE.CONFIG_KEY_DUPLICATE);
		}
	}

	const [config] = await db
		.update(sysConfig)
		.set(data)
		.where(and(eq(sysConfig.id, id), isNull(sysConfig.deleteTime)))
		.returning();
	return config as ConfigRecord | undefined;
};

/**
 * 软删系统配置
 */
export const softDeleteConfig = async (
	id: number,
	db: DB,
): Promise<boolean> => {
	const result = await db
		.update(sysConfig)
		.set({ deleteTime: new Date().toISOString() })
		.where(and(eq(sysConfig.id, id), isNull(sysConfig.deleteTime)))
		.returning({ id: sysConfig.id });
	return result.length > 0;
};
