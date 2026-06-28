/**
 * data-scope.test.ts —— src/db/helpers/data-scope.ts 单元测试
 *
 * 测试策略（ponytail "副作用函数如何断言"）：
 *   dataScopeFilter 返回的是 SQL 片段（描述"做什么"的对象），不能 toEqual 直接比对
 *   Drizzle 的 SQL.toQuery() 需要完整 BuildQueryConfig（含 escapeName/Param/String）
 *   测试 helper renderSql 用 new PgDialect() 构造 config，再调 toQuery 拿到 { sql, params }
 *   - 断言 sql 字符串 toContain 关键片段（"created_by" / "dept_id" / "LIKE" / "IN" / "1=0"）
 *   - 断言 params 数组 toContain 关键值
 *   - 用 toContain 而非 toBe：Drizzle 输出含字段引号、空格、参数占位符 $N 位置浮动，全等比对不稳
 *
 * 覆盖矩阵（8 case）：
 *   1. 空 scopes → undefined
 *   2. 单 ALL    → undefined
 *   3. 单 SELF   → SQL 含 "created_by" + userId
 *   4. 单 DEPT   → SQL 含 "dept_id" + deptId（边界：deptId=null → 1=0）
 *   5. 单 DEPT_AND_SUB → SQL 含 LIKE（边界：treePath=null → 1=0）
 *   6. 单 CUSTOM → SQL 含 IN + 自定义 deptIds（边界：customDeptIds=[] → 1=0）
 *   7. 多角色 ALL+SELF → undefined（ALL 短路，安全语义核心）
 *   8. 多角色 DEPT+SELF → OR 聚合（非 ALL 时不能短路）
 *
 * biome noNonNullAssertion 规则：用 defined() helper 替代 result!
 */

import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";
import { PgDialect } from "drizzle-orm/pg-core";
import { sysDept } from "@/db/schema/system/dept";
import { sysUser } from "@/db/schema/system/user";
import {
	DATA_SCOPE,
	type DataScopeContext,
	dataScopeFilter,
} from "./data-scope";

/**
 * 类型守卫助手：收窄 T | undefined 为 T，违反项目 biome noNonNullAssertion 规则
 * 错误时抛出，断言信息通过 message 带上，比 expect().toBeDefined() 更紧凑
 */
const defined = <T>(value: T | undefined, message: string): T => {
	if (value === undefined) throw new Error(`Expected defined: ${message}`);
	return value;
};

/** 测试辅助：用 PgDialect 构造 BuildQueryConfig，把 SQL 片段转成 { sql, params }
 * 注意：PgDialect 实例不暴露 casing 字段，BuildQueryConfig.casing: CasingCache 必填
 * 所以单独 new CasingCache() 兜底（默认无 casing 配置）
 */
const renderSql = (fragment: SQL): { sql: string; params: unknown[] } => {
	const dialect = new PgDialect();
	return fragment.toQuery({
		casing: new CasingCache(),
		escapeName: dialect.escapeName.bind(dialect),
		escapeParam: dialect.escapeParam.bind(dialect),
		escapeString: dialect.escapeString.bind(dialect),
	});
};

/** 默认 ctx：用户 100、部门 5、treePath "0,1,5" */
const baseCtx = (
	overrides: Partial<DataScopeContext> = {},
): DataScopeContext => ({
	userId: 100,
	deptId: 5,
	treePath: "0,1,5",
	scopes: [],
	...overrides,
});

/** 默认 tables：只传 user（DEPT_AND_SUB 测例会传 dept） */
const baseTables = () => ({ user: sysUser });

describe("dataScopeFilter", () => {
	test("1. 空 scopes → undefined（不限）", () => {
		const ctx = baseCtx({ scopes: [] });
		expect(dataScopeFilter(ctx, baseTables())).toBeUndefined();
	});

	test("2. 单 ALL (1) → undefined（不限）", () => {
		const ctx = baseCtx({ scopes: [{ scope: DATA_SCOPE.ALL }] });
		expect(dataScopeFilter(ctx, baseTables())).toBeUndefined();
	});

	test("3. 单 SELF (4) → SQL 过滤 created_by = userId", () => {
		const ctx = baseCtx({ scopes: [{ scope: DATA_SCOPE.SELF }] });
		const { sql, params } = renderSql(
			defined(dataScopeFilter(ctx, baseTables()), "case 3 single SELF"),
		);

		expect(sql).toContain('"created_by"');
		expect(sql).toContain("= $1");
		expect(params).toContain(100);
	});

	test("4. 单 DEPT (3) → SQL 过滤 dept_id = deptId；deptId=null 降级 1=0", () => {
		// 正常路径
		const okCtx = baseCtx({ scopes: [{ scope: DATA_SCOPE.DEPT }] });
		const okQuery = renderSql(
			defined(dataScopeFilter(okCtx, baseTables()), "case 4 DEPT ok"),
		);
		expect(okQuery.sql).toContain('"dept_id"');
		expect(okQuery.sql).toContain("= $1");
		expect(okQuery.params).toContain(5);

		// 边界：deptId 为 null（超管无部门）→ 零结果
		const nullCtx = baseCtx({
			deptId: null,
			scopes: [{ scope: DATA_SCOPE.DEPT }],
		});
		const nullQuery = renderSql(
			defined(
				dataScopeFilter(nullCtx, baseTables()),
				"case 4 DEPT deptId=null",
			),
		);
		expect(nullQuery.sql).toContain("1=0");
	});

	test("5. 单 DEPT_AND_SUB (2) → SQL 子查询 LIKE treePath%；treePath=null 降级 1=0", () => {
		const tables = { user: sysUser, dept: sysDept };

		// 正常路径
		const okCtx = baseCtx({ scopes: [{ scope: DATA_SCOPE.DEPT_AND_SUB }] });
		const okQuery = renderSql(
			defined(dataScopeFilter(okCtx, tables), "case 5 DEPT_AND_SUB ok"),
		);
		expect(okQuery.sql.toUpperCase()).toContain("LIKE");
		expect(okQuery.sql).toContain('"dept_id"');
		expect(okQuery.sql).toContain('"tree_path"');
		expect(okQuery.params).toContain("0,1,5%");

		// 边界：treePath 为 null → 零结果
		const nullCtx = baseCtx({
			treePath: null,
			scopes: [{ scope: DATA_SCOPE.DEPT_AND_SUB }],
		});
		const nullQuery = renderSql(
			defined(
				dataScopeFilter(nullCtx, tables),
				"case 5 DEPT_AND_SUB treePath=null",
			),
		);
		expect(nullQuery.sql).toContain("1=0");
	});

	test("6. 单 CUSTOM (5) → SQL 过滤 dept_id IN (customDeptIds)；空数组降级 1=0", () => {
		// 正常路径
		const okCtx = baseCtx({
			scopes: [{ scope: DATA_SCOPE.CUSTOM, customDeptIds: [10, 20, 30] }],
		});
		const okQuery = renderSql(
			defined(dataScopeFilter(okCtx, baseTables()), "case 6 CUSTOM ok"),
		);
		expect(okQuery.sql).toContain('"dept_id"');
		expect(okQuery.sql.toUpperCase()).toContain("IN");
		expect(okQuery.params).toEqual(expect.arrayContaining([10, 20, 30]));

		// 边界：customDeptIds 为空（角色未绑部门）→ 零结果
		const emptyCtx = baseCtx({
			scopes: [{ scope: DATA_SCOPE.CUSTOM, customDeptIds: [] }],
		});
		const emptyQuery = renderSql(
			defined(
				dataScopeFilter(emptyCtx, baseTables()),
				"case 6 CUSTOM customDeptIds=[]",
			),
		);
		expect(emptyQuery.sql).toContain("1=0");
	});

	test("7. 多角色 ALL+SELF → undefined（ALL 短路，安全语义核心）", () => {
		// 关键安全语义：admin (ALL) + staff (SELF) → 等同 ALL，不能因 SELF 而限权
		const ctx = baseCtx({
			scopes: [{ scope: DATA_SCOPE.SELF }, { scope: DATA_SCOPE.ALL }],
		});
		expect(dataScopeFilter(ctx, baseTables())).toBeUndefined();
	});

	test("8. 多角色 DEPT+SELF → OR 聚合（非 ALL 时不能短路）", () => {
		const ctx = baseCtx({
			scopes: [{ scope: DATA_SCOPE.DEPT }, { scope: DATA_SCOPE.SELF }],
		});
		const { sql, params } = renderSql(
			defined(dataScopeFilter(ctx, baseTables()), "case 8 DEPT+SELF OR"),
		);

		// 应该同时含 dept_id 和 created_by 两个条件
		expect(sql).toContain('"dept_id"');
		expect(sql).toContain('"created_by"');
		expect(sql.toUpperCase()).toContain("OR");
		expect(params).toContain(5); // deptId
		expect(params).toContain(100); // userId
	});
});
