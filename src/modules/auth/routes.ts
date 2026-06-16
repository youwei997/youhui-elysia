import { Elysia } from "elysia";
import { BizError, ERR_CODE } from "@/lib/errors";
import type { JwtPayload } from "@/lib/jwt";
import { signAccessToken, signRefreshToken, verifyToken } from "@/lib/jwt";
import { verifyPassword } from "@/lib/password";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { authPlugin } from "@/plugins/auth";
import {
	clearLoginFailCount,
	findActiveUserByUsername,
	incrementLoginFailCount,
	incrementTokenVersion,
	isAccountLocked,
} from "./queries";
import { LoginBody, RefreshBody } from "./schema";

/** 生成唯一 jti */
const generateJti = (): string => {
	return crypto.randomUUID();
};

/**
 * 构建 JWT 载荷
 * 从数据库用户行提取必要字段，组合成 JwtPayload
 * roles/perms/dataScopes 在阶段 3.8 用户-角色关联后填充
 */
const buildJwtPayload = (
	user: { id: number; username: string },
	tokenVersion: number,
): JwtPayload => {
	return {
		sub: String(user.id),
		username: user.username,
		roles: [],
		perms: [],
		dataScopes: [],
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

export const authRoutes = new Elysia({ prefix: "/auth" })
	.use(authPlugin)
	.post(
		"/login",
		async ({ body }) => {
			const { username, password } = body;

			// 1. 检查账户是否因连续失败被锁定
			if (await isAccountLocked(username)) {
				throw new BizError(ERR_CODE.ACCOUNT_FROZEN, undefined, 403);
			}

			// 2. 查找有效用户（软删过滤 + 状态正常）
			const user = await findActiveUserByUsername(username);
			if (!user) {
				// 不暴露"用户不存在"，统一提示密码错误（防止枚举用户名）
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			// 3. 校验密码
			const valid = await verifyPassword(password, user.password);
			if (!valid) {
				await incrementLoginFailCount(username);
				throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
			}

			// 4. 登录成功：清除失败计数，签发双 token
			await clearLoginFailCount(username);

			const tokenVersion = Number(
				(await redis.get(redisKeys.userTokenVersion(user.id))) ?? "0",
			);
			const payload = buildJwtPayload(user, tokenVersion);

			// access 和 refresh 用不同的 jti，refresh 的 jti 不在这里黑名单
			const [accessToken, refreshToken] = await Promise.all([
				signAccessToken({ ...payload, jti: generateJti() }),
				signRefreshToken(payload),
			]);

			// 直接返回原始数据，由 response-wrap 自动包壳
			return { accessToken, refreshToken };
		},
		{
			body: LoginBody,
			detail: {
				tags: ["Auth"],
				summary: "用户登录",
				description:
					"用户名 + 密码登录，返回双 token（access 15min / refresh 7d）",
			},
		},
	)
	.post(
		"/refresh",
		async ({ body }) => {
			const { refreshToken } = body;

			// 1. 验证 refresh token
			const payload = await verifyToken(refreshToken);

			// 2. 旧 refresh token 的 jti 加入黑名单（一次性使用）
			await revokeJti(payload.jti, payload.exp);

			// 3. 签发新的双 token（每个都用独立 jti）
			const newPayload: JwtPayload = {
				...payload,
				jti: generateJti(),
			};
			const [accessToken, newRefreshToken] = await Promise.all([
				signAccessToken({ ...newPayload, jti: generateJti() }),
				signRefreshToken(newPayload),
			]);

			return { accessToken, refreshToken: newRefreshToken };
		},
		{
			body: RefreshBody,
			detail: {
				tags: ["Auth"],
				summary: "刷新 token",
				description:
					"用 refresh token 换取新的双 token，旧 refresh token 立即失效",
			},
		},
	)
	.post(
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
