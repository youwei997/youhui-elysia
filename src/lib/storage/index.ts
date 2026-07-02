import { config } from "@/config";
import { createLocalFsStorage } from "./local-fs";
import { createS3Storage } from "./s3";
import type { Storage, StorageConfig } from "./types";

/** 运行时校验：env 字段在特定分支下必须存在 */
function req<T>(v: T | undefined, name: string): T {
	if (v === undefined)
		throw new Error(`STORAGE_DRIVER=s3 缺少必要环境变量: ${name}`);
	return v;
}

/**
 * 根据 config 创建 Storage 实例
 * env 切 driver 不改业务代码
 */
export const createStorage = (cfg: StorageConfig): Storage => {
	switch (cfg.driver) {
		case "local-fs":
			return createLocalFsStorage(cfg);
		case "s3":
			return createS3Storage(cfg);
		default: {
			// cfg.driver 来自 env schema 的 z.enum，compile-time 不会走到这里
			const _exhaustive: never = cfg;
			throw new Error(`Unknown storage driver: ${_exhaustive}`);
		}
	}
};

/** 从 env 构造 StorageConfig */
const buildStorageConfigFromEnv = (cfg: typeof config): StorageConfig => {
	if (cfg.STORAGE_DRIVER === "s3") {
		const s3cfg: StorageConfig & { driver: "s3" } = {
			driver: "s3",
			endpoint: req(cfg.S3_ENDPOINT, "S3_ENDPOINT"),
			region: cfg.S3_REGION,
			bucket: req(cfg.S3_BUCKET, "S3_BUCKET"),
			accessKeyId: req(cfg.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
			secretAccessKey: req(cfg.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
		};
		if (cfg.S3_PUBLIC_BASE_URL) {
			s3cfg.publicBaseUrl = cfg.S3_PUBLIC_BASE_URL;
		}
		return s3cfg;
	}
	return {
		driver: "local-fs",
		rootDir: cfg.LOCAL_FS_ROOT,
		publicBaseUrl: cfg.LOCAL_FS_PUBLIC_BASE_URL,
	};
};

/**
 * 全局单例（启动时初始化一次）
 * 模块层直接 import { storage } 使用
 * ponytail: 不另建 init() 函数，顶层 const 导出即可
 */
export const storage: Storage = createStorage(
	buildStorageConfigFromEnv(config),
);
