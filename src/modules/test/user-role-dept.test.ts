import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysDept } from "@/db/schema/system/dept";
import { sysRole } from "@/db/schema/system/role";
import { sysRoleDept, sysUserRole } from "@/db/schema/system/relation";
import { sysUser } from "@/db/schema/system/user";
import { DATA_SCOPE, type DataScopeContext } from "@/db/helpers/data-scope";
import { findUsers } from "@/modules/user/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_DEPT_ID = 100;
const TEST_USER_ID = 100;
const TEST_ROLE_ID = 100;

const cleanUp = async () => {
	await db.delete(sysUserRole).where(eq(sysUserRole.userId, TEST_USER_ID));
	await db.delete(sysUser).where(eq(sysUser.id, TEST_USER_ID));
	await db.delete(sysRoleDept).where(eq(sysRoleDept.roleId, TEST_ROLE_ID));
	await db.delete(sysRole).where(eq(sysRole.id, TEST_ROLE_ID));
	await db.delete(sysDept).where(eq(sysDept.id, TEST_DEPT_ID));
};

describe("user + role + dept 联合查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysDept).values({
			id: TEST_DEPT_ID,
			name: "测试联合查询部门",
			code: "TEST_JOIN",
			parentId: 0,
			treePath: "0",
			sort: 99,
			status: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysRole).values({
			id: TEST_ROLE_ID,
			name: "测试角色",
			code: "TEST_ROLE_JOIN",
			sort: 99,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysUser).values({
			id: TEST_USER_ID,
			username: "jointest",
			nickname: "联合测试用户",
			gender: 1,
			password: "test",
			deptId: TEST_DEPT_ID,
			status: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysUserRole).values({
			userId: TEST_USER_ID,
			roleId: TEST_ROLE_ID,
		});
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findUsers leftJoin dept 返回 deptName", async () => {
		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.ALL }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10, keywords: "jointest" },
			ctx,
			db,
		);

		expect(result.list.length).toBeGreaterThanOrEqual(1);
		const user = result.list.find((u) => u.id === TEST_USER_ID);
		expect(user).toBeDefined();
		expect(user?.deptName).toBe("测试联合查询部门");
	});

	test("findUsers dataScope=ALL 不过滤", async () => {
		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.ALL }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10, deptId: TEST_DEPT_ID },
			ctx,
			db,
		);
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	test("findUsers dataScope=SELF 只返回本人", async () => {
		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.SELF }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10 },
			ctx,
			db,
		);
		expect(result.list.every((u) => u.id === TEST_USER_ID)).toBe(true);
	});

	test("findUsers dataScope=DEPT 只返回本部门", async () => {
		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.DEPT }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10 },
			ctx,
			db,
		);
		expect(result.list.every((u) => u.deptId === TEST_DEPT_ID)).toBe(true);
	});

	test("findUsers dataScope=DEPT_AND_SUB 返回部门及子部门", async () => {
		// 插入一个子部门
		const childDeptId = 101;
		const childUserId = 101;
		const now = new Date().toISOString();
		await db.insert(sysDept).values({
			id: childDeptId,
			name: "测试子部门",
			code: "TEST_CHILD",
			parentId: TEST_DEPT_ID,
			treePath: `0,${TEST_DEPT_ID}`,
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysUser).values({
			id: childUserId,
			username: "childdeptuser",
			nickname: "子部门用户",
			gender: 1,
			password: "test",
			deptId: childDeptId,
			status: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});

		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.DEPT_AND_SUB }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10 },
			ctx,
			db,
		);
		const ids = result.list.map((u) => u.id);
		expect(ids).toContain(TEST_USER_ID);
		expect(ids).toContain(childUserId);

		await db.delete(sysUser).where(eq(sysUser.id, childUserId));
		await db.delete(sysDept).where(eq(sysDept.id, childDeptId));
	});

	test("findUsers dataScope=CUSTOM 返回自定义部门列表", async () => {
		await db.insert(sysRoleDept).values({
			roleId: TEST_ROLE_ID,
			deptId: TEST_DEPT_ID,
		});

		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.CUSTOM, customDeptIds: [TEST_DEPT_ID] }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10 },
			ctx,
			db,
		);
		expect(result.list.every((u) => u.deptId === TEST_DEPT_ID)).toBe(true);
	});

	test("findUsers keywords 模糊匹配 username 和 nickname", async () => {
		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.ALL }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10, keywords: "联合" },
			ctx,
			db,
		);
		expect(result.list.some((u) => u.id === TEST_USER_ID)).toBe(true);
	});

	test("findUsers 软删用户不返回", async () => {
		await db
			.update(sysUser)
			.set({ deleteTime: new Date().toISOString() })
			.where(eq(sysUser.id, TEST_USER_ID));

		const ctx: DataScopeContext = {
			userId: TEST_USER_ID,
			deptId: TEST_DEPT_ID,
			treePath: "0",
			scopes: [{ scope: DATA_SCOPE.ALL }],
		};

		const result = await findUsers(
			{ pageNum: 1, pageSize: 10 },
			ctx,
			db,
		);
		expect(result.list.some((u) => u.id === TEST_USER_ID)).toBe(false);

		await db
			.update(sysUser)
			.set({ deleteTime: null })
			.where(eq(sysUser.id, TEST_USER_ID));
	});
});
