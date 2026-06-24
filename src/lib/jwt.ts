import { jwtVerify, SignJWT } from "jose";
import { config } from "@/config";
import { ERR_CODE, unauthorized } from "@/lib/errors";
import { redis } from "./redis";
import { redisKeys } from "./redis-keys";

/** JWT 签名密钥（UTF-8 编码） */
const SECRET = new TextEncoder().encode(config.JWT_SECRET);

/** access token 有效期 */
const ACCESS_EXPIRES = "15m";

/** refresh token 有效期 */
const REFRESH_EXPIRES = "7d";

/**
 * JWT Payload 结构
 * 与 Elysia auth plugin 共享，用于 derive ctx.user
 */
export type JwtPayload = {
	/** 用户 ID（对应 sys_user.id） */
	sub: string;
	/** 用户名 */
	username: string;
	/** 角色编码列表 */
	roles: string[];
	/** 权限编码列表 */
	perms: string[];
	/** 数据权限范围 */
	dataScopes: number[];
	/** 用户级 token 版本号，改密码 / 踢全部端时 +1 */
	tokenVersion: number;
	/** 单 token 唯一标识，用于注销 */
	jti: string;
	/** 过期时间（Unix 秒，由 jose setExpirationTime 注入） */
	exp?: number;
};

/**
 * 生成 access token（15 分钟有效期）
 * @param payload JWT 载荷（含 jti，由调用方生成）
 * @returns JWT 字符串
 */
export const signAccessToken = async (payload: JwtPayload): Promise<string> => {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(ACCESS_EXPIRES)
		.sign(SECRET);
};

/**
 * 生成 refresh token（7 天有效期）
 * @param payload JWT 载荷（含 jti，由调用方生成）
 * @returns JWT 字符串
 */
export const signRefreshToken = async (
	payload: JwtPayload,
): Promise<string> => {
	return new SignJWT({ ...payload })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime(REFRESH_EXPIRES)
		.sign(SECRET);
};

/**
 * 验证 token
 *
 * 完整校验链：验签 + exp → 查 tokenVersion → 查 jti 黑名单
 *
 * @param token JWT 字符串
 * @returns 解码后的 payload
 * @throws {BizError} tokenVersion 不匹配或 jti 被注销时抛 401
 * @throws 验签失败、过期等 jose 原生错误（由调用方处理）
 */
export const verifyToken = async (token: string): Promise<JwtPayload> => {
	const { payload } = await jwtVerify(token, SECRET, {
		// 允许 60 秒时钟偏差，避免边缘过期
		clockTolerance: 60,
	});

	// jose 的 jwtVerify 返回 payload 类型为 JWTPayload，无法直接收窄到我们的 JwtPayload
	// 这里显式断言，因为结构在签发时就是 JwtPayload，只是 TS 层面丢失
	const jwtPayload = payload as unknown as JwtPayload;

	// 第二层：校验 tokenVersion（用户级版本号，改密码 / 踢全部端时失效）
	const currentVersion = await redis.get(
		redisKeys.userTokenVersion(jwtPayload.sub),
	);
	// null 表示从未设置过（新用户），直接放行；有值才比对
	if (
		currentVersion !== null &&
		Number(currentVersion) !== jwtPayload.tokenVersion
	) {
		throw unauthorized(ERR_CODE.ACCESS_TOKEN_INVALID);
	}

	// 第三层：校验 jti 黑名单（单 token 注销）
	const revoked = await redis.get(redisKeys.revokedToken(jwtPayload.jti));
	// 从redis取到值说明 jti 在黑名单中，token 已被单独注销
	if (revoked !== null) {
		throw unauthorized(ERR_CODE.ACCESS_TOKEN_INVALID);
	}

	return jwtPayload;
};
