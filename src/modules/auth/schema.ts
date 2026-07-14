import { z } from "zod";

/** 登录请求体 */
export const LoginBody = z
	.object({
		username: z.string().describe("用户名"),
		password: z.string().describe("密码"),
		captchaId: z.string().optional().describe("验证码缓存 ID"),
		captchaCode: z.string().optional().describe("验证码"),
	})
	.describe("登录请求参数");

/** 刷新 token 查询参数（前端 axios params 传 query string） */
export const RefreshTokenQuery = z
	.object({
		refreshToken: z.string().describe("刷新令牌"),
	})
	.describe("刷新 token 查询参数");

/** 切换租户查询参数 */
export const SwitchTenantQuery = z
	.object({
		tenantId: z.number().describe("目标租户 ID"),
	})
	.describe("切换租户查询参数");
