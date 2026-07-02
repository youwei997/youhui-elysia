import type { Storage, StorageConfig } from "./types";

/**
 * S3 兼容 driver（占位）
 *
 * ponytail: 最小可工作版本。用户明确"只测试 s3/minio 能接通即可，线上用 local-fs"。
 * 5.4.5 实现完整版。
 */
export const createS3Storage = (
	_cfg: StorageConfig & { driver: "s3" },
): Storage => {
	throw new Error("S3 driver not implemented yet (5.4.5)");
};
