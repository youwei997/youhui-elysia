import { Elysia, t } from "elysia";
import { db } from "@/db/client";
import { BizError, ERR_CODE } from "@/lib/errors";
import { storage } from "@/lib/storage";
import { authPlugin } from "@/plugins/auth";
import { createFile, findFileByUrl, softDeleteFile } from "./queries";
import { buildStorageKey } from "./schema";

export const storageRoutes = new Elysia({ prefix: "/api/v1/files" })
	.use(authPlugin)
	.post(
		"/",
		async ({ body, user }) => {
			const file = body.file;
			if (file.size === 0) {
				throw new BizError(ERR_CODE.USER_REQUEST_PARAMETER_ERROR, "文件为空");
			}
			if (file.size > 50 * 1024 * 1024) {
				throw new BizError(
					ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
					"文件超过 50MB",
				);
			}
			const key = buildStorageKey(file.name);
			let url: string;
			try {
				({ url } = await storage.put(key, file.stream(), {
					contentType: file.type,
				}));
			} catch {
				throw new BizError(ERR_CODE.FILE_UPLOAD_FAILED, "文件上传失败");
			}
			await createFile(
				{
					key,
					filename: file.name,
					size: file.size,
					mimeType: file.type,
					url,
					uploaderId: user?.sub ? Number(user.sub) : undefined,
				},
				db,
			);
			return { name: file.name, url };
		},
		{
			auth: true,
			requirePerm: ["sys:file:upload"],
			audit: "file:upload",
			body: t.Object({ file: t.File() }),
			detail: { tags: ["File"], summary: "上传文件" },
		},
	)
	.delete(
		"/",
		async ({ query }) => {
			const filePath = query.filePath;
			const file = await findFileByUrl(filePath, db);
			if (!file) {
				throw new BizError(ERR_CODE.FILE_NOT_FOUND, "文件不存在", 404);
			}
			await storage.delete(file.key);
			await softDeleteFile(file.id, db);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:file:delete"],
			audit: "file:delete",
			query: t.Object({ filePath: t.String() }),
			detail: { tags: ["File"], summary: "删除文件" },
		},
	);
