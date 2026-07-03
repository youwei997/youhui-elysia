import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";

/**
 * 生成存储 key
 * 格式：{yyyyMMdd}/{uuid}.{ext}
 * 不用原文件名：防冲突 + 防路径穿越
 * @param originalFilename 原始文件名
 */
export const buildStorageKey = (originalFilename: string): string => {
	const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const ext = path.extname(originalFilename).slice(1).toLowerCase();
	const uuid = randomUUID();
	return ext ? `${date}/${uuid}.${ext}` : `${date}/${uuid}`;
};

/** 文件信息响应（对齐前端 FileInfo 契约，仅 name + url） */
export const FileInfoResponse = z
	.object({
		name: z.string().describe("原始文件名"),
		url: z.string().describe("永久可访问的 URL"),
	})
	.describe("文件信息");

/** FileInfoResponse.parse 的输入类型 */
export type FileResponseInput = z.input<typeof FileInfoResponse>;

/** 删除文件查询参数 */
export const FileDeleteQuery = z
	.object({
		filePath: z.string().describe("文件完整 URL"),
	})
	.describe("删除文件查询参数");
