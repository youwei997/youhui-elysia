import { afterEach, describe, expect, test } from "bun:test";
import { redis } from "@/lib/redis";
import { withCache } from "../cache";

const TEST_PREFIX = "test:withcache:";

const makeKey = (suffix: string): string => `${TEST_PREFIX}${suffix}`;

describe("withCache", () => {
	afterEach(async () => {
		// 清理测试 key 及其锁 key
		const keys = await redis.keys(`${TEST_PREFIX}*`);
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	});

	test("缓存未命中：调用 fetcher 并将结果写入 Redis", async () => {
		const key = makeKey("miss");
		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return "fetched-value";
		};

		const result = await withCache(key, 60, fetcher);

		expect(result).toBe("fetched-value");
		expect(callCount).toBe(1);

		// 验证缓存已写入
		const cached = await redis.get(key);
		expect(cached).toBe('"fetched-value"');
	});

	test("缓存命中：直接返回，不调用 fetcher", async () => {
		const key = makeKey("hit");
		await redis.set(key, '"cached-value"', "EX", 60);

		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return "should-not-fetch";
		};

		const result = await withCache(key, 60, fetcher);

		expect(result).toBe("cached-value");
		expect(callCount).toBe(0);
	});

	test("缓存数据损坏（JSON.parse 失败）：降级查 DB，不抛错", async () => {
		const key = makeKey("corrupt");
		await redis.set(key, "not-json-at-all", "EX", 60);

		let callCount = 0;
		const fetcher = async () => {
			callCount++;
			return "recovered";
		};

		const result = await withCache(key, 60, fetcher);

		expect(result).toBe("recovered");
		expect(callCount).toBe(1);

		// 修复后的缓存应为合法 JSON
		const fixed = await redis.get(key);
		expect(fixed).toBe('"recovered"');
	});

	test("不同 key 互不干扰", async () => {
		const keyA = makeKey("a");
		const keyB = makeKey("b");

		const resultA = await withCache(keyA, 60, async () => "value-a");
		const resultB = await withCache(keyB, 60, async () => "value-b");

		expect(resultA).toBe("value-a");
		expect(resultB).toBe("value-b");

		const cachedA = await redis.get(keyA);
		const cachedB = await redis.get(keyB);
		expect(cachedA).toBe('"value-a"');
		expect(cachedB).toBe('"value-b"');
	});

	test("TTL 为 0 时不设置过期（永久缓存）", async () => {
		const key = makeKey("no-ttl");

		await withCache(key, 0, async () => "persist");

		const ttl = await redis.ttl(key);
		expect(ttl).toBe(-1); // -1 表示无过期
	});

	test("对象类型结果正常缓存和返回", async () => {
		const key = makeKey("object");
		const expected = { list: [1, 2, 3], total: 3 };

		const result = await withCache(key, 60, async () => expected);

		expect(result).toEqual(expected);

		// 第二次应命中缓存
		const again = await withCache(key, 60, async (): Promise<typeof expected> => ({ list: [], total: 0 }));
		expect(again).toEqual(expected);
	});
});
