import { Elysia } from "elysia";
import { db } from "@/db/client";
import { BizError, ERR_CODE, unauthorized } from "@/lib/errors";
import type { JwtPayload } from "@/lib/jwt";
import { signAccessToken, signRefreshToken } from "@/lib/jwt";
import { authPlugin } from "@/plugins/auth";
import {
	createTenant,
	deleteTenants,
	findActiveTenantById,
	findTenantById,
	findTenantMenuIds,
	findTenantOptions,
	findTenants,
	updateTenant,
	updateTenantMenus,
	updateTenantStatus,
} from "./queries";
import {
	TenantCreateBody,
	TenantListQuery,
	TenantMenusBody,
	TenantParamsWithCommaIds,
	TenantParamsWithId,
	TenantResponse,
	type TenantResponseInput,
	TenantStatusBody,
	TenantUpdateBody,
} from "./schema";

/** 响应转换：parse + bigint id 转 string */
const parseTenant = (row: TenantResponseInput) => {
	const parsed = TenantResponse.parse(row);
	return {
		...parsed,
		id: String(parsed.id),
		planId: parsed.planId == null ? null : String(parsed.planId),
	};
};

export const tenantRoutes = new Elysia({ prefix: "/api/v1/tenants" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query, user }) => {
			if (!user) throw unauthorized();
			const result = await findTenants(query, db);
			return {
				...result,
				list: result.list.map((t) => parseTenant(t)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:list"],
			query: TenantListQuery,
			detail: {
				tags: ["Tenant"],
				summary: "租户列表（分页）",
				description: "支持关键字搜索（名称/编码）和状态筛选",
			},
		},
	)
	.get(
		"/options",
		async ({ user }) => {
			if (!user) throw unauthorized();
			const options = await findTenantOptions(user.tenantId, db);
			return options;
		},
		{
			auth: true,
			detail: {
				tags: ["Tenant"],
				summary: "租户选项列表",
				description: "用于切换租户下拉，平台租户返回全量，普通租户只返回自身",
			},
		},
	)
	.get(
		"/current",
		async ({ user }) => {
			if (!user) throw unauthorized();
			const tenant = await findTenantById(user.tenantId, db);
			if (!tenant) throw unauthorized();
			return parseTenant(tenant);
		},
		{
			auth: true,
			detail: {
				tags: ["Tenant"],
				summary: "当前租户信息",
				description: "返回当前用户所属租户的详细信息",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const tenant = await findTenantById(params.id, db);
			if (!tenant) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			return parseTenant(tenant);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:update"],
			params: TenantParamsWithId,
			detail: {
				tags: ["Tenant"],
				summary: "租户表单数据",
				description: "编辑租户时回填表单",
			},
		},
	)
	.get(
		"/:id/menuIds",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const menuIds = await findTenantMenuIds(params.id, db);
			return { menuIds };
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:plan-assign"],
			params: TenantParamsWithId,
			detail: {
				tags: ["Tenant"],
				summary: "租户已授权菜单 ID 列表",
				description: "用于租户菜单配置页回显",
			},
		},
	)
	.post(
		"/",
		async ({ body, user }) => {
			if (!user) throw unauthorized();
			const { adminUsername, adminPassword, ...rest } = body;
			const result = await createTenant(
				{ ...rest, adminUsername, adminPassword } as {
					name: string;
					code: string;
					contactName?: string;
					contactPhone?: string;
					contactEmail?: string;
					domain?: string;
					logo?: string;
					planId?: number;
					remark?: string;
					expireTime?: string;
					adminUsername: string;
					adminPassword: string;
				},
				db,
			);
			return result;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:create"],
			audit: "tenant:create",
			body: TenantCreateBody,
			detail: {
				tags: ["Tenant"],
				summary: "创建租户",
				description: "创建租户并初始化管理员用户、角色和默认菜单",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findTenantById(params.id, db);
			if (!existing) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			const updateData = Object.fromEntries(
				Object.entries(body).filter(([, v]) => v !== undefined && v !== null),
			) as Record<string, unknown>;
			const tenant = await updateTenant(params.id, updateData, db);
			if (!tenant) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			return parseTenant(tenant);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:update"],
			audit: "tenant:update",
			params: TenantParamsWithId,
			body: TenantUpdateBody,
			detail: {
				tags: ["Tenant"],
				summary: "更新租户",
				description: "更新租户基本信息",
			},
		},
	)
	.put(
		"/:id/menus",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findTenantById(params.id, db);
			if (!existing) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			await updateTenantMenus(params.id, body, db);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:plan-assign"],
			audit: "tenant:plan-assign",
			params: TenantParamsWithId,
			body: TenantMenusBody,
			detail: {
				tags: ["Tenant"],
				summary: "更新租户菜单授权",
				description: "菜单 ID 必须在套餐菜单范围内",
			},
		},
	)
	.put(
		"/:id/status",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findTenantById(params.id, db);
			if (!existing) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			const tenant = await updateTenantStatus(params.id, body.status, db);
			if (!tenant) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			return parseTenant(tenant);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:change-status"],
			audit: "tenant:change-status",
			params: TenantParamsWithId,
			body: TenantStatusBody,
			detail: {
				tags: ["Tenant"],
				summary: "更新租户状态",
				description: "启用/停用租户，平台租户不可停用",
			},
		},
	)
	.put(
		"/:id/switch",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const targetId = Number(params.id);
			// 平台超管可切换到任何活跃租户
			if (user.tenantId !== targetId && !user.roles.includes("ROOT")) {
				throw new BizError(ERR_CODE.ACCESS_UNAUTHORIZED);
			}
			const targetTenant = await findActiveTenantById(targetId, db);
			if (!targetTenant) {
				throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			}
			// 重新签发 token（新 tenantId，其余字段不变）
			const payload: JwtPayload = {
				...user,
				tenantId: targetId,
			};
			return {
				accessToken: signAccessToken(payload),
				refreshToken: signRefreshToken(payload),
				tokenType: "Bearer",
				expiresIn: Number(process.env.ACCESS_TOKEN_EXPIRES_IN) || 3600,
			};
		},
		{
			auth: true,
			detail: {
				tags: ["Tenant"],
				summary: "切换租户",
				description: "平台超管可切换数据视图租户，重新签发 token",
			},
		},
	)
	.delete(
		"/:ids",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const ids = params.ids.split(",").map(Number);
			const deleted = await deleteTenants(ids, db);
			if (deleted === 0) throw new BizError(ERR_CODE.TENANT_NOT_FOUND);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant:delete"],
			audit: "tenant:delete",
			params: TenantParamsWithCommaIds,
			detail: {
				tags: ["Tenant"],
				summary: "删除租户",
				description: "硬删除租户及关联数据，平台租户不可删除",
			},
		},
	);
