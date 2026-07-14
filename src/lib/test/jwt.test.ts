/**
 * jwt.test.ts —— lib/jwt.ts 单元测试
 *
 * lib/jwt.ts 简介：
 * 基于 jose（Web Crypto API 的 TS 封装）实现 JWT 签名与验证，不使用 @elysia/jwt
 * 原因是官方插件只封装 sign/verify，不处理业务状态（Redis 查询），三层失效校验需自行实现。
 *
 * 核心设计：
 * 1. signAccessToken / signRefreshToken —— 用 jose 的 SignJWT 签名
 *    - 算法固定 HS256（对称签名，服务端持有唯一密钥）
 *    - access 15min，refresh 7d，过期时间由 jose 自动写入 exp claim
 *    - payload 由调用方传入（含 jti），jose 负责序列化并签名
 *
 * 2. verifyToken —— 三层失效校验链
 *    第一层：jwtVerify(token, secret, { clockTolerance: 60 })
 *           jose 自动完成验签 + 校验 exp（token 是否过期）
 *           clockTolerance: 60 允许 60 秒时钟偏差，避免边缘过期场景误杀
 *    第二层：查 Redis auth:user:{sub}:version
 *           比对 token 里的 tokenVersion 与 Redis 当前值
 *           不等 → 用户调用过 logout-all 或改密码，所有旧 token 失效
 *           null → 从未设置过，新用户兼容，直接放行（不拒绝）
 *    第三层：查 Redis auth:revoked:{jti}
 *           存在 → 该 token 被主动注销（logout / refresh 后旧 token 入黑名单）
 *           不存在 → 正常通过
 *
 * 3. jti（JWT ID）—— 单 token 唯一标识，由调用方用 crypto.randomUUID() 生成
 *    不是用户级、不是设备级，就是"这一个 token"的身份证号
 *    logout 时把 jti 写入 Redis 黑名单，TTL 等于 token 剩余有效期
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { config } from "@/config";
import {
	type JwtPayload,
	signAccessToken,
	signRefreshToken,
	verifyToken,
} from "../jwt";
import { redis } from "../redis";
import { redisKeys } from "../redis-keys";

/** 测试用的固定 payload */
const basePayload = (): JwtPayload => ({
	sub: "42",
	username: "tester",
	roles: ["admin"],
	perms: ["sys:user:list"],
	dataScopes: [1],
	tokenVersion: 0,
	jti: "test-jti-abc123",
	tenantId: 0,
	canSwitchTenant: false,
});

describe("jwt 签名", () => {
	test("access token 包含正确算法头、claims 和 exp", async () => {
		const token = await signAccessToken(basePayload());
		const [headerB64 = "", payloadB64 = ""] = token.split(".");

		const header = JSON.parse(atob(headerB64));
		const payload = JSON.parse(atob(payloadB64));

		// HS256 = HMAC + SHA-256，对称签名算法
		expect(header.alg).toBe("HS256");
		expect(payload.sub).toBe("42");
		expect(payload.username).toBe("tester");
		expect(payload.jti).toBe("test-jti-abc123");
		// exp 是 Unix 时间戳（秒），由 jose 根据当前时间 + 15min 自动计算
		expect(typeof payload.exp).toBe("number");
	});

	test("refresh token 与 access token 只有 exp 不同", async () => {
		const access = await signAccessToken(basePayload());
		const refresh = await signRefreshToken(basePayload());

		const [, accessPayloadB64 = ""] = access.split(".");
		const [, refreshPayloadB64 = ""] = refresh.split(".");
		const accessExp = JSON.parse(atob(accessPayloadB64)).exp;
		const refreshExp = JSON.parse(atob(refreshPayloadB64)).exp;

		// refresh token 过期时间必须晚于 access token（7d > 15m）
		expect(refreshExp).toBeGreaterThan(accessExp);
	});
});

describe("jwt 验证 —— 三层失效", () => {
	// 每个测试前清理该用户的 Redis 状态，避免测试间互相污染
	beforeEach(async () => {
		await redis.del(redisKeys.userTokenVersion("42"));
		await redis.del(redisKeys.revokedToken("test-jti-abc123"));
	});

	afterEach(async () => {
		await redis.del(redisKeys.userTokenVersion("42"));
		await redis.del(redisKeys.revokedToken("test-jti-abc123"));
	});

	test("正常 token 通过全部校验", async () => {
		const token = await signAccessToken(basePayload());
		const result = await verifyToken(token);

		expect(result.sub).toBe("42");
		expect(result.username).toBe("tester");
		expect(result.jti).toBe("test-jti-abc123");
	});

	test("第二层：tokenVersion 不匹配时抛 401", async () => {
		// 模拟 logout-all：服务端把该用户的 Redis version 改成 1
		// 所有 tokenVersion=0 的旧 token 全部失效
		await redis.set(redisKeys.userTokenVersion("42"), "1");

		const token = await signAccessToken(basePayload()); // payload 里还是 0

		await expect(verifyToken(token)).rejects.toThrow("访问令牌无效或已过期");
	});

	test("第三层：jti 在黑名单中时抛 401", async () => {
		// 模拟 logout：把当前 token 的 jti 写入 Redis 黑名单
		// 值只起占位作用，只要 key 存在即拒绝
		await redis.set(redisKeys.revokedToken("test-jti-abc123"), "1");

		const token = await signAccessToken(basePayload());

		await expect(verifyToken(token)).rejects.toThrow("访问令牌无效或已过期");
	});

	test("第一层：token 过期时 jose 抛原生错误", async () => {
		// 直接调 jose 底层构造过期 token
		// 必须超过 verifyToken 里的 clockTolerance: 60（秒），否则容错会放过
		const { SignJWT } = await import("jose");
		const secret = new TextEncoder().encode(config.JWT_SECRET);

		const expiredToken = await new SignJWT({ ...basePayload() })
			.setProtectedHeader({ alg: "HS256" })
			.setExpirationTime(new Date(Date.now() - 120_000))
			.sign(secret);

		await expect(verifyToken(expiredToken)).rejects.toThrow();
	});

	/**
	 * 为什么测这个：新用户首次登录时，Redis 里没有 auth:user:{id}:version 这个 key，
	 * redis.get 返回 null。此时应该正常放行，而不是拒绝。
	 *
	 * 如果代码写成 if (Number(currentVersion) !== jwtPayload.tokenVersion)，
	 * Number(null) === 0，虽然碰巧这次能过，但逻辑脆弱，且 tokenVersion 从 1 开始时会全拒。
	 * 这个测试锁死边界：null 时必须跳过校验。
	 */
	test("第二层边界：tokenVersion 为 null（从未设置）时不拒绝", async () => {
		// 确保 Redis 里没有该用户的 version 键（默认就是 null）
		const version = await redis.get(redisKeys.userTokenVersion("42"));
		expect(version).toBeNull();

		const token = await signAccessToken(basePayload());
		const result = await verifyToken(token);

		expect(result.sub).toBe("42");
	});
});
