import { Elysia } from "elysia";
import { db } from "@/db/client";
import { generateCaptcha, verifyCaptcha } from "@/lib/captcha";
import { BizError, ERR_CODE } from "@/lib/errors";
import type { JwtPayload } from "@/lib/jwt";
import { signAccessToken, signRefreshToken, verifyToken } from "@/lib/jwt";
import {
	clearLoginFailCount,
	incrementLoginFailCount,
	incrementTokenVersion,
	isAccountLocked,
} from "@/lib/login-lock";
import { verifyPassword } from "@/lib/password";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { authPlugin } from "@/plugins/auth";
import {
	findActiveUserByUsername,
	findUserPerms,
	findUserRoles,
} from "./queries";
import { LoginBody, RefreshTokenQuery } from "./schema";

/** 生成唯一 jti */
const generateJti = (): string => {
	return crypto.randomUUID();
};

/**
 * 构建 JWT 载荷
 *
 * 登录时注入真实的 roles / perms / dataScopes
 * 这些数据由调用方（/login、/refresh）通过 findUserRoles / findUserPerms 获得后传入
 */
const buildJwtPayload = (
	user: { id: number; username: string },
	tokenVersion: number,
	roles: Array<{ code: string; dataScope: number | null }>,
	perms: string[],
): JwtPayload => {
	return {
		sub: String(user.id),
		username: user.username,
		roles: roles.map((r) => r.code),
		perms,
		dataScopes: roles
			.map((r) => r.dataScope)
			.filter((s): s is number => s !== null),
		tokenVersion,
		jti: generateJti(),
	};
};

/**
 * 将 token 的 jti 加入黑名单，TTL 为 token 剩余有效期
 * token 已过期则跳过（验证时签名校验会直接拒绝，无需黑名单）
 */
const revokeJti = async (jti: string, exp?: number): Promise<void> => {
	const remainingMs = (exp ?? 0) * 1000 - Date.now();
	if (remainingMs > 0) {
		await redis.set(redisKeys.revokedToken(jti), "1", "PX", remainingMs);
	}
};

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
	.use(authPlugin)
	.get(
		"/captcha",
		async () => {
			return generateCaptcha();
		},
		{
			detail: {
				tags: ["Auth"],
				summary: "获取图形验证码",
				description:
					"返回 captchaId + base64 SVG 图片，答案存入 Redis（5 分钟 TTL），登录时回传校验",
				security: [],
			},
		},
	)
	.post(
		"/login",
		async ({ body }) => {
			const { username, password, captchaId, captchaCode } = body;

			// 业务规则：前端传了其中一个验证码字段，就必须两个都传，否则不完整
			if (captchaId || captchaCode) {
				// 验证码必须成对传入：传了其中一个就必须传另一个，不能只传 id 或只传 code
				if (!captchaId || !captchaCode) {
					throw new BizError(
						ERR_CODE.CAPTCHA_REQUIRED,
						"验证码 ID 和验证码必须同时提供",
					);
				}
				const captchaValid = await verifyCaptcha(captchaId, captchaCode);
				if (!captchaValid) {
					throw new BizError(ERR_CODE.CAPTCHA_INVALID, "验证码错误或已过期");
				}
			}

			// 2. 检查账户是否因连续失败被锁定
			if (await isAccountLocked(username)) {
				throw new BizError(ERR_CODE.ACCOUNT_FROZEN, undefined, 403);
			}

			// 3. 查找有效用户（软删过滤 + 状态正常）
			const user = await findActiveUserByUsername(username, db);
			if (!user) {
				// 不暴露"用户不存在"，统一提示密码错误（防止枚举用户名）
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			// 4. 校验密码
			const isPasswordCorrect = await verifyPassword(password, user.password);
			if (!isPasswordCorrect) {
				await incrementLoginFailCount(username);
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			// 5. 登录成功：清除失败计数，查角色/权限，签发双 token
			await clearLoginFailCount(username);

			// 并发查角色 + 权限（互不依赖，一起跑更快）
			const [userRoles, userPerms] = await Promise.all([
				findUserRoles(user.id, db),
				findUserPerms(user.id, db),
			]);

			const tokenVersion = Number(
				(await redis.get(redisKeys.userTokenVersion(user.id))) ?? "0",
			);
			const payload = buildJwtPayload(user, tokenVersion, userRoles, userPerms);

			// access 和 refresh 用不同的 jti，refresh 的 jti 不在这里黑名单
			const [accessToken, refreshToken] = await Promise.all([
				signAccessToken({ ...payload, jti: generateJti() }),
				signRefreshToken(payload),
			]);

			// perms 写入 Redis 缓存，TTL 与 access token 有效期一致（15min）
			await redis.set(
				redisKeys.userPerms(user.id),
				JSON.stringify(userPerms),
				"EX",
				15 * 60,
			);

			// 直接返回原始数据，由 response-wrap 自动包壳
			return {
				tokenType: "Bearer",
				accessToken,
				refreshToken,
				expiresIn: 900,
			};
		},
		{
			body: LoginBody,
			detail: {
				tags: ["Auth"],
				summary: "用户登录",
				description:
					"用户名 + 密码登录，返回双 token（access 15min / refresh 7d）",
				// 公开接口：覆盖全局 security，不显示锁
				security: [],
			},
		},
	)
	.post(
		"/refresh-token",
		async ({ query }) => {
			const { refreshToken } = query;

			// 1. 验证 refresh token
			const oldPayload = await verifyToken(refreshToken);

			// 2. 旧 refresh token 的 jti 加入黑名单（一次性使用）
			await revokeJti(oldPayload.jti, oldPayload.exp);

			// 3. 从 JWT sub（userId）重新查角色/权限，确保刷新后权限是最新的
			const userId = Number(oldPayload.sub);
			const [userRoles, userPerms] = await Promise.all([
				findUserRoles(userId, db),
				findUserPerms(userId, db),
			]);

			const tokenVersion = Number(
				(await redis.get(redisKeys.userTokenVersion(userId))) ?? "0",
			);

			// 4. 签发新的双 token，携带最新权限
			const newPayload = buildJwtPayload(
				{ id: userId, username: oldPayload.username },
				tokenVersion,
				userRoles,
				userPerms,
			);
			const [accessToken, newRefreshToken] = await Promise.all([
				signAccessToken({ ...newPayload, jti: generateJti() }),
				signRefreshToken(newPayload),
			]);

			// 5. 同步更新 Redis 权限缓存
			await redis.set(
				redisKeys.userPerms(userId),
				JSON.stringify(userPerms),
				"EX",
				15 * 60,
			);

			return {
				tokenType: "Bearer",
				accessToken,
				refreshToken: newRefreshToken,
				expiresIn: 900,
			};
		},
		{
			query: RefreshTokenQuery,
			detail: {
				tags: ["Auth"],
				summary: "刷新 token",
				description:
					"用 refresh token 换取新的双 token，旧 refresh token 立即失效",
				// 公开接口：覆盖全局 security，不显示锁
				security: [],
			},
		},
	)
	.delete(
		"/logout",
		async ({ user }) => {
			// macro auth: true 运行时已拦截 null，类型层手动收窄（同 auth.test.ts 写法）
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			await revokeJti(user.jti, user.exp);
			return true;
		},
		{
			auth: true,
			detail: {
				tags: ["Auth"],
				summary: "用户登出",
				description: "注销当前 access token（jti 加入黑名单）",
			},
		},
	)
	.post(
		"/logout-all",
		async ({ user }) => {
			// macro auth: true 运行时已拦截 null，类型层手动收窄
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}
			// 踢全端：递增 tokenVersion 使所有旧 token 失效
			await incrementTokenVersion(Number(user.sub));
			// 同时注销当前 token，防止版本号还没校验就被误用
			await revokeJti(user.jti, user.exp);
			return true;
		},
		{
			auth: true,
			detail: {
				tags: ["Auth"],
				summary: "踢全端登出",
				description: "递增 token 版本号，使该用户所有设备上的 token 全部失效",
			},
		},
	);
