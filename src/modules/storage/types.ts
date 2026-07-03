import type { sysFile } from "@/db/schema/system/file";

/** sys_file 表原始记录类型 */
export type FileRecord = typeof sysFile.$inferSelect;

/** createFile 参数类型 */
export type FileCreateData = {
	key: string;
	filename: string;
	size: number;
	mimeType: string | null;
	url: string;
	uploaderId: number | undefined;
};
