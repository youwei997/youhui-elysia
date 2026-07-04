import { Elysia } from "elysia";
import { db } from "@/db/client";
import { withCache } from "@/lib/cache";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { authPlugin } from "@/plugins/auth";
import {
	createDict,
	createDictItem,
	findDictById,
	findDictByType,
	findDictItemByDictIdAndLabel,
	findDictItemByDictIdAndValue,
	findDictItemById,
	findDictItems,
	findDicts,
	softDeleteDict,
	softDeleteDictItem,
	updateDict,
	updateDictItem,
} from "./queries";
import {
	DictCreateBody,
	DictItemCreateBody,
	DictItemListParams,
	DictItemListQuery,
	DictItemParamsWithId,
	DictItemResponse,
	type DictItemResponseInput,
	DictItemUpdateBody,
	DictListQuery,
	DictParamsWithId,
	DictResponse,
	type DictResponseInput,
	DictTypeParam,
	DictUpdateBody,
} from "./schema";

/** 响应转换：parse + id 转 string + 字段名对齐前端（type → dictCode） */
const parseDict = (dict: DictResponseInput) => {
	const parsed = DictResponse.parse(dict);
	const { type, ...rest } = parsed;
	return { ...rest, dictCode: type, id: String(parsed.id) };
};

const parseDictItem = (item: DictItemResponseInput) => {
	const parsed = DictItemResponse.parse(item);
	return { ...parsed, id: String(parsed.id), dictId: String(parsed.dictId) };
};

/** 失效字典项缓存（写操作后调用） */
const invalidateDictCache = async (type: string): Promise<void> => {
	await redis.del(redisKeys.dictCache(type));
};

export const dictRoutes = new Elysia({ prefix: "/api/v1/dicts" })
	.use(authPlugin)
	// ── 字典类型 CRUD ──
	.get(
		"/",
		async ({ query }) => {
			const result = await findDicts(query, db);
			return {
				...result,
				list: result.list.map((d) => parseDict(d)),
			};
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			query: DictListQuery,
			detail: {
				tags: ["Dict"],
				summary: "字典类型列表（分页）",
				description: "支持 keywords 模糊搜索和 status 筛选",
			},
		},
	)
	.get(
		"/:id",
		async ({ params }) => {
			const dict = await findDictById(params.id, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			return parseDict(dict);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			params: DictParamsWithId,
			detail: {
				tags: ["Dict"],
				summary: "字典类型详情",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			const type = body.type ?? body.dictCode;
			if (!type) {
				throw new BizError(
					ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
					"必须提供 type 或 dictCode",
				);
			}
			const existing = await findDictByType(type, db);
			if (existing) {
				throw new BizError(ERR_CODE.DICT_TYPE_DUPLICATE);
			}
			const dict = await createDict(
				{ type, name: body.name, status: body.status },
				db,
			);
			return parseDict(dict);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:create"],
			audit: "dict:create",
			body: DictCreateBody,
			detail: {
				tags: ["Dict"],
				summary: "创建字典类型",
				description: "type/dictCode 全局唯一，不可重复",
			},
		},
	)
	.put(
		"/:id",
		async ({ params, body }) => {
			const existing = await findDictById(params.id, db);
			if (!existing) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			const dict = await updateDict(params.id, body, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			return parseDict(dict);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:update"],
			audit: "dict:update",
			params: DictParamsWithId,
			body: DictUpdateBody,
			detail: {
				tags: ["Dict"],
				summary: "更新字典类型",
				description: "type 不可修改，仅支持 name/status",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const existing = await findDictById(params.id, db);
			if (!existing) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			await softDeleteDict(params.id, db);
			await invalidateDictCache(existing.type);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:dict:delete"],
			audit: "dict:delete",
			params: DictParamsWithId,
			detail: {
				tags: ["Dict"],
				summary: "删除字典类型（级联软删字典项）",
			},
		},
	)
	// ── 字典项 CRUD（嵌套在 dictId 下） ──
	.get(
		"/:id/items",
		async ({ params, query }) => {
			const raw = params.id;
			let dictId: number;
			if (/^\d+$/.test(raw)) {
				const dict = await findDictById(Number(raw), db);
				if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
				dictId = dict.id;
			} else {
				const dict = await findDictByType(raw, db);
				if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
				dictId = dict.id;
			}
			const result = await findDictItems(dictId, query, db);
			return {
				list: result.list.map((item) => parseDictItem(item)),
				total: result.total,
			};
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			params: DictItemListParams,
			query: DictItemListQuery,
			detail: {
				tags: ["Dict"],
				summary: "字典项列表（分页）",
				description:
					"查询某个字典类型下的所有字典项，:id 支持数字 ID 或 dictCode",
			},
		},
	)
	.post(
		"/:id/items",
		async ({ params, body }) => {
			const dict = await findDictById(params.id, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);

			const dupLabel = await findDictItemByDictIdAndLabel(
				params.id,
				body.label,
				db,
			);
			if (dupLabel) {
				throw new BizError(ERR_CODE.DICT_ITEM_LABEL_DUPLICATE);
			}
			const dupValue = await findDictItemByDictIdAndValue(
				params.id,
				body.value,
				db,
			);
			if (dupValue) {
				throw new BizError(ERR_CODE.DICT_ITEM_VALUE_DUPLICATE);
			}

			const item = await createDictItem(params.id, body, db);
			await invalidateDictCache(dict.type);
			return parseDictItem(item);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:create"],
			audit: "dict:create-item",
			params: DictParamsWithId,
			body: DictItemCreateBody,
			detail: {
				tags: ["Dict"],
				summary: "新增字典项",
				description: "同一字典类型下 label 和 value 分别唯一",
			},
		},
	)
	.get(
		"/:id/items/:itemId/form",
		async ({ params }) => {
			const existing = await findDictItemById(params.itemId, db);
			if (!existing) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
			return parseDictItem(existing);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			params: DictItemParamsWithId,
			detail: {
				tags: ["Dict"],
				summary: "字典项表单数据",
				description: "编辑字典项时回填表单，:id 支持数字 ID 或 dictCode",
			},
		},
	)
	.put(
		"/:id/items/:itemId",
		async ({ params, body }) => {
			const existing = await findDictItemById(params.itemId, db);
			if (!existing) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);

			if (body.label) {
				const dupLabel = await findDictItemByDictIdAndLabel(
					existing.dictId,
					body.label,
					db,
				);
				if (dupLabel && dupLabel.id !== params.itemId) {
					throw new BizError(ERR_CODE.DICT_ITEM_LABEL_DUPLICATE);
				}
			}
			if (body.value) {
				const dupValue = await findDictItemByDictIdAndValue(
					existing.dictId,
					body.value,
					db,
				);
				if (dupValue && dupValue.id !== params.itemId) {
					throw new BizError(ERR_CODE.DICT_ITEM_VALUE_DUPLICATE);
				}
			}

			const item = await updateDictItem(params.itemId, body, db);
			if (!item) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
			const dict = await findDictById(existing.dictId, db);
			if (dict) await invalidateDictCache(dict.type);
			return parseDictItem(item);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:update"],
			audit: "dict:update-item",
			params: DictItemParamsWithId,
			body: DictItemUpdateBody,
			detail: {
				tags: ["Dict"],
				summary: "更新字典项",
			},
		},
	)
	.delete(
		"/:id/items/:itemId",
		async ({ params }) => {
			const existing = await findDictItemById(params.itemId, db);
			if (!existing) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
			await softDeleteDictItem(params.itemId, db);
			const dict = await findDictById(existing.dictId, db);
			if (dict) await invalidateDictCache(dict.type);
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:dict:delete"],
			audit: "dict:delete-item",
			params: DictItemParamsWithId,
			detail: {
				tags: ["Dict"],
				summary: "删除字典项（软删）",
			},
		},
	)
	// ── 字典项：按 type 查询（前端高频，无需权限，仅返回启用项） ──
	.get(
		"/by-type/:type/items",
		async ({ params }) => {
			return withCache(redisKeys.dictCache(params.type), 600, async () => {
				const dict = await findDictByType(params.type, db);
				if (!dict) return [];
				const items = await findDictItems(
					dict.id,
					{ status: 1, pageNum: 1, pageSize: 9999 },
					db,
				);
				return items.list.map((item) => parseDictItem(item));
			});
		},
		{
			detail: {
				tags: ["Dict"],
				summary: "按字典类型获取字典项",
				description: "供前端下拉框/级联选择器使用，无需权限，仅返回启用项",
				security: [],
			},
			params: DictTypeParam,
		},
	);
