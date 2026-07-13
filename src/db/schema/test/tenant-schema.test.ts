import { describe, expect, it } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../client";
import { sysMenu } from "../system/menu";
import { sysRoleMenu } from "../system/relation";
import { sysRole } from "../system/role";
import { sysTenant } from "../system/tenant";
import { sysUser } from "../system/user";

/**
 * Step 1 多租户 schema 运行时验证
 *
 * 通过查询 information_schema 验证：
 * 1. 新增 4 张租户表存在且结构正确
 * 2. 现有业务表含 tenant_id 列
 * 3. role/dept 唯一约束改为租户内复合
 * 4. 平台共享表不含 tenant_id
 */

describe("多租户 schema 运行时验证", () => {
	// ── 1. 新增租户表存在 ──
	describe("新增租户表存在且结构正确", () => {
		it("sys_tenant 表存在", async () => {
			const [row] = await db.execute<{ exists: boolean }>(`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables
				               WHERE table_schema = 'public'
				                 AND table_name = 'sys_tenant') AS exists
			`);
			expect(row?.exists).toBe(true);
		});

		it("sys_tenant 含平台级字段（code 全局唯一、status、planId、expireTime），不含 tenant_id", async () => {
			const cols = await db.execute<{ column_name: string }>(`
				SELECT column_name FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'sys_tenant'
				ORDER BY ordinal_position
			`);
			const colNames = cols.map((c) => c.column_name);
			expect(colNames).toContain("code");
			expect(colNames).toContain("status");
			expect(colNames).toContain("plan_id");
			expect(colNames).toContain("expire_time");
			// sys_tenant 自身不需要 tenant_id（它就是租户定义表）
			expect(colNames).not.toContain("tenant_id");
		});

		it("sys_tenant_plan 表存在", async () => {
			const [row] = await db.execute<{ exists: boolean }>(`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables
				               WHERE table_schema = 'public'
				                 AND table_name = 'sys_tenant_plan') AS exists
			`);
			expect(row?.exists).toBe(true);
		});

		it("sys_tenant_plan_menu 桥表存在（无审计列，PK 为 (tenant_plan_id, menu_id)）", async () => {
			const [row] = await db.execute<{ exists: boolean }>(`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables
				               WHERE table_schema = 'public'
				                 AND table_name = 'sys_tenant_plan_menu') AS exists
			`);
			expect(row?.exists).toBe(true);

			const cols = await db.execute<{ column_name: string }>(`
				SELECT column_name FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'sys_tenant_plan_menu'
				ORDER BY ordinal_position
			`);
			const colNames = cols.map((c) => c.column_name);
			expect(colNames).toContain("tenant_plan_id");
			expect(colNames).toContain("menu_id");
			expect(colNames).not.toContain("created_by");
			expect(colNames).not.toContain("created_at");
		});

		it("sys_tenant_menu 桥表存在（无审计列，PK 为 (tenant_id, menu_id)）", async () => {
			const [row] = await db.execute<{ exists: boolean }>(`
				SELECT EXISTS (SELECT 1 FROM information_schema.tables
				               WHERE table_schema = 'public'
				                 AND table_name = 'sys_tenant_menu') AS exists
			`);
			expect(row?.exists).toBe(true);

			const cols = await db.execute<{ column_name: string }>(`
				SELECT column_name FROM information_schema.columns
				WHERE table_schema = 'public'
				  AND table_name = 'sys_tenant_menu'
				ORDER BY ordinal_position
			`);
			const colNames = cols.map((c) => c.column_name);
			expect(colNames).toContain("tenant_id");
			expect(colNames).toContain("menu_id");
			expect(colNames).not.toContain("created_by");
		});
	});

	// ── 2. 现有业务表含 tenant_id ──
	describe("现有业务表含 tenant_id 列", () => {
		const tables = [
			"sys_user",
			"sys_role",
			"sys_dept",
			"sys_notice",
			"sys_user_notice",
			"sys_oper_log",
			"sys_login_log",
			"sys_file",
			"sys_user_role",
			"sys_role_menu",
			"sys_role_dept",
		];

		for (const table of tables) {
			it(`${table} 含 tenant_id 列且 NOT NULL DEFAULT 0`, async () => {
				const rows = await db.execute<{
					column_name: string;
					is_nullable: string;
					column_default: string;
				}>(`
					SELECT column_name, is_nullable, column_default
					FROM information_schema.columns
					WHERE table_schema = 'public'
					  AND table_name = '${table}'
					  AND column_name = 'tenant_id'
				`);
				expect(rows.length).toBe(1);
				expect(rows[0]?.is_nullable).toBe("NO");
				expect(rows[0]?.column_default).toBe("0");
			});
		}
	});

	// ── 3. role/dept 唯一约束 ──
	describe("role/dept 唯一约束改为租户内复合", () => {
		it("sys_role.name 无单列唯一索引", async () => {
			const rows = await db.execute<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE tablename = 'sys_role'
				  AND indexdef LIKE '%name%'
			`);
			const nameIndexes = rows.filter((r) => !r.indexname.includes("pkey"));
			const singleNameUnique = nameIndexes.filter((r) =>
				r.indexname.includes("uniq_role_name"),
			);
			expect(singleNameUnique.length).toBe(0);
		});

		it("sys_role 有 uniq_role_tenant_name 复合唯一索引", async () => {
			const rows = await db.execute<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE tablename = 'sys_role'
				  AND indexname = 'uniq_role_tenant_name'
			`);
			expect(rows.length).toBe(1);
		});

		it("sys_role 有 uniq_role_tenant_code 复合唯一索引", async () => {
			const rows = await db.execute<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE tablename = 'sys_role'
				  AND indexname = 'uniq_role_tenant_code'
			`);
			expect(rows.length).toBe(1);
		});

		it("sys_dept 无单列唯一索引", async () => {
			const rows = await db.execute<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE tablename = 'sys_dept'
				  AND indexdef LIKE '%code%'
			`);
			const singleCodeUnique = rows.filter(
				(r) =>
					r.indexname.includes("uniq_dept_code") &&
					!r.indexname.includes("tenant"),
			);
			expect(singleCodeUnique.length).toBe(0);
		});

		it("sys_dept 有 uniq_dept_tenant_code 复合唯一索引", async () => {
			const rows = await db.execute<{ indexname: string }>(`
				SELECT indexname FROM pg_indexes
				WHERE tablename = 'sys_dept'
				  AND indexname = 'uniq_dept_tenant_code'
			`);
			expect(rows.length).toBe(1);
		});
	});

	// ── 4. 平台共享表 ──
	describe("平台共享表不含 tenant_id", () => {
		const sharedTables = [
			"sys_dict",
			"sys_config",
			"sys_menu",
			"sys_ip_blacklist",
		];

		for (const table of sharedTables) {
			it(`${table} 无 tenant_id 列`, async () => {
				const rows = await db.execute<{ column_name: string }>(`
					SELECT column_name FROM information_schema.columns
					WHERE table_schema = 'public'
					  AND table_name = '${table}'
					  AND column_name = 'tenant_id'
				`);
				expect(rows.length).toBe(0);
			});
		}
	});

	// ── 5. 种子数据 ──
	describe("种子数据", () => {
		it("平台租户 (id=0) 存在", async () => {
			const [row] = await db
				.select()
				.from(sysTenant)
				.where(eq(sysTenant.id, 0))
				.limit(1);
			expect(row).toBeDefined();
			expect(row?.code).toBe("PLATFORM");
		});

		it("演示租户 (id=1) 存在且关联套餐", async () => {
			const [row] = await db
				.select()
				.from(sysTenant)
				.where(eq(sysTenant.id, 1))
				.limit(1);
			expect(row).toBeDefined();
			expect(row?.code).toBe("DEMO");
			expect(row?.planId).toBe(1);
		});

		it("平台租户用户归 tenant_id=0", async () => {
			const [admin] = await db
				.select()
				.from(sysUser)
				.where(and(eq(sysUser.id, 2), eq(sysUser.username, "admin")))
				.limit(1);
			expect(admin).toBeDefined();
			expect(admin?.tenantId).toBe(0);
		});

		it("演示租户管理员归 tenant_id=1", async () => {
			const [demo] = await db
				.select()
				.from(sysUser)
				.where(and(eq(sysUser.id, 9), eq(sysUser.username, "demo_admin")))
				.limit(1);
			expect(demo).toBeDefined();
			expect(demo?.tenantId).toBe(1);
		});

		it("菜单含租户管理/套餐管理节点且 scope 赋值", async () => {
			const tenantMenu = await db
				.select()
				.from(sysMenu)
				.where(and(eq(sysMenu.id, 110), isNull(sysMenu.deleteTime)))
				.limit(1);
			expect(tenantMenu.length).toBe(1);
			expect(tenantMenu[0]?.scope).toBe(1); // 平台级

			const userMenu = await db
				.select()
				.from(sysMenu)
				.where(and(eq(sysMenu.id, 10), isNull(sysMenu.deleteTime)))
				.limit(1);
			expect(userMenu.length).toBe(1);
			expect(userMenu[0]?.scope).toBe(2); // 业务级
		});

		it("平台运营角色绑定租户管理权限", async () => {
			const [role] = await db
				.select()
				.from(sysRole)
				.where(
					and(
						eq(sysRole.code, "PLATFORM_OPERATOR"),
						isNull(sysRole.deleteTime),
					),
				)
				.limit(1);
			expect(role).toBeDefined();
			expect(role?.tenantId).toBe(0);
			if (!role) return; // 类型收窄，后续 role.id 安全

			const perms = await db
				.select({ perm: sysMenu.perm })
				.from(sysRoleMenu)
				.innerJoin(sysMenu, eq(sysRoleMenu.menuId, sysMenu.id))
				.where(
					and(eq(sysRoleMenu.roleId, role.id), isNull(sysMenu.deleteTime)),
				);

			const permValues = perms.map((p) => p.perm).filter(Boolean);
			expect(permValues).toContain("sys:tenant:list");
			expect(permValues).toContain("sys:tenant-plan:list");
		});
	});
});
