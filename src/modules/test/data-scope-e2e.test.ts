import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { app } from "@/app";
import { signAccessToken } from "@/lib/jwt";

const PREFIX = "/api/v1";

const makeToken = async (username: string): Promise<string> => {
	const payload: {
		sub: string;
		username: string;
		roles: string[];
		perms: string[];
		dataScopes: number[];
		tokenVersion: number;
		jti: string;
		tenantId: number;
		homeTenantId: number;
		canSwitchTenant: boolean;
	} = {
		sub: username === "admin" ? "2" : username === "dept_manager" ? "4" : "6",
		username,
		roles:
			username === "admin"
				? ["ADMIN"]
				: username === "dept_manager"
					? ["DEPT_MANAGER"]
					: ["EMPLOYEE"],
		// 对齐种子数据 sys_role_menu 绑定的按钮 perm（findUserPerms 链路）
		perms:
			username === "admin"
				? [
						"sys:user:list",
						"sys:user:create",
						"sys:user:update",
						"sys:user:delete",
						"sys:user:reset-password",
						"sys:user:import",
						"sys:user:export",
						"sys:role:list",
						"sys:role:create",
						"sys:role:update",
						"sys:role:delete",
						"sys:role:assign",
						"sys:menu:list",
						"sys:menu:create",
						"sys:menu:update",
						"sys:menu:delete",
						"sys:dept:list",
						"sys:dept:create",
						"sys:dept:update",
						"sys:dept:delete",
						"sys:file:upload",
						"sys:file:delete",
						"sys:dict:list",
						"sys:dict:create",
						"sys:dict:update",
						"sys:dict:delete",
					]
				: username === "dept_manager"
					? [
							"sys:user:list",
							"sys:user:create",
							"sys:user:update",
							"sys:user:delete",
							"sys:user:reset-password",
							"sys:user:import",
							"sys:user:export",
							"sys:role:list",
							"sys:role:create",
							"sys:role:update",
							"sys:role:delete",
							"sys:role:assign",
						]
					: ["sys:user:list"],
		dataScopes:
			username === "admin" ? [1] : username === "dept_manager" ? [2] : [4],
		tokenVersion: 0,
		jti: `test-e2e-${username}`,
		tenantId: 0,
		homeTenantId: 0,
		canSwitchTenant: username === "admin",
	};
	return signAccessToken(payload);
};

const get = async <T>(
	path: string,
	token: string,
): Promise<{ status: number; body: T }> => {
	const res = await fetch(
		`http://localhost:${app.server?.port}${PREFIX}${path}`,
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);
	return { status: res.status, body: (await res.json()) as T };
};

describe("dataScope 端到端集成验证", () => {
	beforeAll(async () => {
		app.listen(0);
	});

	afterAll(async () => {
		await app.stop();
	});

	test("admin (dataScope=ALL) 看到全部用户", async () => {
		const token = await makeToken("admin");
		const res = await get<{
			data: { list: Array<{ username: string; deptId: number }> };
		}>("/users", token);
		expect(res.status).toBe(200);
		const list = res.body.data?.list ?? [];
		expect(list.length).toBeGreaterThanOrEqual(7); // 种子数据 7 用户
	});

	test("dept_manager (dataScope=DEPT_AND_SUB) 仅看到本部门及子部门用户", async () => {
		const token = await makeToken("dept_manager");
		const res = await get<{
			data: { list: Array<{ username: string; deptId: number }> };
		}>("/users", token);
		expect(res.status).toBe(200);
		const list = res.body.data?.list ?? [];
		// dept_manager 属于有来技术(id=1, treePath="0,1")
		// DEPT_AND_SUB 匹配 tree_path LIKE '0,1%' → 研发(id=2) + 测试(id=3)
		// deptId=2: dept_manager(4)、employee(6)
		// deptId=3: test(3)、custom_user(7)
		expect(list.length).toBeGreaterThanOrEqual(4);
		for (const user of list) {
			expect([2, 3]).toContain(user.deptId); // 研发或测试部门
		}
	});

	test("employee (dataScope=SELF) 仅看到自己创建的用户", async () => {
		const token = await makeToken("employee");
		const res = await get<{ data: { list: Array<{ username: string }> } }>(
			"/users",
			token,
		);
		expect(res.status).toBe(200);
		const list = res.body.data?.list ?? [];
		// SELF = createdBy = 当前用户ID；种子数据中 employee(id=6) 由 admin(createdBy=1) 创建
		// 因此 employee 自己创建的用户数为 0
		expect(list.length).toBe(0);
	});

	test("admin /menus/my-tree 返回完整菜单树 + 全部权限", async () => {
		const token = await makeToken("admin");
		const res = await get<{ data: { menuTree: unknown[]; perms: string[] } }>(
			"/menus/my-tree",
			token,
		);
		expect(res.status).toBe(200);
		const { menuTree, perms } = res.body.data;
		// 菜单树应有多层
		expect(menuTree.length).toBeGreaterThanOrEqual(1);
		// ROOT 用户应拿到全部权限标识（种子数据 admin 绑了全部菜单按钮）
		expect(perms.length).toBeGreaterThanOrEqual(10);
	});

	test("dept_manager /menus/my-tree 返回裁剪后的菜单树 + 部分权限", async () => {
		const token = await makeToken("dept_manager");
		const res = await get<{ data: { menuTree: unknown[]; perms: string[] } }>(
			"/menus/my-tree",
			token,
		);
		expect(res.status).toBe(200);
		const { menuTree, perms } = res.body.data;
		// dept_manager 只绑了用户管理 + 角色管理
		expect(menuTree.length).toBeGreaterThanOrEqual(1);
		expect(perms.length).toBeGreaterThanOrEqual(4); // 用户管理4按钮 + 角色管理4按钮
		expect(perms.length).toBeLessThan(20); // 不应拿到全部权限
	});
});
