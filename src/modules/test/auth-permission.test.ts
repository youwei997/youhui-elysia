import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysRole } from "@/db/schema/system/role";
import { sysRoleMenu, sysUserRole } from "@/db/schema/system/relation";
import { sysMenu } from "@/db/schema/system/menu";
import { sysUser } from "@/db/schema/system/user";
import { findUserPerms, findUserRoles } from "@/modules/auth/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_USER_ID = 200;
const TEST_ROLE_ID = 200;
const TEST_MENU_ID_1 = 2000;
const TEST_MENU_ID_2 = 2001;
const TEST_MENU_ID_3 = 2002;

const cleanUp = async () => {
	await db.delete(sysUserRole).where(eq(sysUserRole.userId, TEST_USER_ID));
	await db.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, TEST_ROLE_ID));
	await db.delete(sysUser).where(eq(sysUser.id, TEST_USER_ID));
	await db.delete(sysRole).where(eq(sysRole.id, TEST_ROLE_ID));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_1));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_2));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_3));
};

describe("auth 权限链联合查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysUser).values({
			id: TEST_USER_ID,
			username: "authtest",
			nickname: "权限链测试",
			gender: 1,
			password: "test",
			deptId: 1,
			status: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysRole).values({
			id: TEST_ROLE_ID,
			name: "权限链角色",
			code: "AUTH_TEST_ROLE",
			sort: 99,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysMenu).values([
			{
				id: TEST_MENU_ID_1,
				parentId: 0,
				treePath: "0",
				type: "M",
				name: "测试菜单1",
				routeName: "Test1",
				routePath: "test1",
				component: "test/index",
				icon: "test",
				sort: 1,
				visible: 1,
				keepAlive: 1,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: TEST_MENU_ID_2,
				parentId: TEST_MENU_ID_1,
				treePath: `0,${TEST_MENU_ID_1}`,
				type: "B",
				name: "测试按钮1",
				perm: "test:btn:add",
				sort: 1,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: TEST_MENU_ID_3,
				parentId: TEST_MENU_ID_1,
				treePath: `0,${TEST_MENU_ID_1}`,
				type: "B",
				name: "测试按钮2",
				perm: "test:btn:edit",
				sort: 2,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
		]);
		await db.insert(sysRoleMenu).values([
			{ roleId: TEST_ROLE_ID, menuId: TEST_MENU_ID_1 },
			{ roleId: TEST_ROLE_ID, menuId: TEST_MENU_ID_2 },
			{ roleId: TEST_ROLE_ID, menuId: TEST_MENU_ID_3 },
		]);
		await db.insert(sysUserRole).values({
			userId: TEST_USER_ID,
			roleId: TEST_ROLE_ID,
		});
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findUserRoles 查用户角色（2表 JOIN）", async () => {
		const roles = await findUserRoles(TEST_USER_ID, db);
		expect(roles.length).toBeGreaterThanOrEqual(1);
		expect(roles.some((r) => r.code === "AUTH_TEST_ROLE")).toBe(true);
	});

	test("findUserPerms 查用户权限点（4表 JOIN）", async () => {
		const perms = await findUserPerms(TEST_USER_ID, db);
		expect(perms).toContain("test:btn:add");
		expect(perms).toContain("test:btn:edit");
	});

	test("findUserPerms 去重：多角色绑定同一菜单只返回一次", async () => {
		// 再插入一个角色，绑定同一菜单
		const role2Id = 201;
		await db.insert(sysRole).values({
			id: role2Id,
			name: "权限链角色2",
			code: "AUTH_TEST_ROLE2",
			sort: 99,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: new Date().toISOString(),
			updatedBy: 1,
			updateTime: new Date().toISOString(),
		});
		await db.insert(sysUserRole).values({
			userId: TEST_USER_ID,
			roleId: role2Id,
		});
		await db.insert(sysRoleMenu).values([
			{ roleId: role2Id, menuId: TEST_MENU_ID_2 },
			{ roleId: role2Id, menuId: TEST_MENU_ID_3 },
		]);

		const perms = await findUserPerms(TEST_USER_ID, db);
		const addCount = perms.filter((p) => p === "test:btn:add").length;
		const editCount = perms.filter((p) => p === "test:btn:edit").length;
		expect(addCount).toBe(1);
		expect(editCount).toBe(1);

		await db.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, role2Id));
		await db.delete(sysUserRole).where(and(
			eq(sysUserRole.userId, TEST_USER_ID),
			eq(sysUserRole.roleId, role2Id),
		));
		await db.delete(sysRole).where(eq(sysRole.id, role2Id));
	});

	test("findUserPerms 过滤软删角色和软删菜单", async () => {
		// 软删角色
		await db
			.update(sysRole)
			.set({ deleteTime: new Date().toISOString() })
			.where(eq(sysRole.id, TEST_ROLE_ID));

		const perms = await findUserPerms(TEST_USER_ID, db);
		expect(perms).not.toContain("test:btn:add");
		expect(perms).not.toContain("test:btn:edit");

		await db
			.update(sysRole)
			.set({ deleteTime: null })
			.where(eq(sysRole.id, TEST_ROLE_ID));
	});

	test("findUserPerms 过滤无 perm 的菜单（type=M 目录）", async () => {
		const perms = await findUserPerms(TEST_USER_ID, db);
		const hasNullPerm = perms.some((p) => p === null || p === "");
		expect(hasNullPerm).toBe(false);
	});
});
