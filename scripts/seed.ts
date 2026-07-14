import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";
import { sysRole } from "@/db/schema/system/role";
import { sysDept } from "@/db/schema/system/dept";
import { sysMenu } from "@/db/schema/system/menu";
import { sysDict } from "@/db/schema/system/dict";
import { sysDictItem } from "@/db/schema/system/dict-item";
import { sysUserRole, sysRoleMenu, sysRoleDept } from "@/db/schema/system/relation";
import { sysTenant } from "@/db/schema/system/tenant";
import { sysTenantPlan } from "@/db/schema/system/tenant-plan";
import { sysTenantPlanMenu } from "@/db/schema/system/tenant-plan-menu";
import { sysTenantMenu } from "@/db/schema/system/tenant-menu";

/**
 * 种子数据初始化脚本
 *
 * bcrypt 哈希密码（明文：123456）
 * 后续阶段 3 接入 auth 模块后，可通过登录接口验证
 *
 * ponytail: 本文件使用 db.execute() 原生 SQL 完成两类操作：
 * 1. 部分唯一索引（partial unique index）：Drizzle schema 不支持 WHERE ... IS NULL 语法，
 *    故 CREATE UNIQUE INDEX 用原生 SQL 创建。升级路径：Drizzle 支持后迁移到 schema 声明。
 * 2. 序列重置（setval）：Drizzle insert 不提供序列管理 API，用原生 SQL 保持自增 ID 连续。
 * 以上均为 seed 脚本特有，不影响业务运行时代码。
 */
const DEFAULT_PASSWORD =
	"$2a$10$xVWsNOhHrCxh5UbpCE7/HuJ.PAOKcYAqRxD2CO2nVnJS.IAXkr5aq";

/** 当前时间戳（ISO 8601），用于审计字段填充 */
const NOW = new Date().toISOString();

/** 平台租户 ID（固定值 0） */
const PLATFORM_TENANT_ID = 0;
/** 演示租户 ID */
const DEMO_TENANT_ID = 1;

const main = async () => {
	console.log("🌱 开始写入种子数据（含多租户）...");

	// ==========================================
	// 0. 清空所有表（按 FK 依赖顺序）
	// ==========================================
	await db.delete(sysUserRole);
	await db.delete(sysRoleMenu);
	await db.delete(sysRoleDept);
	await db.delete(sysTenantMenu);
	await db.delete(sysTenantPlanMenu);
	await db.delete(sysUser);
	await db.delete(sysRole);
	await db.delete(sysTenant);
	await db.delete(sysTenantPlan);
	await db.delete(sysMenu);
	await db.delete(sysDictItem);
	await db.delete(sysDict);
	await db.delete(sysDept);
	console.log("  🧹 已清空所有表");

	// ==========================================
	// 1. 租户表（sys_tenant）
	// ==========================================
	await db.insert(sysTenant).values([
		{
			id: PLATFORM_TENANT_ID,
			name: "平台租户",
			code: "PLATFORM",
			contactName: "平台管理员",
			contactPhone: "18888888888",
			contactEmail: "platform@youlai.tech",
			status: 1,
			remark: "SaaS 平台运营方，系统运行基础租户",
			createTime: NOW,
			updateTime: NOW,
		},
		{
			id: DEMO_TENANT_ID,
			name: "演示租户",
			code: "DEMO",
			contactName: "演示管理员",
			contactPhone: "18812345678",
			contactEmail: "demo@youlai.tech",
			planId: 1,
			status: 1,
			remark: "演示用租户，仅含业务菜单",
			createTime: NOW,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 租户表：2 条（平台 + 演示）");

	// ==========================================
	// 2. 租户套餐表（sys_tenant_plan）
	// ==========================================
	await db.insert(sysTenantPlan).values([
		{
			id: 1,
			name: "基础套餐",
			code: "BASIC",
			status: 1,
			sort: 1,
			remark: "包含全部业务菜单",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 租户套餐表：1 条（基础套餐）");

	// ==========================================
	// 3. 部门表（sys_dept）—— 平台租户 + 演示租户
	// ==========================================
	await db.insert(sysDept).values([
		// 平台租户（tenant_id=0）
		{
			id: 1,
			tenantId: PLATFORM_TENANT_ID,
			name: "有来技术",
			code: "YOULAI",
			parentId: 0,
			treePath: "0",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2,
			tenantId: PLATFORM_TENANT_ID,
			name: "研发部门",
			code: "RD001",
			parentId: 1,
			treePath: "0,1",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 3,
			tenantId: PLATFORM_TENANT_ID,
			name: "测试部门",
			code: "QA001",
			parentId: 1,
			treePath: "0,1",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 演示租户（tenant_id=1）
		{
			id: 4,
			tenantId: DEMO_TENANT_ID,
			name: "演示公司",
			code: "DEMO_COMPANY",
			parentId: 0,
			treePath: "0",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 5,
			tenantId: DEMO_TENANT_ID,
			name: "演示技术部",
			code: "DEMO_TECH",
			parentId: 4,
			treePath: "0,4",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 6,
			tenantId: DEMO_TENANT_ID,
			name: "演示运营部",
			code: "DEMO_OPER",
			parentId: 4,
			treePath: "0,4",
			sort: 1,
			status: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 部门表：6 条（平台 3 + 演示 3）");

	// ==========================================
	// 4. 菜单表（sys_menu）—— 含租户管理/套餐管理 + scope 分类
	// ==========================================
	// scope: 1=平台管理类（仅平台租户可见） 2=业务类（所有租户可见，受套餐限制）
	await db.insert(sysMenu).values([
		// ── 顶级目录 ──
		// 平台管理（平台级目录，scope=1）
		{
			id: 100,
			parentId: 0,
			treePath: "0",
			type: "C",
			name: "平台管理",
			routeName: "Platform",
			routePath: "/platform",
			component: "Layout",
			icon: "el-icon-Platform",
			sort: 0,
			visible: 1,
			redirect: "/platform/tenant",
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 系统管理（业务容器，scope=2，所有租户可见）
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
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 租户管理（平台级，scope=1） ──
		{
			id: 110,
			parentId: 100,
			treePath: "0,100",
			type: "M",
			name: "租户管理",
			routeName: "Tenant",
			routePath: "tenant",
			component: "system/tenant/index",
			icon: "el-icon-OfficeBuilding",
			sort: 1,
			visible: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1101,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户查询",
			perm: "sys:tenant:list",
			sort: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1102,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户新增",
			perm: "sys:tenant:create",
			sort: 2,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1103,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户编辑",
			perm: "sys:tenant:update",
			sort: 3,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1104,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户删除",
			perm: "sys:tenant:delete",
			sort: 4,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1105,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户启用/禁用",
			perm: "sys:tenant:change-status",
			sort: 5,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1106,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "租户切换",
			perm: "sys:tenant:switch",
			sort: 6,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1107,
			parentId: 110,
			treePath: "0,100,110",
			type: "B",
			name: "设置套餐",
			perm: "sys:tenant:plan-assign",
			sort: 7,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 租户套餐（平台级，scope=1） ──
		{
			id: 120,
			parentId: 100,
			treePath: "0,100",
			type: "M",
			name: "租户套餐",
			routeName: "TenantPlan",
			routePath: "tenant-plan",
			component: "system/tenant/plan",
			icon: "el-icon-CollectionTag",
			sort: 2,
			visible: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1201,
			parentId: 120,
			treePath: "0,100,120",
			type: "B",
			name: "套餐查询",
			perm: "sys:tenant-plan:list",
			sort: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1202,
			parentId: 120,
			treePath: "0,100,120",
			type: "B",
			name: "套餐新增",
			perm: "sys:tenant-plan:create",
			sort: 2,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1203,
			parentId: 120,
			treePath: "0,100,120",
			type: "B",
			name: "套餐编辑",
			perm: "sys:tenant-plan:update",
			sort: 3,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1204,
			parentId: 120,
			treePath: "0,100,120",
			type: "B",
			name: "套餐删除",
			perm: "sys:tenant-plan:delete",
			sort: 4,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 1205,
			parentId: 120,
			treePath: "0,100,120",
			type: "B",
			name: "套餐菜单配置",
			perm: "sys:tenant-plan:assign",
			sort: 5,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 用户管理（业务，scope=2） ──
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
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 101,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户查询",
			perm: "sys:user:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 102,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户新增",
			perm: "sys:user:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 103,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户编辑",
			perm: "sys:user:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 104,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户删除",
			perm: "sys:user:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 105,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "重置密码",
			perm: "sys:user:reset-password",
			sort: 5,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 106,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户导入",
			perm: "sys:user:import",
			sort: 6,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 107,
			parentId: 10,
			treePath: "0,1,10",
			type: "B",
			name: "用户导出",
			perm: "sys:user:export",
			sort: 7,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 角色管理（业务，scope=2） ──
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
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 201,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色查询",
			perm: "sys:role:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 202,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色新增",
			perm: "sys:role:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 203,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色编辑",
			perm: "sys:role:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 204,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "角色删除",
			perm: "sys:role:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 205,
			parentId: 20,
			treePath: "0,1,20",
			type: "B",
			name: "分配权限",
			perm: "sys:role:assign",
			sort: 5,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 菜单管理（平台级，scope=1） ──
		{
			id: 30,
			parentId: 100,
			treePath: "0,100",
			type: "M",
			name: "菜单管理",
			routeName: "SysMenu",
			routePath: "menu",
			component: "system/menu/index",
			icon: "menu",
			sort: 3,
			visible: 1,
			keepAlive: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 301,
			parentId: 30,
			treePath: "0,100,30",
			type: "B",
			name: "菜单查询",
			perm: "sys:menu:list",
			sort: 1,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 302,
			parentId: 30,
			treePath: "0,100,30",
			type: "B",
			name: "菜单新增",
			perm: "sys:menu:create",
			sort: 2,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 303,
			parentId: 30,
			treePath: "0,100,30",
			type: "B",
			name: "菜单编辑",
			perm: "sys:menu:update",
			sort: 3,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 304,
			parentId: 30,
			treePath: "0,100,30",
			type: "B",
			name: "菜单删除",
			perm: "sys:menu:delete",
			sort: 4,
			scope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 部门管理（业务，scope=2） ──
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
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 401,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门查询",
			perm: "sys:dept:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 402,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门新增",
			perm: "sys:dept:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 403,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门编辑",
			perm: "sys:dept:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 404,
			parentId: 40,
			treePath: "0,1,40",
			type: "B",
			name: "部门删除",
			perm: "sys:dept:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 文件存储按钮（业务，scope=2） ──
		{
			id: 50,
			parentId: 1,
			treePath: "0,1",
			type: "B",
			name: "文件上传",
			perm: "sys:file:upload",
			sort: 50,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 51,
			parentId: 1,
			treePath: "0,1",
			type: "B",
			name: "文件删除",
			perm: "sys:file:delete",
			sort: 51,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 字典管理（业务，scope=2） ──
		{
			id: 250,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "字典管理",
			routeName: "Dict",
			routePath: "dict",
			component: "system/dict/index",
			icon: "dict",
			sort: 5,
			visible: 1,
			keepAlive: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2501,
			parentId: 250,
			treePath: "0,1,250",
			type: "B",
			name: "字典查询",
			perm: "sys:dict:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2502,
			parentId: 250,
			treePath: "0,1,250",
			type: "B",
			name: "字典新增",
			perm: "sys:dict:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2503,
			parentId: 250,
			treePath: "0,1,250",
			type: "B",
			name: "字典编辑",
			perm: "sys:dict:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2504,
			parentId: 250,
			treePath: "0,1,250",
			type: "B",
			name: "字典删除",
			perm: "sys:dict:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 字典项（业务，scope=2，visible=0 隐藏菜单） ──
		{
			id: 251,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "字典项",
			routeName: "DictItem",
			routePath: "dict-item",
			component: "system/dict/dict-item",
			icon: "dict-item",
			sort: 99,
			visible: 0,
			keepAlive: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2511,
			parentId: 251,
			treePath: "0,1,251",
			type: "B",
			name: "字典项查询",
			perm: "sys:dict:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2512,
			parentId: 251,
			treePath: "0,1,251",
			type: "B",
			name: "字典项新增",
			perm: "sys:dict:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2513,
			parentId: 251,
			treePath: "0,1,251",
			type: "B",
			name: "字典项编辑",
			perm: "sys:dict:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2514,
			parentId: 251,
			treePath: "0,1,251",
			type: "B",
			name: "字典项删除",
			perm: "sys:dict:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 系统配置（业务，scope=2） ──
		{
			id: 260,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "系统配置",
			routeName: "Config",
			routePath: "config",
			component: "system/config/index",
			icon: "setting",
			sort: 6,
			visible: 1,
			keepAlive: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2601,
			parentId: 260,
			treePath: "0,1,260",
			type: "B",
			name: "配置查询",
			perm: "sys:config:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2602,
			parentId: 260,
			treePath: "0,1,260",
			type: "B",
			name: "配置新增",
			perm: "sys:config:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2603,
			parentId: 260,
			treePath: "0,1,260",
			type: "B",
			name: "配置编辑",
			perm: "sys:config:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2604,
			parentId: 260,
			treePath: "0,1,260",
			type: "B",
			name: "配置删除",
			perm: "sys:config:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// ── 通知公告（业务，scope=2） ──
		{
			id: 270,
			parentId: 1,
			treePath: "0,1",
			type: "M",
			name: "通知公告",
			routeName: "Notice",
			routePath: "notice",
			component: "system/notice/index",
			icon: "message",
			sort: 7,
			visible: 1,
			keepAlive: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2701,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知查询",
			perm: "sys:notice:list",
			sort: 1,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2702,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知新增",
			perm: "sys:notice:create",
			sort: 2,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2703,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知编辑",
			perm: "sys:notice:update",
			sort: 3,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2704,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知删除",
			perm: "sys:notice:delete",
			sort: 4,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2705,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知发布",
			perm: "sys:notice:publish",
			sort: 5,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2706,
			parentId: 270,
			treePath: "0,1,270",
			type: "B",
			name: "通知撤回",
			perm: "sys:notice:revoke",
			sort: 6,
			scope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 菜单表：55 条（含平台管理 + 租户管理/套餐管理 + scope 赋值）");

	// ==========================================
	// 5. 角色表（sys_role）—— 含平台运营角色
	// ==========================================
	await db.insert(sysRole).values([
		{
			id: 1,
			tenantId: PLATFORM_TENANT_ID,
			name: "超级管理员",
			code: "ROOT",
			sort: 1,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2,
			tenantId: PLATFORM_TENANT_ID,
			name: "系统管理员",
			code: "ADMIN",
			sort: 2,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 3,
			tenantId: PLATFORM_TENANT_ID,
			name: "访问游客",
			code: "GUEST",
			sort: 3,
			status: 1,
			dataScope: 3,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 4,
			tenantId: PLATFORM_TENANT_ID,
			name: "部门主管",
			code: "DEPT_MANAGER",
			sort: 4,
			status: 1,
			dataScope: 2,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 5,
			tenantId: PLATFORM_TENANT_ID,
			name: "部门成员",
			code: "DEPT_MEMBER",
			sort: 5,
			status: 1,
			dataScope: 3,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 6,
			tenantId: PLATFORM_TENANT_ID,
			name: "普通员工",
			code: "EMPLOYEE",
			sort: 6,
			status: 1,
			dataScope: 4,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 7,
			tenantId: PLATFORM_TENANT_ID,
			name: "自定义权限用户",
			code: "CUSTOM_USER",
			sort: 7,
			status: 1,
			dataScope: 5,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 平台运营角色（非 ROOT，用于跨租户权限测试）
		{
			id: 8,
			tenantId: PLATFORM_TENANT_ID,
			name: "平台运营",
			code: "PLATFORM_OPERATOR",
			sort: 8,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 演示租户管理员角色
		{
			id: 9,
			tenantId: DEMO_TENANT_ID,
			name: "租户管理员",
			code: "TENANT_ADMIN_DEMO",
			sort: 1,
			status: 1,
			dataScope: 1,
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 角色表：9 条（平台 8 + 演示 1）");

	// ==========================================
	// 6. 用户表（sys_user）—— 含平台运营 + 演示租户管理员
	// ==========================================
	await db.insert(sysUser).values([
		// 平台租户用户（tenant_id=0）
		{
			id: 1,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 3,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 4,
			tenantId: PLATFORM_TENANT_ID,
			username: "dept_manager",
			nickname: "部门主管",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 2,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345680",
			status: 1,
			email: "manager@youlaitech.com",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 5,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 6,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 7,
			tenantId: PLATFORM_TENANT_ID,
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
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 平台运营用户
		{
			id: 8,
			tenantId: PLATFORM_TENANT_ID,
			username: "platform_operator",
			nickname: "平台运营",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 1,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345684",
			status: 1,
			email: "operator@youlai.tech",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		// 演示租户管理员用户
		{
			id: 9,
			tenantId: DEMO_TENANT_ID,
			username: "demo_admin",
			nickname: "演示租户管理员",
			gender: 1,
			password: DEFAULT_PASSWORD,
			deptId: 4,
			avatar:
				"https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
			mobile: "18812345685",
			status: 1,
			email: "demo@youlai.tech",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 用户表：9 条（平台 8 + 演示 1）");

	// ==========================================
	// 7. 用户-角色关联表（sys_user_role）
	// ==========================================
	await db.insert(sysUserRole).values([
		// 平台租户用户
		{ tenantId: PLATFORM_TENANT_ID, userId: 1, roleId: 1 }, // root → ROOT
		{ tenantId: PLATFORM_TENANT_ID, userId: 2, roleId: 2 }, // admin → ADMIN
		{ tenantId: PLATFORM_TENANT_ID, userId: 3, roleId: 3 }, // test → GUEST
		{ tenantId: PLATFORM_TENANT_ID, userId: 4, roleId: 4 }, // dept_manager → DEPT_MANAGER
		{ tenantId: PLATFORM_TENANT_ID, userId: 5, roleId: 5 }, // dept_member → DEPT_MEMBER
		{ tenantId: PLATFORM_TENANT_ID, userId: 6, roleId: 6 }, // employee → EMPLOYEE
		{ tenantId: PLATFORM_TENANT_ID, userId: 7, roleId: 7 }, // custom_user → CUSTOM_USER
		{ tenantId: PLATFORM_TENANT_ID, userId: 8, roleId: 8 }, // platform_operator → PLATFORM_OPERATOR
		// 演示租户用户
		{ tenantId: DEMO_TENANT_ID, userId: 9, roleId: 9 }, // demo_admin → TENANT_ADMIN_DEMO
	]);
	console.log("  ✅ 用户-角色关联：9 条");

	// ==========================================
	// 8. 角色-菜单关联表（sys_role_menu）
	// ==========================================
	// ROOT (id=1) 不在此表中插入 —— 超管在代码中通过 code === 'ROOT' 判断放行

	// ADMIN (id=2) —— 平台租户全部菜单（scope=1 + scope=2）
	const adminMenuIds = [
		// 平台管理目录
		100,
		// 租户管理
		110, 1101, 1102, 1103, 1104, 1105, 1106, 1107,
		// 租户套餐
		120, 1201, 1202, 1203, 1204, 1205,
		// 系统管理目录
		1,
		// 用户管理
		10, 101, 102, 103, 104, 105, 106, 107,
		// 角色管理
		20, 201, 202, 203, 204, 205,
		// 菜单管理（平台级）
		30, 301, 302, 303, 304,
		// 部门管理
		40, 401, 402, 403, 404,
		// 文件存储按钮
		50, 51,
		// 字典管理
		250, 2501, 2502, 2503, 2504,
		// 字典项（隐藏）
		251, 2511, 2512, 2513, 2514,
		// 系统配置
		260, 2601, 2602, 2603, 2604,
		// 通知公告
		270, 2701, 2702, 2703, 2704, 2705, 2706,
	];
	await db.insert(sysRoleMenu).values(
		adminMenuIds.map((menuId) => ({
			tenantId: PLATFORM_TENANT_ID,
			roleId: 2,
			menuId,
		})),
	);

	// DEPT_MANAGER (id=4) —— 用户管理 + 角色管理（业务菜单）
	const managerMenuIds = [
		1, // 系统管理目录
		10, 101, 102, 103, 104, 105, 106, 107, // 用户管理（全部）
		20, 201, 202, 203, 204, 205, // 角色管理（全部）
	];
	await db.insert(sysRoleMenu).values(
		managerMenuIds.map((menuId) => ({
			tenantId: PLATFORM_TENANT_ID,
			roleId: 4,
			menuId,
		})),
	);

	// DEPT_MEMBER / EMPLOYEE / GUEST (id=5/6/3) —— 用户管理（仅查询）
	const guestMenuIds = [1, 10, 101];
	for (const roleId of [3, 5, 6]) {
		await db.insert(sysRoleMenu).values(
			guestMenuIds.map((menuId) => ({
				tenantId: PLATFORM_TENANT_ID,
				roleId,
				menuId,
			})),
		);
	}

	// CUSTOM_USER (id=7) —— 用户管理 + 角色管理
	await db.insert(sysRoleMenu).values(
		managerMenuIds.map((menuId) => ({
			tenantId: PLATFORM_TENANT_ID,
			roleId: 7,
			menuId,
		})),
	);

	// PLATFORM_OPERATOR (id=8) —— 租户管理 + 租户套餐（平台级菜单）
	const platformOperatorMenuIds = [
		100, // 平台管理目录
		110, 1101, 1102, 1103, 1104, 1105, 1106, 1107, // 租户管理
		120, 1201, 1202, 1203, 1204, 1205, // 租户套餐
	];
	await db.insert(sysRoleMenu).values(
		platformOperatorMenuIds.map((menuId) => ({
			tenantId: PLATFORM_TENANT_ID,
			roleId: 8,
			menuId,
		})),
	);

	// TENANT_ADMIN_DEMO (id=9) —— 演示租户业务菜单（scope=2 子集）
	const demoAdminMenuIds = [
		1, // 系统管理目录
		10, 101, 102, 103, 104, 105, 106, 107, // 用户管理
		20, 201, 202, 203, 204, 205, // 角色管理
		40, 401, 402, 403, 404, // 部门管理
		250, 2501, 2502, 2503, 2504, // 字典管理
		251, 2511, 2512, 2513, 2514, // 字典项
		260, 2601, 2602, 2603, 2604, // 系统配置
		270, 2701, 2702, 2703, 2704, 2705, 2706, // 通知公告
		50, 51, // 文件按钮
	];
	await db.insert(sysRoleMenu).values(
		demoAdminMenuIds.map((menuId) => ({
			tenantId: DEMO_TENANT_ID,
			roleId: 9,
			menuId,
		})),
	);

	console.log("  ✅ 角色-菜单关联：已写入");

	// ==========================================
	// 9. 角色-部门关联表（sys_role_dept）
	// ==========================================
	// CUSTOM_USER (id=7) —— 平台租户自定义权限
	await db.insert(sysRoleDept).values([
		{ tenantId: PLATFORM_TENANT_ID, roleId: 7, deptId: 1 },
		{ tenantId: PLATFORM_TENANT_ID, roleId: 7, deptId: 2 },
	]);
	// TENANT_ADMIN_DEMO (id=9) —— 演示租户自定义权限
	await db.insert(sysRoleDept).values([
		{ tenantId: DEMO_TENANT_ID, roleId: 9, deptId: 4 },
	]);
	console.log("  ✅ 角色-部门关联：3 条");

	// ==========================================
	// 10. 租户菜单表（sys_tenant_menu）
	// ==========================================
	// 平台租户(0)：全量菜单
	const allMenuIds = [
		...adminMenuIds,
	];
	await db.insert(sysTenantMenu).values(
		allMenuIds.map((menuId) => ({
			tenantId: PLATFORM_TENANT_ID,
			menuId,
		})),
	);

	// 演示租户(1)：仅业务菜单（scope=2），不含平台管理类
	const businessMenuIds = [
		1, 10, 101, 102, 103, 104, 105, 106, 107,
		20, 201, 202, 203, 204, 205,
		40, 401, 402, 403, 404,
		50, 51,
		250, 2501, 2502, 2503, 2504,
		251, 2511, 2512, 2513, 2514,
		260, 2601, 2602, 2603, 2604,
		270, 2701, 2702, 2703, 2704, 2705, 2706,
	];
	await db.insert(sysTenantMenu).values(
		businessMenuIds.map((menuId) => ({
			tenantId: DEMO_TENANT_ID,
			menuId,
		})),
	);
	console.log("  ✅ 租户菜单表：平台全量 + 演示仅业务");

	// ==========================================
	// 11. 租户套餐菜单表（sys_tenant_plan_menu）
	// ==========================================
	// 基础套餐(1) → 全部业务菜单
	await db.insert(sysTenantPlanMenu).values(
		businessMenuIds.map((menuId) => ({
			planId: 1,
			menuId,
		})),
	);
	console.log("  ✅ 租户套餐菜单表：基础套餐关联全部业务菜单");

	// ==========================================
	// 12. 字典类型（sys_dict）+ 字典项（sys_dict_item）
	// ==========================================
	await db.insert(sysDict).values([
		{
			id: 1,
			type: "gender",
			name: "性别",
			status: 1,
			remark: "",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 2,
			type: "notice_type",
			name: "通知类型",
			status: 1,
			remark: "",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
		{
			id: 3,
			type: "notice_level",
			name: "通知级别",
			status: 1,
			remark: "",
			createdBy: 1,
			createTime: NOW,
			updatedBy: 1,
			updateTime: NOW,
		},
	]);
	console.log("  ✅ 字典类型：3 条");

	await db.insert(sysDictItem).values([
		// gender
		{ id: 1, dictId: 1, label: "男", value: "1", sort: 1, status: 1, tagType: "primary", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 2, dictId: 1, label: "女", value: "2", sort: 2, status: 1, tagType: "danger", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 3, dictId: 1, label: "保密", value: "0", sort: 3, status: 1, tagType: "info", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		// notice_type
		{ id: 4, dictId: 2, label: "系统升级", value: "1", sort: 1, status: 1, tagType: "success", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 5, dictId: 2, label: "系统维护", value: "2", sort: 2, status: 1, tagType: "primary", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 6, dictId: 2, label: "安全警告", value: "3", sort: 3, status: 1, tagType: "danger", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 7, dictId: 2, label: "假期通知", value: "4", sort: 4, status: 1, tagType: "success", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 8, dictId: 2, label: "公司新闻", value: "5", sort: 5, status: 1, tagType: "primary", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 9, dictId: 2, label: "其他", value: "99", sort: 99, status: 1, tagType: "info", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		// notice_level
		{ id: 10, dictId: 3, label: "低", value: "L", sort: 1, status: 1, tagType: "info", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 11, dictId: 3, label: "中", value: "M", sort: 2, status: 1, tagType: "warning", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
		{ id: 12, dictId: 3, label: "高", value: "H", sort: 3, status: 1, tagType: "danger", createdBy: 1, createTime: NOW, updatedBy: 1, updateTime: NOW },
	]);
	console.log("  ✅ 字典项：12 条");

	// ==========================================
	// 13. 复位自增序列
	// ==========================================
	await db.execute(`
		SELECT setval('sys_dept_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_dept));
		SELECT setval('sys_menu_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_menu));
		SELECT setval('sys_role_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_role));
		SELECT setval('sys_user_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_user));
		SELECT setval('sys_dict_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_dict));
		SELECT setval('sys_dict_item_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_dict_item));
		SELECT setval('sys_tenant_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_tenant));
		SELECT setval('sys_tenant_plan_id_seq', (SELECT COALESCE(MAX(id), 1) FROM sys_tenant_plan));
	`);
	console.log("  ✅ 自增序列已复位");

	// ==========================================
	// 汇总
	// ==========================================
	console.log("");
	console.log("🎉 种子数据写入完成（多租户版）！");
	console.log("  ├─ 租户：2 条（平台=0 + 演示=1）");
	console.log("  ├─ 租户套餐：1 条（基础套餐）");
	console.log("  ├─ 部门：6 条（平台 3 + 演示 3）");
	console.log("  ├─ 菜单：55 条（含平台管理 + 租户管理/套餐管理 + scope）");
	console.log("  ├─ 字典类型：3 条");
	console.log("  ├─ 字典项：12 条");
	console.log("  ├─ 角色：9 条（平台 8 + 演示 1）");
	console.log("  ├─ 用户：9 条（平台 8 + 演示 1）");
	console.log("  ├─ 用户-角色：9 条");
	console.log("  ├─ 角色-菜单：已写入");
	console.log("  ├─ 角色-部门：3 条");
	console.log("  ├─ 租户菜单：平台全量 + 演示仅业务");
	console.log("  └─ 租户套餐菜单：基础套餐关联全部业务菜单");
	// ==========================================
	// 部分唯一索引（Drizzle schema 不支持部分索引，用原生 SQL 补建）
	// 对齐 Java 原版 uk_tenant_name / uk_tenant_code（含软删判断）
	// 注意：项目用 deleted_at 而非 is_deleted，WHERE 条件用 IS NULL
	// ==========================================
	await db.execute(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_role_tenant_name
		ON sys_role (tenant_id, name)
		WHERE deleted_at IS NULL
	`);
	await db.execute(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_role_tenant_code
		ON sys_role (tenant_id, code)
		WHERE deleted_at IS NULL
	`);
	await db.execute(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_tenant_code
		ON sys_dept (tenant_id, code)
		WHERE deleted_at IS NULL
	`);
	console.log("  ✅ 部分唯一索引：role(name/code)、dept(code)");

	console.log("");
	console.log("📋 角色清单（密码均为 123456）：");
	console.log("  root                → ROOT               超管，无部门，dataScope=ALL");
	console.log("  admin               → ADMIN              系统管理员，有来技术，dataScope=ALL");
	console.log("  test                → GUEST              访问游客，测试部门，dataScope=DEPT");
	console.log("  dept_manager        → DEPT_MANAGER       部门主管，有来技术，dataScope=DEPT_AND_SUB");
	console.log("  dept_member         → DEPT_MEMBER        部门成员，有来技术，dataScope=DEPT");
	console.log("  employee            → EMPLOYEE           普通员工，研发部门，dataScope=SELF");
	console.log("  custom_user         → CUSTOM_USER        自定义权限用户，测试部门，dataScope=CUSTOM");
	console.log("  platform_operator   → PLATFORM_OPERATOR  平台运营，有来技术，dataScope=ALL（租户管理权限）");
	console.log("  demo_admin          → TENANT_ADMIN_DEMO  演示租户管理员，演示公司，dataScope=ALL");
	console.log("");
	console.log("🔑 租户信息：");
	console.log("  平台租户 (tenant_id=0)：PLATFORM，全量菜单");
	console.log("  演示租户 (tenant_id=1)：DEMO，仅业务菜单（scope=2）");

	process.exit(0);
};

main().catch((err) => {
	console.error("❌ 种子数据写入失败:", err);
	process.exit(1);
});
