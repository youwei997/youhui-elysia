import { afterEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { rateLimitPlugin } from "../rate-limit";

const TEST_IP = "192.168.1.100";

const makeApp = (opts?: { rateLimit?: string }) =>
	new Elysia()
		.use(rateLimitPlugin)
		.get(
			"/test",
			() => "ok",
			opts?.rateLimit ? { rateLimit: opts.rateLimit } : undefined,
		);

describe("rateLimitPlugin", () => {
	afterEach(async () => {
		// 清理限流 key（可能为空，需判断）
		const keys = await redis.keys(`ratelimit:${TEST_IP}:*`);
		if (keys.length > 0) {
			await redis.del(...keys);
		}
		// 清理 IP 黑名单
		await redis.del(redisKeys.ipBlacklist(TEST_IP));
	});

	describe("IP 黑名单（全局）", () => {
		test("命中黑名单 → 403", async () => {
			await redis.set(redisKeys.ipBlacklist(TEST_IP), "1");

			const app = makeApp();
			const res = await app.handle(
				new Request("http://localhost/test", {
					headers: { "x-forwarded-for": TEST_IP },
				}),
			);

			expect(res.status).toBe(403);
		});

		test("未命中黑名单 → 正常 200", async () => {
			const app = makeApp();
			const res = await app.handle(
				new Request("http://localhost/test", {
					headers: { "x-forwarded-for": TEST_IP },
				}),
			);

			expect(res.status).toBe(200);
		});
	});

	describe("rateLimit macro", () => {
		test("首次请求通过（未超限）", async () => {
			const app = makeApp({ rateLimit: "5:10" });
			const res = await app.handle(
				new Request("http://localhost/test", {
					headers: { "x-forwarded-for": TEST_IP },
				}),
			);

			expect(res.status).toBe(200);
			expect(await res.text()).toBe("ok");
		});

		test("超过限流阈值 → 429 + Retry-After", async () => {
			const app = makeApp({ rateLimit: "60:3" });

			// 前 3 次通过
			for (let i = 0; i < 3; i++) {
				const res = await app.handle(
					new Request("http://localhost/test", {
						headers: { "x-forwarded-for": TEST_IP },
					}),
				);
				expect(res.status).toBe(200);
			}

			// 第 4 次被限流
			const res = await app.handle(
				new Request("http://localhost/test", {
					headers: { "x-forwarded-for": TEST_IP },
				}),
			);

			expect(res.status).toBe(429);
			expect(res.headers.get("Retry-After")).toBe("60");
		});

		test("不同 IP 互不干扰", async () => {
			const app = makeApp({ rateLimit: "2:10" });

			// IP_A 打满 2 次
			for (let i = 0; i < 2; i++) {
				const res = await app.handle(
					new Request("http://localhost/test", {
						headers: { "x-forwarded-for": "10.0.0.1" },
					}),
				);
				expect(res.status).toBe(200);
			}

			// IP_B 仍有额度
			const res = await app.handle(
				new Request("http://localhost/test", {
					headers: { "x-forwarded-for": "10.0.0.2" },
				}),
			);
			expect(res.status).toBe(200);
		});

		test("不同路径互不干扰", async () => {
			const app = new Elysia()
				.use(rateLimitPlugin)
				.get(
					"/a",
					() => "a",
					{ rateLimit: "2:10" },
				)
				.get(
					"/b",
					() => "b",
					{ rateLimit: "2:10" },
				);

			// /a 打满 2 次
			for (let i = 0; i < 2; i++) {
				const res = await app.handle(
					new Request("http://localhost/a", {
						headers: { "x-forwarded-for": TEST_IP },
					}),
				);
				expect(res.status).toBe(200);
			}

			// /b 仍有额度
			const res = await app.handle(
				new Request("http://localhost/b", {
					headers: { "x-forwarded-for": TEST_IP },
				}),
			);
			expect(res.status).toBe(200);
		});

		test("无 IP 时跳过限流（空 X-Forwarded-For + 无 X-Real-IP）", async () => {
			const app = makeApp({ rateLimit: "1:10" });

			const res = await app.handle(
				new Request("http://localhost/test"),
			);

			expect(res.status).toBe(200);
		});
	});
});
