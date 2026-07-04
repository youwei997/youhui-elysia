import { afterEach, describe, expect, test } from "bun:test";
import { CAPTCHA_TTL_S } from "@/lib/auth-constants";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { generateCaptcha, verifyCaptcha } from "../captcha";

describe("captcha", () => {
	let captchaId: string;

	afterEach(async () => {
		if (captchaId) {
			await redis.del(redisKeys.captchaAnswer(captchaId));
		}
		captchaId = undefined as unknown as string;
	});

	describe("generateCaptcha", () => {
		test("返回 captchaId + base64 SVG", async () => {
			const result = await generateCaptcha();
			expect(result.captchaId).toBeTruthy();
			expect(result.captchaBase64).toMatch(/^data:image\/svg\+xml;base64,/);
			captchaId = result.captchaId;
		});

		test("TTL 为 5 分钟", async () => {
			const result = await generateCaptcha();
			captchaId = result.captchaId;

			const ttl = await redis.ttl(redisKeys.captchaAnswer(captchaId));
			expect(ttl).toBeGreaterThan(0);
			expect(ttl).toBeLessThanOrEqual(CAPTCHA_TTL_S);
		});
	});

	describe("verifyCaptcha", () => {
		test("正确答案通过", async () => {
			const result = await generateCaptcha();
			captchaId = result.captchaId;

			const answer = await redis.get(redisKeys.captchaAnswer(captchaId));
			expect(await verifyCaptcha(captchaId, answer!)).toBe(true);
		});

		test("错误答案拒绝", async () => {
			const result = await generateCaptcha();
			captchaId = result.captchaId;

			expect(await verifyCaptcha(captchaId, "9999")).toBe(false);
		});

		test("不存在的 captchaId 拒绝", async () => {
			expect(await verifyCaptcha("non-existent-id", "1")).toBe(false);
		});

		test("一次性消费：验证后删除", async () => {
			const result = await generateCaptcha();
			captchaId = result.captchaId;

			const answer = await redis.get(redisKeys.captchaAnswer(captchaId));
			await verifyCaptcha(captchaId, answer!);

			// 再次验证应失败
			expect(await verifyCaptcha(captchaId, answer!)).toBe(false);
		});

		test("全角数字兼容", async () => {
			// 模拟全角数字写入 Redis
			const fakeId = "fullwidth-test";
			await redis.set(
				redisKeys.captchaAnswer(fakeId),
				"１２３", // 全角 123
				"EX",
				60,
			);
			captchaId = fakeId;

			expect(await verifyCaptcha(fakeId, "123")).toBe(true);
		});

		test("全角括号兼容", async () => {
			const fakeId = "bracket-test";
			await redis.set(
				redisKeys.captchaAnswer(fakeId),
				"１２＋３４", // 全角 12+34
				"EX",
				60,
			);
			captchaId = fakeId;

			expect(await verifyCaptcha(fakeId, "12+34")).toBe(true);
		});

		test("首尾空格忽略", async () => {
			const fakeId = "space-test";
			await redis.set(redisKeys.captchaAnswer(fakeId), "  7  ", "EX", 60);
			captchaId = fakeId;

			expect(await verifyCaptcha(fakeId, "  7  ")).toBe(true);
		});
	});
});
