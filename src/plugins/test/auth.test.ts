/**
 * auth.test.ts —— plugins/auth.ts 单元测试
 *
 * 测试策略：
 * - 创建一个最小测试 app（只挂 errorHandler + authPlugin，不挂 response-wrap）
 * - 用 app.handle() 模拟 HTTP 请求，验证 derive 注入和 macro 行为
 * - 不依赖 3.6 auth 模块：token 直接用 signAccessToken 生成
 *
 * 为什么不挂 response-wrap：
 *   handler 返回什么就是 body，避免测试断言被 { code, msg, data } 包装干扰
 * 为什么必须挂 errorHandler：
 *   macro 抛 unauthorized() 后，errorHandler 才能转成 401 响应
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { type JwtPayload, signAccessToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { errorHandler } from "@/plugins/error-handler";
import { authPlugin } from "../auth";

/** 固定测试 payload，sub 和 jti 用固定值便于清理 Redis */
const makePayload = (): JwtPayload => ({
	sub: "99",
	username: "tester",
	roles: ["admin"],
	perms: ["sys:user:list"],
	dataScopes: [1],
	tokenVersion: 0,
	jti: "test-jti-1",
	tenantId: 0,
	homeTenantId: 0,
	canSwitchTenant: false,
});

/** 测试路由 handler 返回的 body 结构 */
type TestBody = { user: JwtPayload | null; msg: string };

/** 解析 res.json() 并标注为 TestBody */
const parseBody = async (res: Response): Promise<TestBody> => {
	return (await res.json()) as TestBody;
};

/** 创建测试 app：包含一个公开路由和一个受保护路由 */
const createTestApp = () => {
	return new Elysia()
		.use(errorHandler)
		.use(authPlugin)
		.get("/public", ({ user }) => ({ user, msg: "public" }))
		.get("/protected", ({ user }) => ({ user, msg: "protected" }), {
			auth: true,
		});
};

describe("auth plugin · derive 解析 Authorization", () => {
	// 清理 Redis，避免 tokenVersion / jti 黑名单影响测试
	beforeEach(async () => {
		await redis.del(redisKeys.userTokenVersion("99"));
		await redis.del(redisKeys.revokedToken("test-jti-1"));
	});
	afterEach(async () => {
		await redis.del(redisKeys.userTokenVersion("99"));
		await redis.del(redisKeys.revokedToken("test-jti-1"));
	});

	test("无 Authorization header → user = null", async () => {
		const app = createTestApp();
		const res = await app.handle(new Request("http://localhost/public"));
		const body = await parseBody(res);

		expect(res.status).toBe(200);
		expect(body.user).toBeNull();
	});

	test("格式不对（非 Bearer）→ user = null", async () => {
		const app = createTestApp();
		const res = await app.handle(
			new Request("http://localhost/public", {
				headers: { authorization: "Basic dXNlcjpwYXNz" },
			}),
		);
		const body = await parseBody(res);

		expect(body.user).toBeNull();
	});

	test("合法 token → user 有完整 payload", async () => {
		const token = await signAccessToken(makePayload());
		const app = createTestApp();
		const res = await app.handle(
			new Request("http://localhost/public", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const body = await parseBody(res);

		// 强制收窄：expect().not.toBeNull() 不会让 TS 知道 user 非空
		if (!body.user) {
			throw new Error("expected user to be non-null");
		}
		expect(body.user.sub).toBe("99");
		expect(body.user.username).toBe("tester");
		expect(body.user.roles).toEqual(["admin"]);
	});

	test("无效 token（乱写）→ user = null（验签失败被 catch 吞掉）", async () => {
		const app = createTestApp();
		const res = await app.handle(
			new Request("http://localhost/public", {
				headers: { authorization: "Bearer invalid.token.here" },
			}),
		);
		const body = await parseBody(res);

		expect(body.user).toBeNull();
	});
});

describe("auth plugin · macro auth: true 强制登录", () => {
	beforeEach(async () => {
		await redis.del(redisKeys.userTokenVersion("99"));
		await redis.del(redisKeys.revokedToken("test-jti-1"));
	});
	afterEach(async () => {
		await redis.del(redisKeys.userTokenVersion("99"));
		await redis.del(redisKeys.revokedToken("test-jti-1"));
	});

	test("auth: true + 无 token → 401", async () => {
		const app = createTestApp();
		const res = await app.handle(new Request("http://localhost/protected"));

		expect(res.status).toBe(401);
	});

	test("auth: true + 合法 token → 200", async () => {
		const token = await signAccessToken(makePayload());
		const app = createTestApp();
		const res = await app.handle(
			new Request("http://localhost/protected", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const body = await parseBody(res);

		expect(res.status).toBe(200);
		// 强制收窄：macro 已拦截 null 情况，到达 handler 时 user 必非空
		if (!body.user) {
			throw new Error("expected user to be non-null");
		}
		expect(body.user.username).toBe("tester");
	});

	test("auth: true + 无效 token → 401", async () => {
		const app = createTestApp();
		const res = await app.handle(
			new Request("http://localhost/protected", {
				headers: { authorization: "Bearer invalid.token.here" },
			}),
		);

		expect(res.status).toBe(401);
	});

	test("auth: 未声明（公开路由）+ 无 token → 200", async () => {
		const app = createTestApp();
		const res = await app.handle(new Request("http://localhost/public"));

		expect(res.status).toBe(200);
	});
});
