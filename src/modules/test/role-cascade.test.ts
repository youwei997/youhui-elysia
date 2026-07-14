import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import {
	sysRoleDept,
	sysRoleMenu,
	sysUserRole,
} from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import {
	batchSoftDeleteRoles,
	createRole,
	findRoleById,
	findRoleDeptIds,
	findRoleFormData,
	findRoleMenuIds,
	isRoleAssignedToUsers,
	replaceRoleDepts,
	replaceRoleMenus,
	updateRole,
} from "@/modules/role/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_ROLE_ID = 300;
const TEST_DEPT_ID_1 = 100;
const TEST_DEPT_ID_2 = 101;
const TEST_MENU_ID_1 = 3000;
const TEST_MENU_ID_2 = 3001;
const TEST_USER_ID = 300;

const cleanUp = async () => {
	await db.delete(sysUserRole).where(eq(sysUserRole.roleId, TEST_ROLE_ID));
	await db.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, TEST_ROLE_ID));
	await db.delete(sysRoleDept).where(eq(sysRoleDept.roleId, TEST_ROLE_ID));
	await db.delete(sysRole).where(eq(sysRole.id, TEST_ROLE_ID));
	await db.delete(sysUser).where(eq(sysUser.id, TEST_USER_ID));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_1));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_2));
};

describe("role 与 dept/menu 事务级联", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysUser).values({
			id: TEST_USER_ID,
			username: "roletest",
			nickname: "角色级联测试",
			gender: 1,
			password: "test",
			deptId: 1,
			status: 1,
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
				name: "级联测试菜单1",
				routeName: "Cascade1",
				routePath: "cascade1",
				component: "cascade/index",
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
				name: "级联测试按钮",
				perm: "test:cascade:btn",
				sort: 1,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
		]);
		await db.insert(sysRole).values({
			id: TEST_ROLE_ID,
			name: "级联测试角色",
			code: "CASCADE_TEST",
			sort: 99,
			status: 1,
			dataScope: 5,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
		await db.insert(sysRoleDept).values([
			{ roleId: TEST_ROLE_ID, deptId: TEST_DEPT_ID_1, tenantId: 0 },
			{ roleId: TEST_ROLE_ID, deptId: TEST_DEPT_ID_2, tenantId: 0 },
		]);
		await db.insert(sysRoleMenu).values([
			{ roleId: TEST_ROLE_ID, menuId: TEST_MENU_ID_1, tenantId: 0 },
			{ roleId: TEST_ROLE_ID, menuId: TEST_MENU_ID_2, tenantId: 0 },
		]);
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("createRole 创建角色并写入 sysRoleDept（dataScope=5）", async () => {
		const body = {
			name: "级联测试角色2",
			code: "CASCADE_TEST2",
			sort: 99,
			status: 1 as 1,
			dataScope: 5 as 5,
			remark: null,
			deptIds: [TEST_DEPT_ID_1, TEST_DEPT_ID_2],
		};

		const role = await createRole(body, 0, db);
		expect(role.code).toBe("CASCADE_TEST2");

		const deptIds = await findRoleDeptIds(role.id, 0, db);
		expect(deptIds).toContain(TEST_DEPT_ID_1);
		expect(deptIds).toContain(TEST_DEPT_ID_2);

		// 清理
		await db.delete(sysRoleDept).where(eq(sysRoleDept.roleId, role.id));
		await db.delete(sysRole).where(eq(sysRole.id, role.id));
	});

	test("createRole dataScope!=5 时不写 sysRoleDept", async () => {
		const body = {
			name: "级联测试角色3",
			code: "CASCADE_TEST3",
			sort: 99,
			status: 1 as 1,
			dataScope: 1 as 1,
			remark: null,
		};

		const role = await createRole(body, 0, db);
		expect(role.code).toBe("CASCADE_TEST3");

		const deptIds = await findRoleDeptIds(role.id, 0, db);
		expect(deptIds.length).toBe(0);

		// 清理
		await db.delete(sysRole).where(eq(sysRole.id, role.id));
	});

	test("replaceRoleMenus 替换角色菜单绑定", async () => {
		await replaceRoleMenus(TEST_ROLE_ID, [TEST_MENU_ID_1], 0, db);

		const menuIds = await findRoleMenuIds(TEST_ROLE_ID, 0, db);
		expect(menuIds).toContain(TEST_MENU_ID_1);
		expect(menuIds).not.toContain(TEST_MENU_ID_2);

		// 再次替换
		await replaceRoleMenus(TEST_ROLE_ID, [TEST_MENU_ID_2], 0, db);
		const menuIds2 = await findRoleMenuIds(TEST_ROLE_ID, 0, db);
		expect(menuIds2).toContain(TEST_MENU_ID_2);
		expect(menuIds2).not.toContain(TEST_MENU_ID_1);
	});

	test("replaceRoleDepts 替换角色部门绑定", async () => {
		await replaceRoleDepts(TEST_ROLE_ID, { deptIds: [TEST_DEPT_ID_2] }, 0, db);

		const deptIds = await findRoleDeptIds(TEST_ROLE_ID, 0, db);
		expect(deptIds).toContain(TEST_DEPT_ID_2);
		expect(deptIds).not.toContain(TEST_DEPT_ID_1);
	});

	test("findRoleFormData 返回角色 + deptIds（dataScope=5）", async () => {
		// 确保 TEST_ROLE_ID 是 dataScope=5 且有 deptIds
		await db
			.update(sysRole)
			.set({ dataScope: 5 })
			.where(eq(sysRole.id, TEST_ROLE_ID));
		await replaceRoleDepts(
			TEST_ROLE_ID,
			{ deptIds: [TEST_DEPT_ID_1, TEST_DEPT_ID_2] },
			0,
			db,
		);

		const formData = await findRoleFormData(TEST_ROLE_ID, 0, db);
		expect(formData).toBeDefined();
		expect(formData?.code).toBe("CASCADE_TEST");
		expect(formData?.deptIds).toContain(TEST_DEPT_ID_1);
		expect(formData?.deptIds).toContain(TEST_DEPT_ID_2);
	});

	test("isRoleAssignedToUsers 判断角色是否被用户使用", async () => {
		// 先绑定用户
		await db.insert(sysUserRole).values({
			userId: TEST_USER_ID,
			roleId: TEST_ROLE_ID,
			tenantId: 0,
		});

		const assigned = await isRoleAssignedToUsers(TEST_ROLE_ID, 0, db);
		expect(assigned).toBe(true);

		// 解绑
		await db
			.delete(sysUserRole)
			.where(
				and(
					eq(sysUserRole.userId, TEST_USER_ID),
					eq(sysUserRole.roleId, TEST_ROLE_ID),
				),
			);
			const unassigned = await isRoleAssignedToUsers(TEST_ROLE_ID, 0, db);
		expect(unassigned).toBe(false);
	});

	test("updateRole 更新角色并维护 sysRoleDept", async () => {
		// 先设为 CUSTOM 并绑定部门
		await db
			.update(sysRole)
			.set({ dataScope: 5 })
			.where(eq(sysRole.id, TEST_ROLE_ID));
		await replaceRoleDepts(TEST_ROLE_ID, { deptIds: [TEST_DEPT_ID_1] }, 0, db);

		// 更新为非 CUSTOM
		const updated = await updateRole(
			TEST_ROLE_ID,
			{ name: "更新后角色", sort: 99, status: 1, dataScope: 1 },
			0,
			db,
		);
		expect(updated?.name).toBe("更新后角色");

		// 确认 sysRoleDept 被清理
		const deptIds = await findRoleDeptIds(TEST_ROLE_ID, 0, db);
		expect(deptIds.length).toBe(0);
	});

	test("batchSoftDeleteRoles 批量软删并清理关联", async () => {
		// 重新绑定一些关联数据
		await db.insert(sysUserRole).values({
			userId: TEST_USER_ID,
			roleId: TEST_ROLE_ID,
			tenantId: 0,
		});
		await db.insert(sysRoleMenu).values({
			roleId: TEST_ROLE_ID,
			menuId: TEST_MENU_ID_1,
			tenantId: 0,
		});
		await db.insert(sysRoleDept).values({
			roleId: TEST_ROLE_ID,
			deptId: TEST_DEPT_ID_1,
			tenantId: 0,
		});

		await batchSoftDeleteRoles([TEST_ROLE_ID], 0, db);

		const role = await findRoleById(TEST_ROLE_ID, 0, db);
		expect(role?.deleteTime).not.toBeNull();

		const userRoles = await db
			.select()
			.from(sysUserRole)
			.where(eq(sysUserRole.roleId, TEST_ROLE_ID));
		expect(userRoles.length).toBe(0);
	});

	test("findRoleById 软删后不返回", async () => {
		const role = await findRoleById(TEST_ROLE_ID, 0, db);
		expect(role).toBeUndefined();
	});
});
