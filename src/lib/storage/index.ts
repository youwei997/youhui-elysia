import { config } from "@/config";
import { createLocalFsStorage } from "./local-fs";
import { createS3Storage } from "./s3";
import type { Storage, StorageConfig } from "./types";

/**
 * 根据配置创建存储实例
 * @param cfg driver 配置（local-fs / s3）
 */
export const createStorage = (cfg: StorageConfig): Storage => {
	switch (cfg.driver) {
		case "local-fs":
			return createLocalFsStorage(cfg.rootDir, cfg.publicBaseUrl);
		case "s3":
			return createS3Storage(cfg);
		default: {
			const _exhaustive: never = cfg;
			throw new Error(`Unknown storage driver: ${_exhaustive}`);
		}
	}
};

/**
 * 从环境变量构造 StorageConfig
 * @param cfg 应用配置对象
 */
const buildStorageConfigFromEnv = (cfg: typeof config): StorageConfig => {
	if (cfg.STORAGE_DRIVER === "s3") {
		return {
			driver: "s3",
			endpoint: cfg.S3_ENDPOINT as string,
			region: cfg.S3_REGION,
			bucket: cfg.S3_BUCKET as string,
			accessKeyId: cfg.S3_ACCESS_KEY_ID as string,
			secretAccessKey: cfg.S3_SECRET_ACCESS_KEY as string,
			...(cfg.S3_PUBLIC_BASE_URL && { publicBaseUrl: cfg.S3_PUBLIC_BASE_URL }),
		};
	}
	return {
		driver: "local-fs",
		rootDir: cfg.LOCAL_FS_ROOT,
		publicBaseUrl: cfg.LOCAL_FS_PUBLIC_BASE_URL,
	};
};

/** 全局存储单例，模块层直接使用 */
export const storage: Storage = createStorage(
	buildStorageConfigFromEnv(config),
);
