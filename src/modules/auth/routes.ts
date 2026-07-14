import { Elysia } from "elysia";
import { db } from "@/db/client";
import { sysLoginLog } from "@/db/schema/system/login-log";
import {
	IP_FAIL_WINDOW_TTL_S,
	ONLINE_USER_TTL_S,
	PERMS_CACHE_TTL_S,
	ROLE_ROOT,
} from "@/lib/auth-constants";
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
import { addIpToBlacklist } from "@/modules/ip-blacklist/queries";
import { authPlugin } from "@/plugins/auth";
import { rateLimitPlugin } from "@/plugins/rate-limit";
import {
	findActiveUserByUsername,
	findUserPerms,
	findUserRoles,
} from "./queries";
import { LoginBody, RefreshTokenQuery, SwitchTenantQuery } from "./schema";
import type { UserRoleItem } from "./types";

/** 生成唯一 jti */
const generateJti = (): string => {
	return crypto.randomUUID();
};

/**
 * 构建 JWT 载荷
 *
 * 登录时注入真实的 roles / perms / dataScopes / tenantId / canSwitchTenant
 * 这些数据由调用方（/login、/refresh、/switch-tenant）传入
 */
const buildJwtPayload = (
	user: { id: number; username: string },
	tokenVersion: number,
	roles: UserRoleItem[],
	perms: string[],
	tenantId: number,
	canSwitchTenant: boolean,
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
		tenantId,
		canSwitchTenant,
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

/** 从请求头提取客户端 IP */
const getIp = (headers: Headers): string =>
	headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
	headers.get("x-real-ip") ??
	"";

/** 登录日志 + online 数据写入（登录成功时调用） */
const recordLoginSuccess = async (
	user: { id: number; username: string },
	headers: Headers,
): Promise<void> => {
	const ip = getIp(headers);
	const userAgent = headers.get("user-agent")?.slice(0, 512) ?? "";

	await db.insert(sysLoginLog).values({
		userId: user.id,
		username: user.username,
		ip,
		userAgent,
		status: "success",
	});

	await redis.set(
		redisKeys.onlineUser(user.id),
		JSON.stringify({
			username: user.username,
			loginAt: new Date().toISOString(),
			ip,
			userAgent,
		}),
		"EX",
		ONLINE_USER_TTL_S,
	);
};

/** 登录日志写入（登录失败时调用） */
const recordLoginFail = async (
	username: string,
	headers: Headers,
	errorMsg: string,
): Promise<void> => {
	await db.insert(sysLoginLog).values({
		username,
		ip: getIp(headers),
		userAgent: headers.get("user-agent")?.slice(0, 512) ?? "",
		status: "fail",
		errorMsg,
	});
};

/** IP 登录失败次数上限，达到后自动封禁 24h */
const MAX_IP_FAIL_COUNT = 10;
const IP_BAN_DURATION_HOURS = 24;

/** 记录 IP 登录失败，超限时自动加入黑名单 */
const recordIpFail = async (headers: Headers): Promise<void> => {
	const ip = getIp(headers);
	if (!ip) return;

	const key = `blacklist:fail:ip:${ip}`;
	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, IP_FAIL_WINDOW_TTL_S); // 15 分钟窗口
	}

	if (count >= MAX_IP_FAIL_COUNT) {
		const expireAt = new Date(
			Date.now() + IP_BAN_DURATION_HOURS * 60 * 60 * 1000,
		).toISOString();
		await addIpToBlacklist(ip, "登录失败超限自动封禁", expireAt, db);
		await redis.del(key); // 重置计数
	}
};

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
	.use(authPlugin)
	.use(rateLimitPlugin)
	.get(
		"/captcha",
		async () => {
			return generateCaptcha();
		},
		{
			rateLimit: "60:10",
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
		async ({ body, request }) => {
			try {
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
					await recordLoginFail(
						username,
						request.headers,
						"账户已被锁定，请稍后重试",
					);
					await recordIpFail(request.headers);
					throw new BizError(ERR_CODE.ACCOUNT_FROZEN, undefined, 403);
				}

				// 3. 查找有效用户（软删过滤 + 状态正常）
				const user = await findActiveUserByUsername(username, db);
				if (!user) {
					await recordLoginFail(username, request.headers, "用户名或密码错误");
					await recordIpFail(request.headers);
					// 不暴露"用户不存在"，统一提示密码错误（防止枚举用户名）
					throw new BizError(ERR_CODE.USER_PASSWORD_ERROR, undefined, 401);
				}

				// 4. 校验密码
				const isPasswordCorrect = await verifyPassword(password, user.password);
				if (!isPasswordCorrect) {
					await incrementLoginFailCount(username);
					await recordLoginFail(username, request.headers, "用户名或密码错误");
					await recordIpFail(request.headers);
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

				// login: tenantId = home tenant, canSwitchTenant = 是否平台超管
				const tenantId = user.tenantId;
				const canSwitchTenant = userRoles.some((r) => r.code === ROLE_ROOT);

				const payload = buildJwtPayload(
					user,
					tokenVersion,
					userRoles,
					userPerms,
					tenantId,
					canSwitchTenant,
				);

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
					PERMS_CACHE_TTL_S,
				);

				// 登录日志 + 在线状态
				await recordLoginSuccess(user, request.headers);

				// 直接返回原始数据，由 response-wrap 自动包壳
				return {
					tokenType: "Bearer",
					accessToken,
					refreshToken,
					expiresIn: 900,
				};
			} catch (err) {
				// 非 BizError 的未知异常也记录登录失败（如数据库连接异常等）
				if (err instanceof BizError && err.code !== ERR_CODE.ACCOUNT_FROZEN) {
					// 已在上层各分支记录过 loginLog，不重复记录
					// ACCOUNT_FROZEN / USER_PASSWORD_ERROR 已在抛出前记录
					throw err;
				}
				if (!(err instanceof BizError)) {
					// 未知错误也记录登录日志
					const username = (body as { username?: string })?.username ?? "";
					await recordLoginFail(username, request.headers, "系统内部错误");
				}
				throw err;
			}
		},
		{
			body: LoginBody,
			rateLimit: "60:5",
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
			if (!refreshToken)
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);

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

			// refresh: 保留数据视图 tenantId + canSwitchTenant，不重算
			const tenantId = oldPayload.tenantId;
			const canSwitchTenant = oldPayload.canSwitchTenant;

			// 4. 签发新的双 token，携带最新权限
			const newPayload = buildJwtPayload(
				{ id: userId, username: oldPayload.username },
				tokenVersion,
				userRoles,
				userPerms,
				tenantId,
				canSwitchTenant,
			);
			const [accessToken, newRefreshToken] = await Promise.all([
				signAccessToken({ ...newPayload, jti: generateJti() }),
				signRefreshToken(newPayload),
			]);

			// 5. 同步更新 Redis 权限缓存 + 延长在线状态 TTL
			await redis.set(
				redisKeys.userPerms(userId),
				JSON.stringify(userPerms),
				"EX",
				PERMS_CACHE_TTL_S,
			);

			// 延长在线状态 TTL（用户活跃中）
			const onlineKey = redisKeys.onlineUser(userId);
			const onlineData = await redis.get(onlineKey);
			if (onlineData) {
				await redis.expire(onlineKey, ONLINE_USER_TTL_S);
			}

			return {
				tokenType: "Bearer",
				accessToken,
				refreshToken: newRefreshToken,
				expiresIn: 900,
			};
		},
		{
			query: RefreshTokenQuery,
			rateLimit: "60:10",
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
	.post(
		"/switch-tenant",
		async ({ user, query }) => {
			if (!user) {
				throw new BizError(ERR_CODE.ACCESS_TOKEN_INVALID, undefined, 401);
			}

			const { tenantId } = query;
			if (tenantId === undefined || tenantId === null) {
				throw new BizError(
					ERR_CODE.ACCESS_TOKEN_INVALID,
					"缺少 tenantId 参数",
					400,
				);
			}

			// 平台超管可切换到任何租户；普通用户只能切到自身所属租户
			const isRoot = user.roles.includes(ROLE_ROOT);
			if (!isRoot && user.tenantId !== tenantId) {
				throw new BizError(
					ERR_CODE.ACCESS_TOKEN_INVALID,
					"无权限切换到该租户",
					403,
				);
			}

			// 重签 token（新 tenantId，canSwitchTenant 保持不变）
			const [accessToken, refreshToken] = await Promise.all([
				signAccessToken({
					...user,
					tenantId,
					canSwitchTenant: user.canSwitchTenant,
					jti: generateJti(),
				}),
				signRefreshToken({
					...user,
					tenantId,
					canSwitchTenant: user.canSwitchTenant,
					jti: generateJti(),
				}),
			]);

			return {
				tokenType: "Bearer",
				accessToken,
				refreshToken,
				expiresIn: 900,
			};
		},
		{
			query: SwitchTenantQuery,
			auth: true,
			rateLimit: "30:10",
			detail: {
				tags: ["Auth"],
				summary: "切换租户",
				description:
					"平台超管切换数据视图租户，返回新 token（tenantId 更新，perms/roles 不变）",
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
			await redis.del(redisKeys.onlineUser(Number(user.sub)));
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
			// 清除在线状态
			await redis.del(redisKeys.onlineUser(Number(user.sub)));
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
