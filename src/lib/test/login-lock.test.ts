import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import {
	clearLoginFailCount,
	getLoginFailCount,
	incrementLoginFailCount,
	incrementTokenVersion,
	isAccountLocked,
} from "../login-lock";

describe("login-lock", () => {
	const TEST_USERNAME = "login_lock_test_user";
	const TEST_USER_ID = 9527;

	beforeEach(async () => {
		await redis.del(redisKeys.loginFailCount(TEST_USERNAME));
		await redis.del(redisKeys.userTokenVersion(TEST_USER_ID));
	});

	afterEach(async () => {
		await redis.del(redisKeys.loginFailCount(TEST_USERNAME));
		await redis.del(redisKeys.userTokenVersion(TEST_USER_ID));
	});

	describe("getLoginFailCount / incrementLoginFailCount / clearLoginFailCount", () => {
		test("无记录时返回 0", async () => {
			expect(await getLoginFailCount(TEST_USERNAME)).toBe(0);
		});

		test("首次失败计数为 1 并设置 TTL", async () => {
			const count = await incrementLoginFailCount(TEST_USERNAME);
			expect(count).toBe(1);

			const ttl = await redis.ttl(redisKeys.loginFailCount(TEST_USERNAME));
			expect(ttl).toBeGreaterThan(0);
			expect(ttl).toBeLessThanOrEqual(15 * 60);
		});

		test("连续失败计数递增", async () => {
			await incrementLoginFailCount(TEST_USERNAME);
			await incrementLoginFailCount(TEST_USERNAME);
			await incrementLoginFailCount(TEST_USERNAME);

			expect(await getLoginFailCount(TEST_USERNAME)).toBe(3);
		});

		test("清除后计数归 0", async () => {
			await incrementLoginFailCount(TEST_USERNAME);
			await incrementLoginFailCount(TEST_USERNAME);

			await clearLoginFailCount(TEST_USERNAME);
			expect(await getLoginFailCount(TEST_USERNAME)).toBe(0);
		});
	});

	describe("isAccountLocked", () => {
		test("失败次数未达上限 → 未锁定", async () => {
			for (let i = 0; i < 4; i++) {
				await incrementLoginFailCount(TEST_USERNAME);
			}
			expect(await isAccountLocked(TEST_USERNAME)).toBe(false);
		});

		test("失败次数达到上限 → 锁定", async () => {
			for (let i = 0; i < 5; i++) {
				await incrementLoginFailCount(TEST_USERNAME);
			}
			expect(await isAccountLocked(TEST_USERNAME)).toBe(true);
		});

		test("超过上限 → 锁定", async () => {
			for (let i = 0; i < 10; i++) {
				await incrementLoginFailCount(TEST_USERNAME);
			}
			expect(await isAccountLocked(TEST_USERNAME)).toBe(true);
		});
	});

	describe("incrementTokenVersion", () => {
		test("首次递增从 0 到 1", async () => {
			const version = await incrementTokenVersion(TEST_USER_ID);
			expect(version).toBe(1);
		});

		test("再次递增从 1 到 2", async () => {
			await incrementTokenVersion(TEST_USER_ID);
			const version = await incrementTokenVersion(TEST_USER_ID);
			expect(version).toBe(2);
		});

		test("不同用户互不干扰", async () => {
			const otherUserId = 9999;
			await redis.del(redisKeys.userTokenVersion(otherUserId));

			await incrementTokenVersion(TEST_USER_ID);
			await incrementTokenVersion(otherUserId);

			expect(await redis.get(redisKeys.userTokenVersion(TEST_USER_ID))).toBe(
				"1",
			);
			expect(await redis.get(redisKeys.userTokenVersion(otherUserId))).toBe(
				"1",
			);
		});
	});
});
