/**
 * data-scope.ts —— 数据权限纯函数（src/db/helpers/data-scope.ts）
 *
 * 设计要点（ponytail "极简 + Bug fix = root cause"）：
 *   1. 显式 helper，不是 SQL 拦截器（架构 4.4 核心反例）
 *   2. 纯函数：输入 ctx + tables → 返回 SQL | undefined；不查表、不抛 HTTP 错、不依赖 Elysia
 *   3. 多角色 OR 聚合：任一角色 ALL 短路返回 undefined（安全语义核心）
 *   4. 边界降级：deptId=null / treePath=null / customDeptIds=[] → sql`1=0` 零结果（安全默认偏严）
 *
 * 与 stage-4-rbac.md 文档的差异（实测修正）：
 *   - 文档示例写 DataScope = 'ALL' | 'DEPT' | ...（字符串字面量）
 *   - 实际 sys_role.data_scope 是 smallint 1-5（src/db/schema/system/role.ts）
 *   - JWT payload dataScopes: number[]（src/lib/jwt.ts）
 *   - 本实现按真实 schema 用 number，与 4.5 auth plugin 注入的 ctx.user.dataScopes 对齐
 *
 * DEPT_AND_SUB 子查询构造：
 *   user.deptId IN (SELECT id FROM sys_dept WHERE tree_path LIKE 'ctx.treePath%')
 *   Drizzle sql`...` 模板支持 Table chunk，${tables.dept} 自动渲染表名
 *
 * 使用示例：
 * ```ts
 * const where = and(
 *   isNull(sysUser.deleteTime),
 *   dataScopeFilter(ctx, { user: sysUser, dept: sysDept })
 * );
 * ```
 */

import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DB } from "@/db/client";
import { sysDept } from "@/db/schema/system/dept";
import { sysRoleDept, sysUserRole } from "@/db/schema/system/relation";
import { sysRole } from "@/db/schema/system/role";
import { sysUser } from "@/db/schema/system/user";
import { descendantsByTreePath } from "./tree";

/**
 * 数据权限 5 档枚举（对齐 sys_role.data_scope smallint 1-5）
 * 用 as const 对象 + 派生字面量联合，符合 AGENTS.md「as const 字面量联合 > enum」
 */
export const DATA_SCOPE = {
	/** 1 = 所有数据（不限） */
	ALL: 1,
	/** 2 = 部门及子部门 */
	DEPT_AND_SUB: 2,
	/** 3 = 本部门 */
	DEPT: 3,
	/** 4 = 本人 */
	SELF: 4,
	/** 5 = 自定义（按 sys_role_dept 绑定的部门列表） */
	CUSTOM: 5,
} as const;

/** 字面量联合：1 | 2 | 3 | 4 | 5 */
export type DataScope = (typeof DATA_SCOPE)[keyof typeof DATA_SCOPE];

/**
 * 单角色 scope 条目
 * - scope 用宽 number（兼容 JWT 序列化的 number[]，内部收窄）
 * - customDeptIds 仅 CUSTOM 时使用
 */
export type ScopeEntry = {
	scope: DataScope | number;
	customDeptIds?: number[];
};

/**
 * 数据权限上下文（routes 层装配）
 * - userId: 当前用户 ID
 * - deptId: 当前用户所属部门 ID（超管可能为 null）
 * - treePath: 当前用户所属部门的 tree_path 字符串（用于 DEPT_AND_SUB 子树查询）
 * - scopes: 多角色 scope 条目列表
 */
export type DataScopeContext = {
	userId: number;
	deptId: number | null;
	treePath: string | null;
	scopes: ScopeEntry[];
};

/** 被权限过滤的业务表（必须含 deptId + createdBy 列） */
export type DataScopeUserTable = {
	deptId: PgColumn;
	createdBy: PgColumn;
};

/**
 * 部门表（仅 DEPT_AND_SUB 子查询需要，可选）
 * 类型放宽为 PgTable 兼容：函数内要把它当 Table 用（Drizzle sql 模板渲染表名）
 * 调用方传完整 sysDept 即可（结构上有 id + treePath 字段即满足）
 */
export type DataScopeDeptTable = PgTable & {
	id: PgColumn;
	treePath: PgColumn;
};

/** tables 形参：user 必填，dept 仅 DEPT_AND_SUB 必填 */
export type DataScopeTables = {
	user: DataScopeUserTable;
	dept?: DataScopeDeptTable;
};

/**
 * 数据权限过滤 SQL 构造器（纯函数）
 *
 * @param ctx 数据权限上下文
 * @param tables 被过滤的业务表（user 必填，DEPT_AND_SUB 时 dept 必填）
 * @returns SQL fragment 或 undefined（undefined = 不加过滤条件）
 *
 * 行为：
 *   - 空 scopes → undefined（不限）
 *   - 任一 scope ALL → undefined（短路，多角色取并集的核心安全语义）
 *   - 单 scope → 返回该 scope 对应的 SQL
 *   - 多 scope 非 ALL → or(...) 拼接所有有效 scope 条件
 *   - 未知 scope（null/0/6+）→ 忽略，不计入聚合
 */
export const dataScopeFilter = (
	ctx: DataScopeContext,
	tables: DataScopeTables,
): SQL | undefined => {
	// 空 scopes → 不限
	if (ctx.scopes.length === 0) return undefined;

	// 任一角色 ALL → 短路（安全语义核心：多角色取并集）
	// 例如 admin (ALL) + staff (SELF) 必须等同 ALL，不能因 SELF 而限权
	if (ctx.scopes.some((s) => s.scope === DATA_SCOPE.ALL)) {
		return undefined;
	}

	// 逐 scope 生成条件，OR 聚合
	const whereFragments = ctx.scopes
		.map((s) => scopeToCondition(s, ctx, tables))
		.filter((c): c is SQL => c !== undefined);

	if (whereFragments.length === 0) return undefined;
	if (whereFragments.length === 1) return whereFragments[0];
	return or(...whereFragments);
};

/**
 * 单 scope → SQL 条件
 * 边界降级（安全默认偏严）：
 *   - DEPT + deptId=null → sql`1=0`（零结果，不抛错）
 *   - DEPT_AND_SUB + treePath=null 或无 dept table → sql`1=0`
 *   - CUSTOM + customDeptIds 为空/缺失 → sql`1=0`
 *   - ALL 在外层短路，本函数返回 undefined
 *   - 未知 scope（default）→ undefined（不计入聚合）
 */
const scopeToCondition = (
	scope: ScopeEntry,
	ctx: DataScopeContext,
	tables: DataScopeTables,
): SQL | undefined => {
	switch (scope.scope) {
		case DATA_SCOPE.ALL:
			return undefined;

		case DATA_SCOPE.SELF:
			return eq(tables.user.createdBy, ctx.userId);

		case DATA_SCOPE.DEPT:
			if (ctx.deptId == null) return sql`1=0`;
			return eq(tables.user.deptId, ctx.deptId);

		case DATA_SCOPE.DEPT_AND_SUB: {
			if (ctx.treePath == null) return sql`1=0`;
			if (!tables.dept) return sql`1=0`;
			// 子查询：user.deptId IN (SELECT id FROM sys_dept WHERE tree_path LIKE 'ctx.treePath%')
			// ${tables.dept} 直接渲染表名（Drizzle sql 模板支持 Table chunk）
			const subtree = descendantsByTreePath(tables.dept.treePath, ctx.treePath);
			return sql`${tables.user.deptId} IN (SELECT ${tables.dept.id} FROM ${tables.dept} WHERE ${subtree})`;
		}

		case DATA_SCOPE.CUSTOM:
			if (!scope.customDeptIds || scope.customDeptIds.length === 0) {
				return sql`1=0`;
			}
			return inArray(tables.user.deptId, scope.customDeptIds);

		default:
			// 未知 scope（如 null/0/6+/序列化异常值）→ 忽略，不计入聚合
			return undefined;
	}
};

/**
 * 装配 DataScopeContext（routes 层调一次，给列表查询用）
 *
 * ponytail: deptId / customDeptIds 并行查，treePath 依赖 deptId 串行查；
 * 全部用软删过滤 + 简短链式，没有 N+1
 *
 * @param userId 当前用户 ID（来自 JWT.sub）
 * @param dataScopes 用户的多个角色 dataScope 数组（来自 JWT.dataScopes）
 * @param db Drizzle 实例
 */
export const buildDataScopeContext = async (
	userId: number,
	dataScopes: number[],
	db: DB,
): Promise<DataScopeContext> => {
	const [deptId, customDeptIds] = await Promise.all([
		// 1. 当前用户所属部门（可能为 null：超管无部门）
		db
			.select({ deptId: sysUser.deptId })
			.from(sysUser)
			.where(and(eq(sysUser.id, userId), isNull(sysUser.deleteTime)))
			.limit(1)
			.then((rows) => rows[0]?.deptId ?? null),

		// 2. CUSTOM scope 的 deptIds（多角色取并集，内存 Set 去重）
		dataScopes.includes(DATA_SCOPE.CUSTOM)
			? db
					.select({ deptId: sysRoleDept.deptId })
					.from(sysUserRole)
					.innerJoin(sysRole, eq(sysRole.id, sysUserRole.roleId))
					.innerJoin(sysRoleDept, eq(sysRoleDept.roleId, sysRole.id))
					.where(
						and(
							eq(sysUserRole.userId, userId),
							isNull(sysRole.deleteTime),
							eq(sysRole.dataScope, DATA_SCOPE.CUSTOM),
						),
					)
					.then((rows) => Array.from(new Set(rows.map((r) => r.deptId))))
			: Promise.resolve([] as number[]),
	]);

	// 3. dept → treePath（依赖 deptId，必须串行）
	const treePath =
		deptId == null
			? null
			: (
					await db
						.select({ treePath: sysDept.treePath })
						.from(sysDept)
						.where(and(eq(sysDept.id, deptId), isNull(sysDept.deleteTime)))
						.limit(1)
				)[0]?.treePath ?? null;

	// 4. scopes 去重 + CUSTOM 携带 customDeptIds（多个 CUSTOM 共享同一 union 集）
	const seen = new Set<number>();
	const scopes: ScopeEntry[] = [];
	for (const scope of dataScopes) {
		if (seen.has(scope)) continue;
		seen.add(scope);
		scopes.push(
			scope === DATA_SCOPE.CUSTOM ? { scope, customDeptIds } : { scope },
		);
	}

	return { userId, deptId, treePath, scopes };
};
