import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { sysFile } from "@/db/schema/system/file";

/** 新建文件元数据 */
export const createFile = async (
	data: {
		key: string;
		filename: string;
		size: number;
		mimeType: string | null;
		url: string;
		uploaderId: number | undefined;
	},
	db: DB,
) => {
	const [row] = await db.insert(sysFile).values(data).returning();
	return row;
};

/** 按 url 反查文件元数据，只查未软删 */
export const findFileByUrl = async (url: string, db: DB) => {
	const [row] = await db
		.select()
		.from(sysFile)
		.where(and(eq(sysFile.url, url), isNull(sysFile.deleteTime)))
		.limit(1);
	return row ?? null;
};

/** 软删文件元数据 */
export const softDeleteFile = async (id: number, db: DB) => {
	const [row] = await db
		.update(sysFile)
		.set({ deleteTime: new Date().toISOString() })
		.where(eq(sysFile.id, id))
		.returning();
	return row ?? null;
};
