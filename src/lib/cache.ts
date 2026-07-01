import { redis } from "@/lib/redis";

/**
 * withCache —— 防缓存击穿的高阶函数
 *
 * 场景：某 key 过期瞬间大量并发请求，只让 1 个穿透到 DB，其余人等结果。
 *
 * 流程：
 *   1. 查 Redis → 有则返回
 *   2. 无 → 抢分布式锁（SET NX EX 10）
 *   3. 抢到锁 → 双重检查 → 查 DB → 写 Redis → 释放锁
 *   4. 没抢到 → 等 50ms → 重试
 *
 * 注意：
 *   - 锁是普通 Redis key（lock:{key}），NX 确保只有一个请求能 SET 成功
 *   - EX 10 是防死锁：抢锁的请求挂了，10 秒后自动释放
 *   - 适合重建耗时 < 100ms 的场景（如字典查询），
 *     重建耗时很长（如全量索引）的消息队列异步重建
 *
 * @param key   Redis key
 * @param ttl   缓存 TTL（秒）
 * @param fetcher  回源函数（查 DB 等）
 */
export const withCache = async <T>(
	key: string,
	ttl: number,
	fetcher: () => Promise<T>,
): Promise<T> => {
	// 1. 先查缓存
	const cached = await redis.get(key);
	if (cached !== null) return JSON.parse(cached);

	// 2. 没命中 → 抢分布式锁
	const lockKey = `lock:${key}`;
		const ok = await redis.set(lockKey, "1", "NX", "EX", "10");
	if (ok) {
		try {
			// 3. 双重检查：等锁的时候别人可能已经写好了
			const doubleCheck = await redis.get(key);
			if (doubleCheck !== null) {
				return JSON.parse(doubleCheck);
			}
			const value = await fetcher();
			await redis.set(key, JSON.stringify(value), "EX", String(ttl));
			return value;
		} finally {
			await redis.del(lockKey);
		}
	}

	// 4. 没抢到锁 → 等 50ms 重试
	await new Promise((r) => setTimeout(r, 50));
	return withCache(key, ttl, fetcher);
};
