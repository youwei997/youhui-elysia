import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import { tenantEq } from "@/db/helpers/tenant";
import { sysFile } from "@/db/schema/system/file";
import type { FileCreateData } from "./types";

/** 新建文件元数据 */
export const createFile = async (
	data: FileCreateData,
	tenantId: number,
	db: DB,
) => {
	const [row] = await db
		.insert(sysFile)
		.values({ ...data, tenantId })
		.returning();
	return row;
};

/** 按 url 反查文件元数据，只查未软删 */
export const findFileByUrl = async (url: string, tenantId: number, db: DB) => {
	const [row] = await db
		.select()
		.from(sysFile)
		.where(
			and(
				eq(sysFile.url, url),
				tenantEq(sysFile.tenantId, tenantId),
				isNull(sysFile.deleteTime),
			),
		)
		.limit(1);
	return row ?? null;
};

/** 软删文件元数据 */
export const softDeleteFile = async (id: number, tenantId: number, db: DB) => {
	const [row] = await db
		.update(sysFile)
		.set({ deleteTime: new Date().toISOString() })
		.where(and(eq(sysFile.id, id), tenantEq(sysFile.tenantId, tenantId)))
		.returning();
	return row ?? null;
};
