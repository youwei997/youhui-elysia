import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysDept } from "@/db/schema/system/dept";
import { sysRoleDept } from "@/db/schema/system/relation";
import { sysUser } from "@/db/schema/system/user";
import {
	createDept,
	findAllDepts,
	findDeptById,
	isParentIdCyclic,
	softDeleteDept,
	updateDept,
} from "@/modules/dept/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_DEPT_ROOT = 500;
const TEST_DEPT_CHILD = 501;
const TEST_DEPT_GRANDCHILD = 502;
const TEST_USER_ID = 500;

const cleanUpDept = async () => {
	await db.delete(sysUser).where(eq(sysUser.id, TEST_USER_ID));
	await db.delete(sysRoleDept).where(eq(sysRoleDept.deptId, TEST_DEPT_ROOT));
	await db.delete(sysRoleDept).where(eq(sysRoleDept.deptId, TEST_DEPT_CHILD));
	await db
		.delete(sysRoleDept)
		.where(eq(sysRoleDept.deptId, TEST_DEPT_GRANDCHILD));
	await db.delete(sysDept).where(eq(sysDept.id, TEST_DEPT_GRANDCHILD));
	await db.delete(sysDept).where(eq(sysDept.id, TEST_DEPT_CHILD));
	await db.delete(sysDept).where(eq(sysDept.id, TEST_DEPT_ROOT));
};

describe("dept treePath 级联查询", () => {
	beforeAll(async () => {
		await cleanUpDept();
		const now = new Date().toISOString();
		await db.insert(sysDept).values([
			{
				id: TEST_DEPT_ROOT,
				name: "tree根部门",
				code: "TREE_ROOT",
				parentId: 0,
				treePath: "0",
				sort: 1,
				status: 1,
				tenantId: 0,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: TEST_DEPT_CHILD,
				name: "tree子部门",
				code: "TREE_CHILD",
				parentId: TEST_DEPT_ROOT,
				treePath: `0,${TEST_DEPT_ROOT}`,
				sort: 1,
				status: 1,
				tenantId: 0,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
			{
				id: TEST_DEPT_GRANDCHILD,
				name: "tree孙部门",
				code: "TREE_GRAND",
				parentId: TEST_DEPT_CHILD,
				treePath: `0,${TEST_DEPT_ROOT},${TEST_DEPT_CHILD}`,
				sort: 1,
				status: 1,
				tenantId: 0,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			},
		]);
		await db.insert(sysUser).values({
			id: TEST_USER_ID,
			username: "treetest",
			nickname: "树形测试",
			gender: 1,
			password: "test",
			deptId: TEST_DEPT_ROOT,
			status: 1,
			tenantId: 0,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});
	});

	afterAll(async () => {
		await cleanUpDept();
	});

	test("createDept 自动计算 treePath", async () => {
		const dept = await createDept(
			{
				name: "新建树部门",
				code: `TREE_NEW_${Date.now()}`,
				parentId: TEST_DEPT_ROOT,
				sort: 1,
				status: 1,
			},
			0,
			db,
		);
		expect(dept.treePath).toBe(`0,${TEST_DEPT_ROOT}`);

		await db.delete(sysDept).where(eq(sysDept.id, dept.id));
	});

	test("findDeptById 正常查询", async () => {
		const dept = await findDeptById(TEST_DEPT_ROOT, 0, db);
		expect(dept?.name).toBe("tree根部门");
		expect(dept?.treePath).toBe("0");
	});

	test("isParentIdCyclic 检测循环引用", async () => {
		// 正常：子部门 parentId 指向根部门，不是循环
		const notCyclic = await isParentIdCyclic(
			TEST_DEPT_CHILD,
			TEST_DEPT_ROOT,
			0,
			db,
		);
		expect(notCyclic).toBe(false);

		// 循环：孙部门 parentId 指向自己
		const cyclic = await isParentIdCyclic(
			TEST_DEPT_GRANDCHILD,
			TEST_DEPT_GRANDCHILD,
			0,
			db,
		);
		expect(cyclic).toBe(true);
	});

	test("updateDept 移动节点级联更新子树 treePath", async () => {
		// 插入一个独立的目标父部门，避免 REPLACE 误伤
		const targetParentId = 600;
		await db.insert(sysDept).values({
			id: targetParentId,
			name: "目标父部门",
			code: "TARGET_PARENT",
			parentId: 0,
			treePath: "0",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: new Date().toISOString(),
			updatedBy: 1,
			updateTime: new Date().toISOString(),
		});

		// 将子部门从根部门移到目标父部门下
		await updateDept(
			TEST_DEPT_CHILD,
			{ name: "tree子部门", parentId: targetParentId },
			0,
			db,
		);

		const movedChild = await findDeptById(TEST_DEPT_CHILD, 0, db);
		expect(movedChild?.treePath).toBe(`0,${targetParentId}`);

		const movedGrand = await findDeptById(TEST_DEPT_GRANDCHILD, 0, db);
		expect(movedGrand?.treePath).toBe(`0,${targetParentId},${TEST_DEPT_CHILD}`);

		// 移回原位
		await updateDept(
			TEST_DEPT_CHILD,
			{ name: "tree子部门", parentId: TEST_DEPT_ROOT },
			0,
			db,
		);

		await db.delete(sysDept).where(eq(sysDept.id, targetParentId));
	});

	test("softDeleteDept 级联软删子树", async () => {
		// 软删根部门
		await softDeleteDept(TEST_DEPT_ROOT, 0, db);

		const deletedRoot = await findDeptById(TEST_DEPT_ROOT, 0, db);
		expect(deletedRoot?.deleteTime).not.toBeNull();

		const deletedChild = await findDeptById(TEST_DEPT_CHILD, 0, db);
		expect(deletedChild?.deleteTime).not.toBeNull();

		const deletedGrand = await findDeptById(TEST_DEPT_GRANDCHILD, 0, db);
		expect(deletedGrand?.deleteTime).not.toBeNull();

		// 恢复
		await db
			.update(sysDept)
			.set({ deleteTime: null })
			.where(eq(sysDept.id, TEST_DEPT_ROOT));
		await db
			.update(sysDept)
			.set({ deleteTime: null })
			.where(eq(sysDept.id, TEST_DEPT_CHILD));
		await db
			.update(sysDept)
			.set({ deleteTime: null })
			.where(eq(sysDept.id, TEST_DEPT_GRANDCHILD));
	});

	test("findAllDepts 返回所有未软删部门", async () => {
		const depts = await findAllDepts({}, 0, db);
		const ids = depts.map((d) => d.id);
		expect(ids).toContain(TEST_DEPT_ROOT);
		expect(ids).toContain(TEST_DEPT_CHILD);
		expect(ids).toContain(TEST_DEPT_GRANDCHILD);
	});

	test("isDeptUsedByUsers 判断部门是否被用户引用", async () => {
		const used = await import("@/modules/dept/queries").then((m) =>
			m.isDeptUsedByUsers(TEST_DEPT_ROOT, 0, db),
		);
		expect(used).toBe(true);
	});
});
