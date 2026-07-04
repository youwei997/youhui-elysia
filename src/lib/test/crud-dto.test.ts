import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
	auditKeys,
	createInsertDto,
	createListQuery,
	createUpdateDto,
} from "../crud-dto";
import { sysUser } from "@/db/schema/system/user";

describe("crud-dto", () => {
	test("auditKeys 包含所有审计字段", () => {
		expect(auditKeys).toEqual({
			id: true,
			createdBy: true,
			createTime: true,
			updatedBy: true,
			updateTime: true,
			deleteTime: true,
		});
	});

	test("createListQuery 默认包含分页字段", () => {
		const schema = createListQuery(sysUser);
		const result = schema.parse({ pageNum: 1, pageSize: 20 });
		expect(result.pageNum).toBe(1);
		expect(result.pageSize).toBe(20);
	});

	test("createListQuery 合并自定义 fields", () => {
		const schema = createListQuery(sysUser, {
			username: z.string().optional(),
			status: z.number().optional(),
		});
		const result = schema.parse({
			pageNum: 1,
			pageSize: 10,
			username: "admin",
			status: 1,
		}) as unknown as { username: string; status: number };
		expect(result.username).toBe("admin");
		expect(result.status).toBe(1);
	});

	test("createInsertDto 返回有效 zod schema 且包含必填字段", () => {
		const schema = createInsertDto(sysUser);
		expect(schema instanceof z.ZodObject).toBe(true);

		// username / password 是必填，其他可选
		const result = schema.parse({
			username: "test",
			password: "hashed-pw",
			status: 1,
		});
		expect(result.username).toBe("test");
		expect(result.status).toBe(1);
	});

	test("createInsertDto 校验失败抛 ZodError", () => {
		const schema = createInsertDto(sysUser);
		expect(() => schema.parse({})).toThrow();
	});

	test("createUpdateDto 所有字段可选", () => {
		const schema = createUpdateDto(sysUser);
		expect(schema instanceof z.ZodObject).toBe(true);

		// 空对象应通过（全可选）
		const result = schema.parse({});
		expect(result).toEqual({});
	});

	test("createUpdateDto 部分更新正常", () => {
		const schema = createUpdateDto(sysUser);
		const result = schema.parse({ nickname: "new-name" });
		expect(result.nickname).toBe("new-name");
	});
});
