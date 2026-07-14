import { Elysia } from "elysia";
import { db } from "@/db/client";
import { BizError, ERR_CODE, unauthorized } from "@/lib/errors";
import { authPlugin } from "@/plugins/auth";
import {
	createTenantPlan,
	deleteTenantPlans,
	findTenantPlanById,
	findTenantPlanMenuIds,
	findTenantPlanOptions,
	findTenantPlans,
	updateTenantPlan,
	updateTenantPlanMenus,
} from "./queries";
import {
	TenantPlanCreateBody,
	TenantPlanListQuery,
	TenantPlanMenusBody,
	TenantPlanParamsWithCommaIds,
	TenantPlanParamsWithId,
	TenantPlanResponse,
	type TenantPlanResponseInput,
	TenantPlanUpdateBody,
} from "./schema";

/** 响应转换：parse + bigint id 转 string */
const parseTenantPlan = (row: TenantPlanResponseInput) => {
	const parsed = TenantPlanResponse.parse(row);
	return {
		...parsed,
		id: String(parsed.id),
	};
};

export const tenantPlanRoutes = new Elysia({ prefix: "/api/v1/tenant-plans" })
	.use(authPlugin)
	.get(
		"/",
		async ({ query, user }) => {
			if (!user) throw unauthorized();
			const result = await findTenantPlans(query, db);
			return {
				...result,
				list: result.list.map((p) => parseTenantPlan(p)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:list"],
			query: TenantPlanListQuery,
			detail: {
				tags: ["TenantPlan"],
				summary: "套餐列表（分页）",
				description: "支持关键字搜索（名称/编码）和状态筛选",
			},
		},
	)
	.get(
		"/options",
		async ({ user }) => {
			if (!user) throw unauthorized();
			const options = await findTenantPlanOptions(db);
			return options;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:list"],
			detail: {
				tags: ["TenantPlan"],
				summary: "套餐选项列表",
				description: "用于租户编辑页套餐下拉",
			},
		},
	)
	.get(
		"/:id/form",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const plan = await findTenantPlanById(params.id, db);
			if (!plan) throw new BizError(ERR_CODE.TENANT_PLAN_NOT_FOUND);
			return parseTenantPlan(plan);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:update"],
			params: TenantPlanParamsWithId,
			detail: {
				tags: ["TenantPlan"],
				summary: "套餐表单数据",
				description: "编辑套餐时回填表单",
			},
		},
	)
	.get(
		"/:id/menuIds",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const menuIds = await findTenantPlanMenuIds(params.id, db);
			return { menuIds };
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:assign"],
			params: TenantPlanParamsWithId,
			detail: {
				tags: ["TenantPlan"],
				summary: "套餐已授权菜单 ID 列表",
				description: "用于套餐菜单配置页回显",
			},
		},
	)
	.post(
		"/",
		async ({ body, user }) => {
			if (!user) throw unauthorized();
			const plan = await createTenantPlan(
				body as {
					name: string;
					code: string;
					status: number;
					sort: number | null;
					remark?: string | null;
				},
				db,
			);
			return parseTenantPlan(plan);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:create"],
			audit: "tenant-plan:create",
			body: TenantPlanCreateBody,
			detail: {
				tags: ["TenantPlan"],
				summary: "创建套餐",
				description: "创建租户套餐",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findTenantPlanById(params.id, db);
			if (!existing) throw new BizError(ERR_CODE.TENANT_PLAN_NOT_FOUND);
			const updateData = Object.fromEntries(
				Object.entries(body).filter(([, v]) => v !== undefined && v !== null),
			) as Record<string, unknown>;
			const plan = await updateTenantPlan(params.id, updateData, db);
			if (!plan) throw new BizError(ERR_CODE.TENANT_PLAN_NOT_FOUND);
			return parseTenantPlan(plan);
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:update"],
			audit: "tenant-plan:update",
			params: TenantPlanParamsWithId,
			body: TenantPlanUpdateBody,
			detail: {
				tags: ["TenantPlan"],
				summary: "更新套餐",
				description: "更新套餐基本信息",
			},
		},
	)
	.put(
		"/:id/menus",
		async ({ params, body, user }) => {
			if (!user) throw unauthorized();
			const existing = await findTenantPlanById(params.id, db);
			if (!existing) throw new BizError(ERR_CODE.TENANT_PLAN_NOT_FOUND);
			await updateTenantPlanMenus(params.id, body, db);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:assign"],
			audit: "tenant-plan:assign",
			params: TenantPlanParamsWithId,
			body: TenantPlanMenusBody,
			detail: {
				tags: ["TenantPlan"],
				summary: "更新套餐菜单授权",
				description: "菜单必须为业务菜单（scope=2）",
			},
		},
	)
	.delete(
		"/:ids",
		async ({ params, user }) => {
			if (!user) throw unauthorized();
			const ids = params.ids.split(",").map(Number);
			const deleted = await deleteTenantPlans(ids, db);
			if (deleted === 0) throw new BizError(ERR_CODE.TENANT_PLAN_NOT_FOUND);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:tenant-plan:delete"],
			audit: "tenant-plan:delete",
			params: TenantPlanParamsWithCommaIds,
			detail: {
				tags: ["TenantPlan"],
				summary: "删除套餐",
				description: "硬删除套餐及关联菜单",
			},
		},
	);
