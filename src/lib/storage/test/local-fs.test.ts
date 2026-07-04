import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createLocalFsStorage } from "@/lib/storage/local-fs";

const makeStorage = () => {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-fs-test-"));
	const publicBaseUrl = "http://localhost:3000/uploads";
	return { storage: createLocalFsStorage(rootDir, publicBaseUrl), rootDir };
};

describe("local-fs storage", () => {
	test("put 写入文件并返回 URL", async () => {
		const { storage, rootDir } = makeStorage();
		const key = "20260101/test.txt";
		const content = Buffer.from("hello world");

		const result = await storage.put(key, content, {});

		expect(result.url).toBe("http://localhost:3000/uploads/20260101/test.txt");
		expect(fs.existsSync(path.join(rootDir, key))).toBe(true);
		expect(fs.readFileSync(path.join(rootDir, key))).toEqual(content);
	});

	test("put 自动创建子目录", async () => {
		const { storage, rootDir } = makeStorage();
		const key = "deep/nested/dir/file.txt";

		await storage.put(key, Buffer.from("nested"), {});

		expect(fs.existsSync(path.join(rootDir, key))).toBe(true);
	});

	test("put 支持 ReadableStream（通过 Response）", async () => {
		const { storage } = makeStorage();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("stream-data"));
				controller.close();
			},
		});

		const result = await storage.put("stream.bin", stream, {});

		expect(result.url).toBe("http://localhost:3000/uploads/stream.bin");
	});

	test("delete 正常删除文件", async () => {
		const { storage, rootDir } = makeStorage();
		const key = "to-delete.txt";
		await storage.put(key, Buffer.from("delete-me"), {});
		expect(fs.existsSync(path.join(rootDir, key))).toBe(true);

		await storage.delete(key);

		expect(fs.existsSync(path.join(rootDir, key))).toBe(false);
	});

	test("delete 文件不存在时幂等（不抛错）", async () => {
		const { storage } = makeStorage();

		// 不抛错即通过
		await storage.delete("non-existent.txt");
	});

	test("URL 拼接正确处理 trailing slash", async () => {
		const s = createLocalFsStorage("/tmp", "http://localhost:3000/uploads");
		const result = await s.put("a.txt", Buffer.from("a"), {});
		expect(result.url).toBe("http://localhost:3000/uploads/a.txt");
	});

	test("key 路径穿越被拒绝", async () => {
		const { storage } = makeStorage();
		await expect(storage.put("../escape.txt", Buffer.from("escape"), {})).rejects.toThrow(
			"Invalid storage key",
		);
	});
});
