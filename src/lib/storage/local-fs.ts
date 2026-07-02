import fs from "node:fs";
import path from "node:path";
import type { Storage, StorageConfig } from "./types";

/**
 * 本地文件系统 driver
 *
 * - put：Bun.write 写文件，new URL() 构造永久可访问 url
 * - delete：fs.unlink 删文件，文件不存在静默忽略（幂等）
 *
 * ponytail: 生产环境慎用（无冗余、无 CDN），生产切 s3 driver
 */
export const createLocalFsStorage = (
	cfg: StorageConfig & { driver: "local-fs" },
): Storage => {
	const { rootDir, publicBaseUrl } = cfg;

	return {
		async put(key, data, _opts) {
			const fullPath = path.join(rootDir, key);
			await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
			// Bun.write 的 overload 在 union 类型上会歧义，
			// 先转 Buffer 再写（ReadableStream 也可通过 Response 转）
			const buf =
				data instanceof Buffer
					? data
					: Buffer.from(await new Response(data).arrayBuffer());
			await Bun.write(fullPath, buf);
			return { url: new URL(key, `${publicBaseUrl}/`).toString() };
		},

		async delete(key) {
			const fullPath = path.join(rootDir, key);
			try {
				await fs.promises.unlink(fullPath);
			} catch (err: unknown) {
				// 文件不存在 = 幂等成功
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
			}
		},
	};
};
