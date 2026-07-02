import { z } from "zod";

/**
 * 环境变量校验 schema
 */
const envSchema = z.object({
	// 数据库
	DATABASE_URL: z.string().url().describe("PostgreSQL 连接地址"),
	// Redis
	REDIS_URL: z.string().describe("Redis 连接地址"),
	// JWT
	JWT_SECRET: z
		.string()
		.min(16)
		.describe("JWT 签名密钥，生产环境请换长随机字符串"),
	// 应用
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	// 存储
	STORAGE_DRIVER: z.enum(["local-fs", "s3"]).default("local-fs"),

	// local-fs driver
	LOCAL_FS_ROOT: z.string().default("./uploads"),
	LOCAL_FS_PUBLIC_BASE_URL: z.string().default("http://localhost:3000/uploads"),

	// s3 driver
	S3_ENDPOINT: z.string().optional(),
	S3_REGION: z.string().default("us-east-1"),
	S3_BUCKET: z.string().optional(),
	S3_ACCESS_KEY_ID: z.string().optional(),
	S3_SECRET_ACCESS_KEY: z.string().optional(),
	S3_PUBLIC_BASE_URL: z.string().optional(),
});

/** 校验后的配置对象类型 */
export type Config = z.infer<typeof envSchema>;

/**
 * 校验环境变量并返回强类型配置对象
 * 启动时 fail-fast，缺值/格式错直接抛出具体错误
 */
export const config: Config = (() => {
	try {
		return envSchema.parse(process.env);
	} catch (err) {
		if (err instanceof z.ZodError) {
			const messages = err.issues.map(
				(e) => `  - ${e.path.join(".")}: ${e.message}`,
			);
			console.error(`❌ 环境变量校验失败:\n${messages.join("\n")}`);
			process.exit(1);
		}
		throw err;
	}
})();
