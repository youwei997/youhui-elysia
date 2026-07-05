import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sysDept } from "@/db/schema/system/dept";
import { sysUserRole } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import { hashPassword } from "@/lib/password";
import {
	findUserById,
	findUserProfileDetail,
	updateUserEmail,
	updateUserMobile,
	updateUserPassword,
	updateUserProfile,
} from "@/modules/user/queries";

// ==========================================
// 测试数据：用固定 ID 避免与种子冲突
// ==========================================
const TEST_DEPT_ID = 700;
const TEST_ROLE_ID = 700;
const TEST_USER_ID = 700;

const cleanUp = async () => {
	await db.delete(sysUserRole).where(eq(sysUserRole.userId, TEST_USER_ID));
	await db.delete(sysUser).where(eq(sysUser.id, TEST_USER_ID));
	await db.delete(sysRole).where(eq(sysRole.id, TEST_ROLE_ID));
	await db.delete(sysDept).where(eq(sysDept.id, TEST_DEPT_ID));
};

describe("user profile 个人中心", () => {
	beforeAll(async () => {
		await cleanUp();
		const now = new Date().toISOString();
		const passwordHash = await hashPassword("test123456");

		await db.insert(sysDept).values({
			id: TEST_DEPT_ID,
			name: "个人中心测试部门",
			code: "PROFILE_TEST",
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
			name: "个人中心测试角色",
			code: "PROFILE_TEST_ROLE",
			sort: 99,
			status: 1,
			dataScope: 3,
			createdBy: 1,
			createTime: now,
			updatedBy: 1,
			updateTime: now,
		});

		const [user] = await db
			.insert(sysUser)
			.values({
				id: TEST_USER_ID,
				username: `profile_test_${Date.now()}`,
				password: passwordHash,
				nickname: "测试用户",
				gender: 1,
				mobile: "13800138000",
				email: "test@example.com",
				deptId: TEST_DEPT_ID,
				status: 1,
				createdBy: 1,
				createTime: now,
				updatedBy: 1,
				updateTime: now,
			})
			.returning();

		if (!user) throw new Error("插入测试用户失败");

		await db.insert(sysUserRole).values({
			userId: user.id,
			roleId: TEST_ROLE_ID,
		});
	});

	afterAll(async () => {
		await cleanUp();
	});

	test("findUserProfileDetail 返回含 deptName 和 roleNames 的详情", async () => {
		const detail = await findUserProfileDetail(TEST_USER_ID, db);
		expect(detail).toBeDefined();
		expect(detail!.username).toBeDefined();
		expect(detail!.deptName).toBe("个人中心测试部门");
		expect(detail!.roleNames).toBe("个人中心测试角色");
		expect(detail!.mobile).toBe("13800138000");
		expect(detail!.email).toBe("test@example.com");
	});

	test("updateUserProfile 更新昵称/头像/性别", async () => {
		const updated = await updateUserProfile(
			TEST_USER_ID,
			{
				nickname: "新昵称",
				avatar: "https://example.com/avatar.png",
				gender: 2,
			},
			db,
		);
		expect(updated).toBeDefined();
		expect(updated!.nickname).toBe("新昵称");
		expect(updated!.avatar).toBe("https://example.com/avatar.png");
		expect(updated!.gender).toBe(2);

		// 恢复
		await updateUserProfile(
			TEST_USER_ID,
			{ nickname: "测试用户", gender: 1 },
			db,
		);
	});

	test("updateUserPassword 旧密码正确可修改", async () => {
		const updated = await updateUserPassword(
			TEST_USER_ID,
			"test123456",
			"newpass123",
			db,
		);
		expect(updated).toBeDefined();
		expect(updated!.password).not.toBe("test123456");

		// 恢复密码
		const newHash = await hashPassword("test123456");
		await db
			.update(sysUser)
			.set({ password: newHash })
			.where(eq(sysUser.id, TEST_USER_ID));
	});

	test("updateUserPassword 旧密码错误抛出异常", async () => {
		await expect(
			updateUserPassword(TEST_USER_ID, "wrongpass", "newpass123", db),
		).rejects.toThrow("PASSWORD_INCORRECT");
	});

	test("updateUserMobile 绑定手机号", async () => {
		const updated = await updateUserMobile(TEST_USER_ID, "13900139000", db);
		expect(updated!.mobile).toBe("13900139000");

		// 解绑
		await updateUserMobile(TEST_USER_ID, null, db);
		const user = await findUserById(TEST_USER_ID, db);
		expect(user!.mobile).toBeNull();
	});

	test("updateUserEmail 绑定邮箱", async () => {
		const updated = await updateUserEmail(TEST_USER_ID, "new@example.com", db);
		expect(updated!.email).toBe("new@example.com");

		// 解绑
		await updateUserEmail(TEST_USER_ID, null, db);
		const user = await findUserById(TEST_USER_ID, db);
		expect(user!.email).toBeNull();
	});
});
