/**
 * 阶段 4 端到端三角色对比验证
 * 用法: bun run scripts/verify-stage4-e2e.ts
 * 前置: bun dev 已启动 (默认 http://localhost:8000)
 *
 * 验证 6 项：
 *   1. admin 登录调 /users 看到全部用户
 *   2. dept-manager 登录调 /users 仅看到本部门及子部门用户
 *   3. employee 登录调 /users 仅看到自己创建的用户
 *   4. dept-manager 调 /roles → 403 / 正常（取决于权限分配）
 *   5. admin 调 /menus/my-tree 看到全部菜单
 *   6. dept-manager 调 /menus/my-tree 看到裁剪后的菜单
 */

const PREFIX = "/api/v1";
const BASE = process.env.BASE ?? "http://localhost:8000";
const PASS = "123456";

const login = async (username: string): Promise<string> => {
	const res = await fetch(`${BASE}${PREFIX}/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password: PASS }),
	});
	const body = await res.json() as any;
	return body.data.accessToken as string;
};

const get = async (path: string, token: string) => {
	const res = await fetch(`${BASE}${PREFIX}${path}`, { headers: { Authorization: `Bearer ${token}` } });
	return { status: res.status, body: await res.json() as any };
};

const main = async () => {
	console.log("=== 阶段 4 端到端验证 ===");
	console.log(`BASE: ${BASE}\n`);

	// 1. 登录
	console.log("--- 1. admin 登录 ---");
	const adminToken = await login("admin");
	console.log(`  token: ${adminToken.slice(0, 24)}...\n`);

	console.log("--- 2. dept_manager 登录 ---");
	const managerToken = await login("dept_manager");
	console.log(`  token: ${managerToken.slice(0, 24)}...\n`);

	console.log("--- 3. employee 登录 (dataScope=SELF) ---");
	const staffToken = await login("employee");
	console.log(`  token: ${staffToken.slice(0, 24)}...\n`);

	// 4. admin → /users
	console.log("--- 4. admin → GET /users ---");
	const adminUsers = await get("/users", adminToken);
	const adminCount = adminUsers.body.data?.list?.length ?? 0;
	console.log(`  status: ${adminUsers.status}`);
	console.log(`  用户数: ${adminCount}`);

	// 5. dept_manager → /users
	console.log("\n--- 5. dept_manager → GET /users ---");
	const managerUsers = await get("/users", managerToken);
	const managerCount = managerUsers.body.data?.list?.length ?? 0;
	console.log(`  status: ${managerUsers.status}`);
	console.log(`  用户数: ${managerCount}`);

	// 6. employee → /users
	console.log("\n--- 6. employee → GET /users ---");
	const staffUsers = await get("/users", staffToken);
	const staffCount = staffUsers.body.data?.list?.length ?? 0;
	console.log(`  status: ${staffUsers.status}`);
	console.log(`  用户数: ${staffCount}`);

	// 7. dept_manager → /roles
	console.log("\n--- 7. dept_manager → GET /roles ---");
	const managerRoles = await get("/roles", managerToken);
	console.log(`  status: ${managerRoles.status}`);
	console.log(`  code: ${managerRoles.body.code}, msg: ${managerRoles.body.msg}`);

	// 8. admin → /menus/my-tree
	console.log("\n--- 8. admin → GET /menus/my-tree ---");
	const adminMenu = await get("/menus/my-tree", adminToken);
	const adminMenuCount = adminMenu.body.data?.menuTree?.length ?? 0;
	const adminPermsCount = adminMenu.body.data?.perms?.length ?? 0;
	console.log(`  status: ${adminMenu.status}`);
	console.log(`  菜单树根节点数: ${adminMenuCount}`);
	console.log(`  权限标识数: ${adminPermsCount}`);

	// 9. dept_manager → /menus/my-tree
	console.log("\n--- 9. dept_manager → GET /menus/my-tree ---");
	const managerMenu = await get("/menus/my-tree", managerToken);
	const managerMenuCount = managerMenu.body.data?.menuTree?.length ?? 0;
	const managerPermsCount = managerMenu.body.data?.perms?.length ?? 0;
	console.log(`  status: ${managerMenu.status}`);
	console.log(`  菜单树根节点数: ${managerMenuCount}`);
	console.log(`  权限标识数: ${managerPermsCount}`);

	// 汇总
	console.log("\n=== 汇总 ===");
	console.log(`admin    /users 用户数:       ${adminCount}`);
	console.log(`manager  /users 用户数:       ${managerCount}`);
	console.log(`staff    /users 用户数:       ${staffCount}`);
	console.log(`manager  /roles HTTP:          ${managerRoles.status}`);
	console.log(`admin    /menus 根节点/权限:   ${adminMenuCount} / ${adminPermsCount}`);
	console.log(`manager  /menus 根节点/权限:   ${managerMenuCount} / ${managerPermsCount}`);
};

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});