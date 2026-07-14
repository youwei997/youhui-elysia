/**
 * permission.test.ts —— plugins/permission.ts 单元测试
 *
 * 测试策略：
 * - 创建最小测试 app（errorHandler + authPlugin + permissionPlugin）
 * - 用 signAccessToken 生成不同 payload 的 token，验证 macro 行为
 * - 重点验证 ROOT 短路与 *:*:* 通配符短路（与前端 v-hasPerm 语义对齐）
 *
 * 覆盖场景：
 * 1. requirePerm：有权限放行 / 无权限 403
 * 2. ROOT 角色短路（perms 为空也能通过）—— 关键修复点
 * 3. *:*:* 通配符短路
 * 4. requireRole macro：有角色放行 / 无角色 403
 *
 * 注：app 不作为函数参数传递，避免 derive 后的实例类型与裸 Elysia 类型不兼容
 * （exactOptionalPropertyTypes 严格模式下 onStart 属性签名冲突）
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { type JwtPayload, signAccessToken } from "@/lib/jwt";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { errorHandler } from "@/plugins/error-handler";
import { authPlugin } from "../auth";
import { permissionPlugin } from "../permission";

/** 构造 JwtPayload，允许覆盖默认值 */
const makePayload = (over: Partial<JwtPayload> = {}): JwtPayload => ({
	sub: "99",
	username: "tester",
	roles: ["ADMIN"],
	perms: [],
	dataScopes: [1],
	tokenVersion: 0,
	jti: "test-jti-perm-1",
	tenantId: 0,
	homeTenantId: 0,
	canSwitchTenant: false,
	...over,
});

/** 带 requirePerm 路由的测试 app（请求 /users 需要 sys:user:list） */
const permApp = () =>
	new Elysia()
		.use(errorHandler)
		.use(authPlugin)
		.use(permissionPlugin)
		.get("/users", () => "ok", { auth: true, requirePerm: ["sys:user:list"] });

/** 带 requireRole 路由的测试 app（请求 /admin-only 需要 ROOT 角色） */
const roleApp = () =>
	new Elysia()
		.use(errorHandler)
		.use(authPlugin)
		.use(permissionPlugin)
		.get("/admin-only", () => "ok", { auth: true, requireRole: ["ROOT"] });

/** 多 requirePerm 路由的测试 app（验证 ROOT 在不同 perm 下都短路） */
const multiPermApp = () =>
	new Elysia()
		.use(errorHandler)
		.use(authPlugin)
		.use(permissionPlugin)
		.get("/a", () => "ok", { auth: true, requirePerm: ["sys:user:create"] })
		.get("/b", () => "ok", { auth: true, requirePerm: ["sys:role:delete"] });

/**
 * 用 token 请求某路径
 *
 * 泛型 T 保留各 app 的具体类型，避免 ~Routes 字面量差异导致类型不兼容
 * （exactOptionalPropertyTypes 严格模式下不同路由的 app 实例类型互不兼容）
 */
const hit = async <T>(
	app: { handle: (req: Request) => Promise<Response> } & T,
	path: string,
	token: string,
): Promise<Response> =>
	app.handle(
		new Request(`http://localhost${path}`, {
			headers: { authorization: `Bearer ${token}` },
		}),
	);

beforeEach(async () => {
	await redis.del(redisKeys.userTokenVersion("99"));
	await redis.del(redisKeys.revokedToken("test-jti-perm-1"));
});

afterEach(async () => {
	await redis.del(redisKeys.userTokenVersion("99"));
	await redis.del(redisKeys.revokedToken("test-jti-perm-1"));
});

describe("requirePerm · 基础权限校验", () => {
	test("用户有该 perm → 200", async () => {
		const token = await signAccessToken(
			makePayload({ perms: ["sys:user:list"] }),
		);
		const res = await hit(permApp(), "/users", token);
		expect(res.status).toBe(200);
	});

	test("用户无该 perm → 403", async () => {
		const token = await signAccessToken(
			makePayload({ perms: ["sys:role:list"] }),
		);
		const res = await hit(permApp(), "/users", token);
		expect(res.status).toBe(403);
	});
});

describe("requirePerm · ROOT 角色短路（关键修复点）", () => {
	test("ROOT 角色 + perms 为空 → 仍 200（不依赖 perms）", async () => {
		// 模拟 seed 真实情况：ROOT 角色不绑定菜单，perms 是空数组
		const token = await signAccessToken(
			makePayload({ roles: ["ROOT"], perms: [] }),
		);
		const res = await hit(permApp(), "/users", token);
		expect(res.status).toBe(200);
	});

	test("ROOT 角色 + 多个 perm 限制 → 任一路由都 200", async () => {
		const token = await signAccessToken(
			makePayload({ roles: ["ROOT"], perms: [] }),
		);
		const app = multiPermApp();
		expect((await hit(app, "/a", token)).status).toBe(200);
		expect((await hit(app, "/b", token)).status).toBe(200);
	});
});

describe("requirePerm · 通配符短路", () => {
	test("perms 含 *:*:* → 200（非 ROOT 超管）", async () => {
		const token = await signAccessToken(
			makePayload({ roles: ["ADMIN"], perms: ["*:*:*"] }),
		);
		const res = await hit(permApp(), "/users", token);
		expect(res.status).toBe(200);
	});
});

describe("requireRole macro · 角色校验", () => {
	test("用户有该角色 → 200", async () => {
		const token = await signAccessToken(makePayload({ roles: ["ROOT"] }));
		const res = await hit(roleApp(), "/admin-only", token);
		expect(res.status).toBe(200);
	});

	test("用户无该角色 → 403", async () => {
		const token = await signAccessToken(makePayload({ roles: ["ADMIN"] }));
		const res = await hit(roleApp(), "/admin-only", token);
		expect(res.status).toBe(403);
	});
});

describe("未登录场景", () => {
	test("perm 路由 + 无 token → 401（auth macro 先拦截）", async () => {
		const res = await permApp().handle(new Request("http://localhost/users"));
		expect(res.status).toBe(401);
	});
});
