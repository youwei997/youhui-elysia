import { and, asc, count, eq, isNull, like } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysIpBlacklist } from "@/db/schema/system/ip-blacklist";
import type { PageResult } from "@/lib/pagination";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";

/** IP 黑名单列表（分页，软删过滤） */
export const findIpBlacklists = async (
	query: { pageNum: number; pageSize: number; ip?: string },
	db: DB,
): Promise<PageResult<typeof sysIpBlacklist.$inferSelect>> => {
	const where = [isNull(sysIpBlacklist.deleteTime)];

	if (query.ip) {
		where.push(like(sysIpBlacklist.ip, `%${query.ip}%`));
	}

	const whereClause = where.length > 0 ? and(...where) : undefined;

	const list = await db
		.select()
		.from(sysIpBlacklist)
		.where(whereClause)
		.orderBy(asc(sysIpBlacklist.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysIpBlacklist)
		.where(whereClause);

	return { list, total };
};

/** 按 IP 查黑名单记录 */
export const findIpBlacklistByIp = async (
	ip: string,
	db: DB,
): Promise<typeof sysIpBlacklist.$inferSelect | undefined> => {
	const [item] = await db
		.select()
		.from(sysIpBlacklist)
		.where(and(eq(sysIpBlacklist.ip, ip), isNull(sysIpBlacklist.deleteTime)));
	return item;
};

/** 将 IP 加入黑名单（DB + Redis 缓存） */
export const addIpToBlacklist = async (
	ip: string,
	reason: string,
	expireAt: string | null,
	db: DB,
): Promise<void> => {
	await db.insert(sysIpBlacklist).values({ ip, reason, expireAt });

	// 写入 Redis 缓存，TTL 与封禁时长一致
	// expireAt = null 表示永久封禁，Redis 不设过期
	if (expireAt) {
		const remainingMs = new Date(expireAt).getTime() - Date.now();
		if (remainingMs > 0) {
			await redis.set(
				redisKeys.ipBlacklist(ip),
				"1",
				"PX",
				String(remainingMs),
			);
		}
	} else {
		await redis.set(redisKeys.ipBlacklist(ip), "1");
	}
};

/** 从黑名单移除（软删 + 删 Redis 缓存） */
export const removeIpFromBlacklist = async (
	id: number,
	db: DB,
): Promise<typeof sysIpBlacklist.$inferSelect | undefined> => {
	const [item] = await db
		.update(sysIpBlacklist)
		.set({ deleteTime: new Date().toISOString() })
		.where(and(eq(sysIpBlacklist.id, id), isNull(sysIpBlacklist.deleteTime)))
		.returning();
	if (item) {
		await redis.del(redisKeys.ipBlacklist(item.ip));
	}
	return item;
};
