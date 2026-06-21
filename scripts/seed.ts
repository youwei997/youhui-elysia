import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";
import { sysRole } from "@/db/schema/system/role";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import { sysUserRole, sysRoleMenu, sysRoleDept } from "@/db/schema/system/relation";

/**
 * bcrypt 哈希密码（明文：123456）
 * 后续阶段 3 接入 auth 模块后，可通过登录接口验证
 */
const DEFAULT_PASSWORD =
	"$2a$10$xVWsNOhHrCxh5UbpCE7/HuJ.PAOKcYAqRxD2CO2nVnJS.IAXkr5aq";

/** 当前时间戳（ISO 8601），用于审计字段填充 */
const NOW = new Date().toISOString();

async function main() {
	console.log("🌱 开始写入种子数据...");

	// ==========================================
	// 0. 清空所有表（按 FK 依赖顺序：先删关联表，再删主表）
	// ==========================================
	await db.delete(sysUserRole);
	await db.delete(sysRoleMenu);
	await db.delete(sysRoleDept);
	await db.delete(sysUser);
	await db.delete(sysRole);
	await db.delete(sysMenu);
	await db.delete(sysDept);
	console.log("  🧹 已清空所有表");

	// ==========================================
	// 1. 部门表（sys_dept）
	// ==========================================
	await db.insert(sysDept).values([
		{
			id: 1,
			name: "有来技术",
			code: "YOULAI",
			parentId: 0,
			treePath: "0",
			sort: 1,
			status: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 2,
			name: "研发部门",
			code: "RD001",
			parentId: 1,
			treePath: "0,1",
			sort: 1,
			status: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 3,
			name: "测试部门",
			code: "QA001",
			parentId: 1,
			treePath: "0,1",
			sort: 1,
			status: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
	]);
	console.log("  ✅ 部门表：3 条");

	// ==========================================
	// 2. 菜单表（sys_menu）—— 系统管理目录 + 4 个子模块 + 按钮权限
	// ==========================================
	await db.insert(sysMenu).values([
		// 顶级目录：系统管理
		{
			id: 1,
			parentId: 0,
			treePath: "0",
			type: "C",
			name: "系统管理",
			routeName: "",
			routePath: "/system",
			component: "Layout",
			icon: "system",
			sort: 1,
			visible: 1,
			redirect: "/system/user",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		// ── 用户管理 ──
		{
			id: 10,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "用户管理",
			routeName: "User",
			routePath: "user",
			component: "system/user/index",
			icon: "el-icon-User",
			sort: 1,
			visible: 1,
			keepAlive: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 101,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户查询",
			perm: "sys:user:list",
			sort: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 102,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户新增",
			perm: "sys:user:create",
			sort: 2,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 103,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户编辑",
			perm: "sys:user:update",
			sort: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 104,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户删除",
			perm: "sys:user:delete",
			sort: 4,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 105,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "重置密码",
			perm: "sys:user:reset-password",
			sort: 5,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 106,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户导入",
			perm: "sys:user:import",
			sort: 6,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 107,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户导出",
			perm: "sys:user:export",
			sort: 7,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		// ── 角色管理 ──
		{
			id: 20,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "角色管理",
			routeName: "Role",
			routePath: "role",
			component: "system/role/index",
			icon: "role",
			sort: 2,
			visible: 1,
			keepAlive: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 201,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色查询",
			perm: "sys:role:list",
			sort: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 202,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色新增",
			perm: "sys:role:create",
			sort: 2,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 203,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色编辑",
			perm: "sys:role:update",
			sort: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 204,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色删除",
			perm: "sys:role:delete",
			sort: 4,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 205,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "分配权限",
			perm: "sys:role:assign",
			sort: 5,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		// ── 菜单管理 ──
		{
			id: 30,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "菜单管理",
			routeName: "SysMenu",
			routePath: "menu",
			component: "system/menu/index",
			icon: "menu",
			sort: 3,
			visible: 1,
			keepAlive: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 301,
			parentId: 30,
			treePath: "0,1,30",
			type: "B",
			name: "菜单查询",
			perm: "sys:menu:list",
			sort: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 302,
			parentId: 30,
			treePath: "0,1,30",
			type: "B",
			name: "菜单新增",
			perm: "sys:menu:create",
			sort: 2,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 303,
			parentId: 30,
			treePath: "0,1,30",
			type: "B",
			name: "菜单编辑",
			perm: "sys:menu:update",
			sort: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 304,
			parentId: 30,
			treePath: "0,1,30",
			type: "B",
			name: "菜单删除",
			perm: "sys:menu:delete",
			sort: 4,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		// ── 部门管理 ──
		{
			id: 40,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "部门管理",
			routeName: "Dept",
			routePath: "dept",
			component: "system/dept/index",
			icon: "tree",
			sort: 4,
			visible: 1,
			keepAlive: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 401,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门查询",
			perm: "sys:dept:list",
			sort: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 402,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门新增",
			perm: "sys:dept:create",
			sort: 2,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 403,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门编辑",
			perm: "sys:dept:update",
			sort: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 404,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门删除",
			perm: "sys:dept:delete",
			sort: 4,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
	]);
	console.log("  ✅ 菜单表：25 条（1 目录 + 4 菜单 + 20 按钮）");

	// ==========================================
	// 3. 角色表（sys_role）—— dataScope：1=全部 2=部门及子部门 3=本部门 4=本人 5=自定义
	// ==========================================
	await db.insert(sysRole).values([
		{
			id: 1,
			name: "超级管理员",
			code: "ROOT",
			sort: 1,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 2,
			name: "系统管理员",
			code: "ADMIN",
			sort: 2,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 3,
			name: "访问游客",
			code: "GUEST",
			sort: 3,
			status: 1,
			dataScope: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 4,
			name: "部门主管",
			code: "DEPT_MANAGER",
			sort: 4,
			status: 1,
			dataScope: 2,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 5,
			name: "部门成员",
			code: "DEPT_MEMBER",
			sort: 5,
			status: 1,
			dataScope: 3,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 6,
			name: "普通员工",
			code: "EMPLOYEE",
			sort: 6,
			status: 1,
			dataScope: 4,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 7,
			name: "自定义权限用户",
			code: "CUSTOM_USER",
			sort: 7,
			status: 1,
			dataScope: 5,
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
	]);
	console.log("  ✅ 角色表：7 条");

	// ==========================================
	// 4. 用户表（sys_user）
	// ==========================================
	await db.insert(sysUser).values([
		{
			id: 1,
			username: "root",
			nickname: "有来技术",
			gender: 0,
			password: DEFAULT_PASSWORD,
			deptId: null,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345677",
			status: 1,
			email: "youlaitech@163.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 2,
			username: "admin",
			nickname: "系统管理员",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 1,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18888888888",
			status: 1,
			email: "youlaitech@163.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 3,
			username: "test",
			nickname: "测试小用户",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 3,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345679",
			status: 1,
			email: "youlaitech@163.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 4,
			username: "dept_manager",
			nickname: "部门主管",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 1,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345680",
			status: 1,
			email: "manager@youlaitech.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 5,
			username: "dept_member",
			nickname: "部门成员",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 1,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345681",
			status: 1,
			email: "member@youlaitech.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 6,
			username: "employee",
			nickname: "普通员工",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 2,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345682",
			status: 1,
			email: "employee@youlaitech.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
		{
			id: 7,
			username: "custom_user",
			nickname: "自定义权限用户",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 3,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345683",
			status: 1,
			email: "custom@youlaitech.com",
			createdBy: 1,
			createdAt: NOW,
			updatedBy: 1,
			updatedAt: NOW,
		},
	]);
	console.log("  ✅ 用户表：7 条");

	// ==========================================
	// 5. 用户-角色关联表（sys_user_role）
	// ==========================================
	await db.insert(sysUserRole).values([
		{ userId: 1, roleId: 1 }, // root → ROOT
		{ userId: 2, roleId: 2 }, // admin → ADMIN
		{ userId: 3, roleId: 3 }, // test → GUEST
		{ userId: 4, roleId: 4 }, // dept_manager → DEPT_MANAGER
		{ userId: 5, roleId: 5 }, // dept_member → DEPT_MEMBER
		{ userId: 6, roleId: 6 }, // employee → EMPLOYEE
		{ userId: 7, roleId: 7 }, // custom_user → CUSTOM_USER
	]);
	console.log("  ✅ 用户-角色关联：7 条");

	// ==========================================
	// 6. 角色-菜单关联表（sys_role_menu）
	// ==========================================
	// ROOT (id=1) 不在此表中插入 —— 超管在代码中通过 code === 'ROOT' 判断放行，无需显式分配
	// ADMIN (id=2) —— 拥有全部菜单
	const adminMenuIds = [
		1, // 系统管理目录
		10, 101, 102, 103, 104, 105, 106, 107, // 用户管理
		20, 201, 202, 203, 204, 205, // 角色管理
		30, 301, 302, 303, 304, // 菜单管理
		40, 401, 402, 403, 404, // 部门管理
	];
	await db.insert(sysRoleMenu).values(
		adminMenuIds.map((menuId) => ({ roleId: 2, menuId })),
	);

	// DEPT_MANAGER (id=4) —— 用户管理 + 角色管理
	const managerMenuIds = [
		1, // 系统管理目录
		10, 101, 102, 103, 104, 105, 106, 107, // 用户管理（全部）
		20, 201, 202, 203, 204, 205, // 角色管理（全部）
	];
	await db.insert(sysRoleMenu).values(
		managerMenuIds.map((menuId) => ({ roleId: 4, menuId })),
	);

	// DEPT_MEMBER (id=5) —— 用户管理（仅查询）
	await db.insert(sysRoleMenu).values([
		{ roleId: 5, menuId: 1 },
		{ roleId: 5, menuId: 10 },
		{ roleId: 5, menuId: 101 }, // 用户查询
	]);

	// EMPLOYEE (id=6) —— 用户管理（仅查询）
	await db.insert(sysRoleMenu).values([
		{ roleId: 6, menuId: 1 },
		{ roleId: 6, menuId: 10 },
		{ roleId: 6, menuId: 101 }, // 用户查询
	]);

	// GUEST (id=3) —— 用户管理（仅查询）
	await db.insert(sysRoleMenu).values([
		{ roleId: 3, menuId: 1 },
		{ roleId: 3, menuId: 10 },
		{ roleId: 3, menuId: 101 }, // 用户查询
	]);

	// CUSTOM_USER (id=7) —— 用户管理 + 角色管理
	await db.insert(sysRoleMenu).values(
		managerMenuIds.map((menuId) => ({ roleId: 7, menuId })),
	);

	console.log("  ✅ 角色-菜单关联：已写入");

	// ==========================================
	// 7. 角色-部门关联表（sys_role_dept）
	//    仅 CUSTOM_USER (id=7, dataScope=5) 使用
	// ==========================================
	await db.insert(sysRoleDept).values([
		{ roleId: 7, deptId: 1 },
		{ roleId: 7, deptId: 2 },
	]);
	console.log("  ✅ 角色-部门关联：2 条（CUSTOM_USER）");

	// ==========================================
	// 汇总
	// ==========================================
	console.log("");
	console.log("🎉 种子数据写入完成！");
	console.log("  ├─ 部门：3 条");
	console.log("  ├─ 菜单：25 条（1 目录 + 4 菜单 + 20 按钮）");
	console.log("  ├─ 角色：7 条");
	console.log("  ├─ 用户：7 条");
	console.log("  ├─ 用户-角色：7 条");
	console.log("  ├─ 角色-菜单：已写入");
	console.log("  └─ 角色-部门：2 条");
	console.log("");
	console.log("📋 角色清单（密码均为 123456）：");
	console.log("  root          → ROOT          超管，无部门，dataScope=ALL");
	console.log("  admin         → ADMIN         系统管理员，有来技术，dataScope=ALL");
	console.log("  test          → GUEST         访问游客，测试部门，dataScope=DEPT");
	console.log("  dept_manager  → DEPT_MANAGER  部门主管，有来技术，dataScope=DEPT_AND_SUB");
	console.log("  dept_member   → DEPT_MEMBER   部门成员，有来技术，dataScope=DEPT");
	console.log("  employee      → EMPLOYEE      普通员工，研发部门，dataScope=SELF");
	console.log("  custom_user   → CUSTOM_USER   自定义用户，测试部门，dataScope=CUSTOM");

	process.exit(0);
}

main().catch((err) => {
	console.error("❌ 种子数据写入失败:", err);
	process.exit(1);
});