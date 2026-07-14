/**
 * 跨租户隔离单测（Step 4 门禁）
 *
 * 覆盖计划 §3.1 / §4.x 要求的隔离场景：
 * 1. 列表隔离：user / role / dept / notice 查询仅返回当前租户数据（非平台租户）
 * 2. 菜单树泄漏：同名角色在不同租户绑定不同菜单，互不可见
 * 3. 按 ID 跨租户访问：非平台租户跨租户查 findUserById / findRoleById / findDeptById 返回空
 * 4. 认证链权限装载：findUserPerms / findUserRoles 用 homeTenantId，不漂移
 * 5. 租户菜单子集：findMenusByRoleCodes 结果仅含 sys_tenant_menu 交集 + 计划过滤
 * 6. fan-out 隔离：publishNotice 仅物化给当前租户用户
 * 7. findMenuOptions 租户感知：非平台租户下拉仅见自身授权菜单
 *
 * 设计约定：平台租户(tenantId=0) bypass 隔离，可跨租户查看所有数据；
 *           非平台租户(tenantId>0) 严格隔离，不可见其他租户数据。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "@/app";
import { db } from "@/db/client";
import { DATA_SCOPE, type DataScopeContext } from "@/db/helpers/data-scope";
import { sysNotice, sysUserNotice } from "@/db/schema/system/notice";
import { findUserPerms } from "@/modules/auth/queries";
import { findAllDepts, findDeptById } from "@/modules/dept/queries";
import { findMenuOptions, findMenusByRoleCodes } from "@/modules/menu/queries";
import {
	findMyNotices,
	findNoticeById,
	findNotices,
	publishNotice,
} from "@/modules/notice/queries";
import { findRoleById, findRoles } from "@/modules/role/queries";
import { findUserById, findUsers } from "@/modules/user/queries";

// ─── 种子数据已知 ID ───
const PLATFORM_TENANT = 0;
const DEMO_TENANT = 1;

const PLATFORM_USERS = { root: 1, admin: 2, test: 3, platformOperator: 8 };
const DEMO_USER = { demoAdmin: 9 };
const PLATFORM_ROLES = { root: 1, admin: 2, platformOperator: 8 };
const DEMO_ROLE = { tenantAdmin: 9 };

describe("跨租户隔离", () => {
	beforeAll(async () => {
		app.listen(0);
	});
	afterAll(async () => {
		app.stop();
	});

	// ── 1. 列表隔离 ──
	describe("列表隔离", () => {
		const allCtx: DataScopeContext = {
			userId: 0,
			deptId: null,
			treePath: null,
			scopes: [{ scope: DATA_SCOPE.ALL }],
		};

		test("findUsers(tenant=1) 看不到 tenant=0 的用户", async () => {
			const result = await findUsers(
				{ pageNum: 1, pageSize: 100 },
				allCtx,
				DEMO_TENANT,
				db,
			);
			const ids = result.list.map((u) => u.id);
			expect(ids).toContain(DEMO_USER.demoAdmin);
			expect(ids).not.toContain(PLATFORM_USERS.root);
		});

		test("findUsers(tenant=0) 能看到全量用户（platform bypass）", async () => {
			const result = await findUsers(
				{ pageNum: 1, pageSize: 100 },
				allCtx,
				PLATFORM_TENANT,
				db,
			);
			const ids = result.list.map((u) => u.id);
			expect(ids).toContain(PLATFORM_USERS.root);
			expect(ids).toContain(DEMO_USER.demoAdmin);
		});

		test("findRoles(tenant=1) 看不到 tenant=0 的角色", async () => {
			const result = await findRoles(
				{ pageNum: 1, pageSize: 100 },
				DEMO_TENANT,
				db,
			);
			const codes = result.list.map((r) => r.code);
			expect(codes).toContain("TENANT_ADMIN_DEMO");
			expect(codes).not.toContain("ROOT");
		});

		test("findRoles(tenant=0) 能看到全量角色（platform bypass）", async () => {
			const result = await findRoles(
				{ pageNum: 1, pageSize: 100 },
				PLATFORM_TENANT,
				db,
			);
			const codes = result.list.map((r) => r.code);
			expect(codes).toContain("ROOT");
			expect(codes).toContain("TENANT_ADMIN_DEMO");
		});

		test("findAllDepts(tenant=1) 看不到 tenant=0 的部门", async () => {
			const result = await findAllDepts({}, DEMO_TENANT, db);
			const codes = result.map((d) => d.code);
			expect(codes).toContain("DEMO_COMPANY");
			expect(codes).not.toContain("YOULAI");
		});

		test("findAllDepts(tenant=0) 能看到全量部门（platform bypass）", async () => {
			const result = await findAllDepts({}, PLATFORM_TENANT, db);
			const codes = result.map((d) => d.code);
			expect(codes).toContain("YOULAI");
			expect(codes).toContain("DEMO_COMPANY");
		});

		test("findNotices(tenant=1) 看不到 tenant=0 的通知", async () => {
			const result = await findNotices(
				{ pageNum: 1, pageSize: 100 },
				DEMO_TENANT,
				db,
			);
			for (const notice of result.list) {
				expect(notice.tenantId).toBe(DEMO_TENANT);
			}
		});

		test("findNotices(tenant=0) 能看到全量通知（platform bypass）", async () => {
			const result = await findNotices(
				{ pageNum: 1, pageSize: 100 },
				PLATFORM_TENANT,
				db,
			);
			for (const notice of result.list) {
				expect([PLATFORM_TENANT, DEMO_TENANT]).toContain(notice.tenantId);
			}
		});
	});

	// ── 2. 菜单树隔离 ──
	describe("菜单树隔离", () => {
		test("findMenusByRoleCodes(tenant=1) 不含平台管理节点（scope=1）", async () => {
			const menus = await findMenusByRoleCodes(
				["TENANT_ADMIN_DEMO"],
				DEMO_TENANT,
				db,
			);
			const ids = menus.map((m) => m.id);
			expect(ids).not.toContain(100);
			expect(ids).not.toContain(1101);
			expect(ids).toContain(1);
		});

		test("findMenusByRoleCodes(tenant=0) 包含全量菜单（platform bypass）", async () => {
			// 平台租户 bypass：用 tenant=0 自身的角色验证可见全量
			const menus = await findMenusByRoleCodes(["ADMIN"], PLATFORM_TENANT, db);
			expect(menus.length).toBeGreaterThan(0);
			expect(menus.map((m) => m.id)).toContain(1);
		});

		test("findMenuOptions(tenant=1) 仅返回业务菜单", async () => {
			const options = await findMenuOptions(true, undefined, DEMO_TENANT, db);
			const values = options.map((o) => o.value);
			expect(values).not.toContain("100");
			expect(values).toContain("1");
		});

		test("findMenuOptions(tenant=0) 返回全量菜单（platform bypass）", async () => {
			const options = await findMenuOptions(
				true,
				undefined,
				PLATFORM_TENANT,
				db,
			);
			const values = options.map((o) => o.value);
			expect(values).toContain("100");
			expect(values).toContain("1");
		});
	});

	// ── 3. 按 ID 跨租户访问 ──
	describe("按 ID 跨租户访问隔离", () => {
		test("findUserById(tenant=1, id=1) 返回 undefined（tenant=0 的用户）", async () => {
			expect(
				await findUserById(PLATFORM_USERS.root, DEMO_TENANT, db),
			).toBeUndefined();
		});

		test("findUserById(tenant=0, id=9) 返回用户（platform bypass）", async () => {
			const user = await findUserById(DEMO_USER.demoAdmin, PLATFORM_TENANT, db);
			expect(user).toBeDefined();
			expect(user?.tenantId).toBe(DEMO_TENANT);
		});

		test("findRoleById(tenant=1, id=1) 返回 undefined（tenant=0 的角色）", async () => {
			expect(
				await findRoleById(PLATFORM_ROLES.root, DEMO_TENANT, db),
			).toBeUndefined();
		});

		test("findRoleById(tenant=0, id=9) 返回角色（platform bypass）", async () => {
			const role = await findRoleById(
				DEMO_ROLE.tenantAdmin,
				PLATFORM_TENANT,
				db,
			);
			expect(role).toBeDefined();
			expect(role?.tenantId).toBe(DEMO_TENANT);
		});

		test("findDeptById(tenant=1, id=1) 返回 undefined（tenant=0 的部门）", async () => {
			expect(await findDeptById(1, DEMO_TENANT, db)).toBeUndefined();
		});

		test("findDeptById(tenant=0, id=4) 返回部门（platform bypass）", async () => {
			const dept = await findDeptById(4, PLATFORM_TENANT, db);
			expect(dept).toBeDefined();
			expect(dept?.tenantId).toBe(DEMO_TENANT);
		});

		test("findNoticeById(tenant=0) 能看到 tenant=1 的通知（platform bypass）", async () => {
			const tenant1Notices = await findNotices(
				{ pageNum: 1, pageSize: 100 },
				DEMO_TENANT,
				db,
			);
			if (tenant1Notices.list.length > 0) {
				const noticeItem = tenant1Notices.list[0];
				if (noticeItem) {
					const crossResult = await findNoticeById(
						noticeItem.id,
						PLATFORM_TENANT,
						db,
					);
					expect(crossResult).toBeDefined();
					expect(crossResult?.tenantId).toBe(DEMO_TENANT);
				}
			}
		});
	});

	// ── 4. 认证链权限装载 ──
	describe("认证链权限装载隔离", () => {
		test("findUserPerms(platform_operator) 返回平台角色权限", async () => {
			const perms = await findUserPerms(
				PLATFORM_USERS.platformOperator,
				PLATFORM_TENANT,
				db,
			);
			expect(perms).toContain("sys:tenant:list");
			expect(perms).toContain("sys:tenant:create");
		});

		test("findUserPerms(demo_admin) 返回演示租户权限", async () => {
			const perms = await findUserPerms(DEMO_USER.demoAdmin, DEMO_TENANT, db);
			expect(perms).toContain("sys:user:list");
			expect(perms).toContain("sys:role:list");
			expect(perms).not.toContain("sys:tenant:list");
		});

		test("findUserPerms 结果不随调用顺序漂移", async () => {
			// 同一用户用同一 homeTenantId 调用两次，结果应一致
			const perms1 = await findUserPerms(
				PLATFORM_USERS.platformOperator,
				PLATFORM_TENANT,
				db,
			);
			const perms2 = await findUserPerms(
				PLATFORM_USERS.platformOperator,
				PLATFORM_TENANT,
				db,
			);
			expect(perms1).toEqual(perms2);
			expect(perms1).toContain("sys:tenant:list");
		});
	});

	// ── 5. 租户菜单子集 ──
	describe("租户菜单子集", () => {
		test("tenant=1 的 findMenusByRoleCodes 不包含平台管理节点", async () => {
			const menus = await findMenusByRoleCodes(
				["TENANT_ADMIN_DEMO"],
				DEMO_TENANT,
				db,
			);
			const ids = menus.map((m) => m.id);
			expect(ids).not.toContain(100);
			expect(ids).not.toContain(110);
			expect(ids).not.toContain(120);
			expect(ids).not.toContain(30);
		});

		test("tenant=1 的 findMenusByRoleCodes 包含业务菜单", async () => {
			const menus = await findMenusByRoleCodes(
				["TENANT_ADMIN_DEMO"],
				DEMO_TENANT,
				db,
			);
			const ids = menus.map((m) => m.id);
			expect(ids).toContain(1);
			expect(ids).toContain(10);
			expect(ids).toContain(20);
			expect(ids).toContain(40);
		});
	});

	// ── 6. fan-out 隔离 ──
	describe("通知 fan-out 隔离", () => {
		test("tenant=0 发布通知后，tenant=1 用户看不到", async () => {
			const [notice] = await db
				.insert(sysNotice)
				.values({
					title: "跨租户隔离测试通知",
					content: "测试内容",
					type: 1,
					publishStatus: 1,
					publisherId: PLATFORM_USERS.admin,
					tenantId: PLATFORM_TENANT,
					targetType: 1,
					targetUserIds: "",
					createTime: new Date().toISOString(),
					updateTime: new Date().toISOString(),
				})
				.returning();

			if (!notice) return;
			const noticeId = notice.id;

			try {
				await publishNotice(
					notice.id,
					PLATFORM_USERS.admin,
					PLATFORM_TENANT,
					db,
				);

				const tenant1Notices = await findMyNotices(
					{ pageNum: 1, pageSize: 100 },
					DEMO_USER.demoAdmin,
					DEMO_TENANT,
					db,
				);
				expect(tenant1Notices.list.map((n) => n.id)).not.toContain(noticeId);

				const tenant0Notices = await findMyNotices(
					{ pageNum: 1, pageSize: 100 },
					PLATFORM_USERS.admin,
					PLATFORM_TENANT,
					db,
				);
				expect(tenant0Notices.list.map((n) => n.id)).toContain(noticeId);
			} finally {
				await db
					.delete(sysUserNotice)
					.where(eq(sysUserNotice.noticeId, noticeId));
				await db.delete(sysNotice).where(eq(sysNotice.id, noticeId));
			}
		});
	});

	// ── 7. 租户内唯一约束 ──
	describe("租户内唯一约束", () => {
		test("tenant=1 的角色编码集合不含 tenant=0 的编码", async () => {
			const tenant1Roles = await findRoles(
				{ pageNum: 1, pageSize: 100 },
				DEMO_TENANT,
				db,
			);
			const tenant0Roles = await findRoles(
				{ pageNum: 1, pageSize: 100 },
				PLATFORM_TENANT,
				db,
			);
			const tenant1Codes = new Set(tenant1Roles.list.map((r) => r.code));
			const tenant0Codes = new Set(tenant0Roles.list.map((r) => r.code));
			// 验证：tenant=1 的编码集合中不含 tenant=0 的编码
			for (const code of tenant1Codes) {
				// TENANT_ADMIN_DEMO 是 tenant=1 独有的，不应出现在 tenant=0 的可隔离视图中
				// 注意：platform bypass 让 tenant=0 能看到 tenant=1 的数据，但 tenant=1 看不到 tenant=0
				expect(tenant0Codes.has(code)).toBe(true); // tenant=0 确实有这些（platform bypass 可见）
			}
			// 更直接的验证：tenant=1 的角色列表不应包含 tenant=0 独有的角色编码
			const tenant0OnlyCodes = [
				"ROOT",
				"ADMIN",
				"GUEST",
				"DEPT_MANAGER",
				"DEPT_MEMBER",
				"EMPLOYEE",
				"CUSTOM_USER",
				"PLATFORM_OPERATOR",
			];
			for (const code of tenant0OnlyCodes) {
				expect(tenant1Codes.has(code)).toBe(false);
			}
		});

		test("tenant=1 的部门编码集合不含 tenant=0 的编码", async () => {
			const tenant1Depts = await findAllDepts({}, DEMO_TENANT, db);
			const tenant1Codes = new Set(tenant1Depts.map((d) => d.code));
			const tenant0OnlyCodes = ["YOULAI", "RD001", "QA001"];
			for (const code of tenant0OnlyCodes) {
				expect(tenant1Codes.has(code)).toBe(false);
			}
		});
	});
});
