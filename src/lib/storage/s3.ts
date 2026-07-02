import type { Storage, StorageConfig } from "./types";

/**
 * 创建 S3 兼容存储 driver
 * 5.4.5 实现完整版
 * @param _cfg S3 存储配置
 */
export const createS3Storage = (
	_cfg: StorageConfig & { driver: "s3" },
): Storage => {
	throw new Error("S3 driver not implemented yet (5.4.5)");
};
