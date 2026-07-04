import fs from "node:fs";
import path from "node:path";
import type { Storage } from "./types";

/**
 * 创建本地文件系统 driver
 * @param rootDir 文件存储根目录
 * @param publicBaseUrl 文件可访问的基础 URL
 */
export const createLocalFsStorage = (
	rootDir: string,
	publicBaseUrl: string,
): Storage => {
	const resolvedRoot = path.resolve(rootDir);

	const resolveKey = (key: string): string => {
		const fullPath = path.resolve(resolvedRoot, key);
		if (!fullPath.startsWith(resolvedRoot + path.sep) && fullPath !== resolvedRoot) {
			throw new Error("Invalid storage key");
		}
		return fullPath;
	};

	return {
		async put(key, data, _opts) {
			const fullPath = resolveKey(key);
			await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
			// Bun.write 在 union 类型（Buffer|ReadableStream）上 overload 歧义，先归一为 Buffer
			let buf: Buffer;
			if (data instanceof Buffer) {
				buf = data;
			} else {
				buf = Buffer.from(await new Response(data).arrayBuffer());
			}
			await Bun.write(fullPath, buf);
			return { url: new URL(key, `${publicBaseUrl}/`).toString() };
		},
		async delete(key) {
			const fullPath = resolveKey(key);
			try {
				await fs.promises.unlink(fullPath);
			} catch (err: unknown) {
				// 文件不存在 = 幂等成功
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
			}
		},
	};
};
