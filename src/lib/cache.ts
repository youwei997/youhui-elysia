import { redis } from "@/lib/redis";

/**
 * withCache —— 防缓存击穿的高阶函数
 *
 * 场景：dict:gender 这条缓存刚好过期，
 *   此时 100 个人同时请求，只会让 1 个人去查 DB，剩下 99 个人等他。
 *
 * 流程（按代码顺序）：
 *   ┌─ 1. 先查 Redis
 *   │     有数据 → 直接返回（99% 的情况走这里）
 *   │
 *   ├─ 2. Redis 没有 → 抢锁（SET NX：key 不存在才能设成功）
 *   │     抢到的 → 继续往下走
 *   │     没抢到 → 睡 50ms → 回到步骤 1 重试
 *   │
 *   ├─ 3. 抢到锁的人：双重检查（睡 50ms 的时候别人可能写好了）
 *   │     已经有了 → 直接返回
 *   │     还没有 → 查 DB → 写 Redis → 删锁 → 返回
 *   │
 *   └─ 拿数据返回给调用方
 *
 * 关于"睡 50ms"：
 *   await new Promise(r => setTimeout(r, 50)) 就是让这个请求
 *   暂停 50ms（不占 CPU、不占网络），50ms 后醒过来重试。
 *   这 50ms 里抢到锁的人已经写完缓存了，重试时 Redis 就能命中。
 */
export const withCache = async <T>(
	key: string,
	ttl: number,
	fetcher: () => Promise<T>,
): Promise<T> => {
	// 1. 查 Redis。有缓存直接返回，不碰 DB。
	const cached = await redis.get(key);
	if (cached !== null) return JSON.parse(cached);

	// 2. 缓存过期了 → 抢分布式锁。
	//    锁就是 key "lock:dict:gender"，谁先 SET NX 成功谁去查 DB。
	//    EX 10 防死锁：抢锁的人挂了，10 秒后锁自动释放。
	const lockKey = `lock:${key}`;
	const ok = await redis.set(lockKey, "1", "NX", "EX", "10");
	if (ok) {
		try {
			// 3. 双重检查：等锁的时候别人可能已经写好了缓存
			const doubleCheck = await redis.get(key);
			if (doubleCheck !== null) {
				return JSON.parse(doubleCheck);
			}

			// 4. 查 DB，写缓存，返回
			const value = await fetcher();
			await redis.set(key, JSON.stringify(value), "EX", String(ttl));
			return value;
		} finally {
			// 5. 删锁，让下一个等待的人能抢到
			await redis.del(lockKey);
		}
	}

	// 6. 没抢到锁 → 说明有人在查 DB 写缓存。
	//    睡 50ms 让他写完，然后重头再来。（重试时 Redis 大概率有数据了）
	await new Promise((r) => setTimeout(r, 50));
	return withCache(key, ttl, fetcher);
};
