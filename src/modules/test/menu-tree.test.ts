import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysMenu } from "@/db/schema/system/menu";
import { sysRoleMenu } from "@/db/schema/system/relation";
import {
	createMenu,
	findAllMenus,
	findMenuById,
	isParentIdCyclic,
	softDeleteMenu,
	updateMenu,
} from "@/modules/menu/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_MENU_ROOT = 5000;
const TEST_MENU_CHILD = 5001;
const TEST_MENU_GRANDCHILD = 5002;

const cleanUpMenu = async () => {
	await db.delete(sysRoleMenu).where(eq(sysRoleMenu.menuId, TEST_MENU_ROOT));
	await db.delete(sysRoleMenu).where(eq(sysRoleMenu.menuId, TEST_MENU_CHILD));
	await db
		.delete(sysRoleMenu)
		.where(eq(sysRoleMenu.menuId, TEST_MENU_GRANDCHILD));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_GRANDCHILD));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_CHILD));
	await db.delete(sysMenu).where(eq(sysMenu.id, TEST_MENU_ROOT));
};

const defined = <T>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Expected defined value");
	return value;
};

describe("menu treePath 级联查询", () => {
	beforeAll(async () => {
		await cleanUpMenu();
		const now = new Date().toISOString();
		await db.insert(sysMenu).values([
			{
				id: TEST_MENU_ROOT,
				parentId: 0,
				treePath: "0",
				type: "M",
				name: "菜单树根",
				routeName: "MenuRoot",
				routePath: "menuroot",
				component: "menuroot/index",
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
				id: TEST_MENU_CHILD,
				parentId: TEST_MENU_ROOT,
				treePath: `0,${TEST_MENU_ROOT}`,
				type: "M",
				name: "菜单树子",
				routeName: "MenuChild",
				routePath: "menuchild",
				component: "menuchild/index",
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
				id: TEST_MENU_GRANDCHILD,
				parentId: TEST_MENU_CHILD,
				treePath: `0,${TEST_MENU_ROOT},${TEST_MENU_CHILD}`,
				type: "B",
				name: "菜单树孙按钮",
				perm: "test:menu:btn",
				sort: 1,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
		]);
	});

	afterAll(async () => {
		await cleanUpMenu();
	});

	test("createMenu 自动计算 treePath", async () => {
		const menu = await createMenu(
			{
				name: "新建菜单",
				routeName: "NewMenu",
				routePath: "newmenu",
				component: "newmenu/index",
				parentId: TEST_MENU_ROOT,
				sort: 1,
				visible: 1,
				type: "M",
				perm: "",
				alwaysShow: 0,
				keepAlive: 0,
				icon: "",
				redirect: "",
				scope: 1,
			},
			db,
		);
		expect((menu as { treePath: string }).treePath).toBe(`0,${TEST_MENU_ROOT}`);

		await db.delete(sysMenu).where(eq(sysMenu.id, (menu as { id: number }).id));
	});

	test("findMenuById 正常查询", async () => {
		const menu = await findMenuById(TEST_MENU_ROOT, db);
		expect(menu).toBeDefined();
		expect(defined(menu).name).toBe("菜单树根");
		expect(defined(menu).treePath).toBe("0");
	});

	test("isParentIdCyclic 检测循环引用", async () => {
		// 正常：子菜单 parentId 指向根菜单，不是循环
		const notCyclic = await isParentIdCyclic(
			TEST_MENU_CHILD,
			TEST_MENU_ROOT,
			db,
		);
		expect(notCyclic).toBe(false);

		// 循环：孙菜单 parentId 指向自己
		const cyclic = await isParentIdCyclic(
			TEST_MENU_GRANDCHILD,
			TEST_MENU_GRANDCHILD,
			db,
		);
		expect(cyclic).toBe(true);
	});

	test("updateMenu 移动节点级联更新子树 treePath", async () => {
		// 插入一个独立的目标父菜单，避免 REPLACE 误伤
		const targetParentId = 6000;
		await db.insert(sysMenu).values({
			id: targetParentId,
			parentId: 0,
			treePath: "0",
			type: "M",
			name: "目标父菜单",
			routeName: "TargetParent",
			routePath: "targetparent",
			component: "targetparent/index",
			icon: "test",
			sort: 1,
			visible: 1,
			keepAlive: 1,
			createdBy: 1,
			createTime: new Date().toISOString(),
			updatedBy: 1,
			updateTime: new Date().toISOString(),
		});

		await updateMenu(
			TEST_MENU_CHILD,
			{ name: "菜单树子", parentId: targetParentId },
			db,
		);

		const movedChild = await findMenuById(TEST_MENU_CHILD, db);
		expect(movedChild?.treePath).toBe(`0,${targetParentId}`);

		const movedGrand = await findMenuById(TEST_MENU_GRANDCHILD, db);
		expect(movedGrand?.treePath).toBe(`0,${targetParentId},${TEST_MENU_CHILD}`);

		// 移回原位
		await updateMenu(
			TEST_MENU_CHILD,
			{ name: "菜单树子", parentId: TEST_MENU_ROOT },
			db,
		);

		await db.delete(sysMenu).where(eq(sysMenu.id, targetParentId));
	});

	test("softDeleteMenu 级联软删子树", async () => {
		// 软删根菜单
		await softDeleteMenu(TEST_MENU_ROOT, 0, db);

		const deletedRoot = await findMenuById(TEST_MENU_ROOT, db);
		expect(deletedRoot?.deleteTime).not.toBeNull();

		const deletedChild = await findMenuById(TEST_MENU_CHILD, db);
		expect(deletedChild?.deleteTime).not.toBeNull();

		const deletedGrand = await findMenuById(TEST_MENU_GRANDCHILD, db);
		expect(deletedGrand?.deleteTime).not.toBeNull();

		// 恢复
		await db
			.update(sysMenu)
			.set({ deleteTime: null })
			.where(eq(sysMenu.id, TEST_MENU_ROOT));
		await db
			.update(sysMenu)
			.set({ deleteTime: null })
			.where(eq(sysMenu.id, TEST_MENU_CHILD));
		await db
			.update(sysMenu)
			.set({ deleteTime: null })
			.where(eq(sysMenu.id, TEST_MENU_GRANDCHILD));
	});

	test("findAllMenus 返回所有未软删菜单（排除按钮）", async () => {
		const menus = await findAllMenus(db);
		const ids = menus.map((m) => m.id);
		expect(ids).toContain(TEST_MENU_ROOT);
		expect(ids).toContain(TEST_MENU_CHILD);
		// TEST_MENU_GRANDCHILD 是 type='B'（按钮），findAllMenus 默认排除
		expect(ids).not.toContain(TEST_MENU_GRANDCHILD);
	});
});
