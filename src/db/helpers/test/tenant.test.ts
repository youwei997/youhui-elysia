/**
 * tenant.test.ts —— src/db/helpers/tenant.ts 单元测试
 *
 * 测试策略（与 data-scope.test.ts 一致）：
 *   tenantEq 返回的是 SQL | undefined，用 PgDialect + toQuery 转成 { sql, params }
 *   断言 sql 字符串 toContain 关键片段
 *
 * 覆盖矩阵（6 case）：
 *   1. isPlatformTenant(0) → true
 *   2. isPlatformTenant(1) → false
 *   3. tenantEq(platform) → undefined（平台不加过滤）
 *   4. tenantEq(normal) → eq 条件
 *   5. tenantEq(normal) → SQL 含列名 + 参数值
 */

import { describe, expect, test } from "bun:test";
import { CasingCache } from "drizzle-orm/casing";
import { PgDialect } from "drizzle-orm/pg-core";
import { sysUser } from "@/db/schema/system/user";
import { isPlatformTenant, PLATFORM_TENANT_ID, tenantEq } from "../tenant";

/** 测试辅助：用 PgDialect 构造 BuildQueryConfig，把 SQL 片段转成 { sql, params } */
const renderSql = (fragment: {
	toQuery: (config: unknown) => { sql: string; params: unknown[] };
}): { sql: string; params: unknown[] } => {
	const dialect = new PgDialect();
	return fragment.toQuery({
		casing: new CasingCache(),
		escapeName: dialect.escapeName.bind(dialect),
		escapeParam: dialect.escapeParam.bind(dialect),
		escapeString: dialect.escapeString.bind(dialect),
	});
};

describe("isPlatformTenant", () => {
	test("1. 平台租户 ID(0) → true", () => {
		expect(isPlatformTenant(PLATFORM_TENANT_ID)).toBe(true);
	});

	test("2. 普通租户 ID(1) → false", () => {
		expect(isPlatformTenant(1)).toBe(false);
	});
});

describe("tenantEq", () => {
	test("3. 平台租户 → undefined（不加过滤）", () => {
		expect(tenantEq(sysUser.tenantId, PLATFORM_TENANT_ID)).toBeUndefined();
	});

	test("4. 普通租户 → 返回 eq 条件", () => {
		const result = tenantEq(sysUser.tenantId, 1);
		expect(result).toBeDefined();
		expect(result).not.toBeUndefined();
	});

	test("5. 普通租户 → SQL 含列名 + 参数值", () => {
		const fragment = tenantEq(sysUser.tenantId, 3);
		const { sql, params } = renderSql(
			fragment as {
				toQuery: (config: unknown) => { sql: string; params: unknown[] };
			},
		);
		expect(sql).toContain('"tenant_id"');
		expect(sql).toContain("= $1");
		expect(params).toEqual([3]);
	});
});
