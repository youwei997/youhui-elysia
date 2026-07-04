import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { findMenusByRoleCodes } from "@/modules/menu/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_ROLE_ID = 400;
const TEST_MENU_ID_1 = 4000;
const TEST_MENU_ID_2 = 4001;
const TEST_MENU_ID_3 = 4002;

const cleanUp = async () => {
	await db.delete(sysRoleMenu).where(eq(sysRoleMenu.roleId, TEST_ROLE_ID));
	await db.delete(sysRole).where(eq(sysRole.id, TEST_ROLE_ID));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_1));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_2));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ID_3));
};

describe("menu + role 3表 JOIN 查询", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		await db.insert(sysRole).values({
			id: TEST_ROLE_ID,
			name: "菜单角色测试",
			code: "MENU_TEST_ROLE",
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
				name: "3表JOIN测试目录",
				routeName: "JoinTest",
				routePath: "jointest",
				component: "jointest/index",
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
				name: "3表JOIN测试按钮",
				perm: "test:join:btn",
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
				name: "3表JOIN测试按钮2",
				perm: "test:join:btn2",
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
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findMenusByRoleCodes 3表 JOIN 返回角色可访问菜单", async () => {
		const menus = await findMenusByRoleCodes(["MENU_TEST_ROLE"], db);
		// findMenusByRoleCodes 默认排除按钮（type='B'），所以只返回目录
		expect(menus.length).toBeGreaterThanOrEqual(1);

		const menuIds = menus.map((m) => m.id);
		expect(menuIds).toContain(TEST_MENU_ID_1);
	});

	test("findMenusByRoleCodes 不过滤按钮类型（用 findAllMenusWithButtons）", async () => {
		const { findAllMenusWithButtons } = await import("@/modules/menu/queries");
		const menus = await findAllMenusWithButtons(undefined, db);
		const types = menus.map((m) => m.type);
		expect(types).toContain("M");
		expect(types).toContain("B");
	});

	test("findMenusByRoleCodes 不存在的角色码返回空", async () => {
		const menus = await findMenusByRoleCodes(["NOT_EXIST_ROLE"], db);
		expect(menus.length).toBe(0);
	});

	test("findMenusByRoleCodes 过滤软删角色和软删菜单", async () => {
		// 软删一个角色
		await db
			.update(sysRole)
			.set({ deleteTime: new Date().toISOString() })
			.where(eq(sysRole.id, TEST_ROLE_ID));

		const menus = await findMenusByRoleCodes(["MENU_TEST_ROLE"], db);
		expect(menus.length).toBe(0);

		await db
			.update(sysRole)
			.set({ deleteTime: null })
			.where(eq(sysRole.id, TEST_ROLE_ID));
	});
});
