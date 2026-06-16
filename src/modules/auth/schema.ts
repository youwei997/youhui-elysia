import { z } from "zod";

/** 登录请求体 */
export const LoginBody = z
	.object({
		username: z.string().describe("用户名"),
		password: z.string().describe("密码"),
	})
	.describe("登录请求参数");

/** 刷新 token 请求体 */
export const RefreshBody = z
	.object({
		refreshToken: z.string().describe("刷新令牌"),
	})
	.describe("刷新 token 请求参数");
