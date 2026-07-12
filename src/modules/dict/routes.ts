import { Elysia } from "elysia";
import { db } from "@/db/client";
import { withCache } from "@/lib/cache";
import { BizError, ERR_CODE, notFound } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { broadcast } from "@/modules/sse/registry";
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

const parseDictItem = (item: DictItemResponseInput, dictCode: string) => {
	const parsed = DictItemResponse.parse(item);
	const { dictId, ...rest } = parsed;
	return { ...rest, id: String(parsed.id), dictCode };
};

/** 失效字典项缓存（写操作后调用） */
const invalidateDictCache = async (type: string): Promise<void> => {
	await redis.del(redisKeys.dictCache(type));
};

/** 广播字典变更，前端按 dictCode 失效本地缓存后重新拉取（broadcast 内部按连接隔离，不抛错） */
const broadcastDict = (dictCode: string): void => {
	broadcast("dict", { dictCode, timestamp: Date.now() });
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
		"/options",
		async () => {
			// 下拉框只返回启用项，避免前端出现已禁用的字典类型
			const dicts = await findDicts(
				{ status: 1, pageNum: 1, pageSize: 1000 },
				db,
			);
			return dicts.list.map((d) => ({ value: d.type, label: d.name }));
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			detail: {
				tags: ["Dict"],
				summary: "字典类型下拉列表",
				description: "返回所有启用字典类型，供前端下拉框使用",
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
	.get(
		"/:id/form",
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
				summary: "字典类型表单数据",
				description: "编辑字典类型时回填表单",
			},
		},
	)
	.post(
		"/",
		async ({ body }) => {
			// 前端传 dictCode，后端存 type；两者选其一即可
			const type = body.type ?? body.dictCode;
			if (!type) {
				throw new BizError(
					ERR_CODE.USER_REQUEST_PARAMETER_ERROR,
					"必须提供 type 或 dictCode",
				);
			}
			// 全局唯一性校验：type 不可重复
			const existing = await findDictByType(type, db);
			if (existing) {
				throw new BizError(ERR_CODE.DICT_TYPE_DUPLICATE);
			}
			const dict = await createDict(
				{ type, name: body.name, status: body.status, remark: body.remark },
				db,
			);
			broadcastDict(dict.type);
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

			// 前端传 dictCode，映射为后端 type 字段
			const updateData = {
				...body,
				...(body.dictCode ? { type: body.dictCode } : {}),
			};
			delete (updateData as Record<string, unknown>).dictCode;

			try {
				const dict = await updateDict(params.id, updateData, db);
				if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
				broadcastDict(dict.type);
				return parseDict(dict);
			} catch (e) {
				if ((e as Error).message === "DICT_TYPE_DUPLICATE") {
					throw new BizError(ERR_CODE.DICT_TYPE_DUPLICATE);
				}
				throw e;
			}
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
				description: "支持修改 name/status/dictCode，dictCode 全局唯一",
			},
		},
	)
	.delete(
		"/:id",
		async ({ params }) => {
			const idStr = String(params.id);
			// 前端批量删除传 "1,2,3"，单条传 "1"
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));

				if (ids.length === 0) {
					throw notFound(ERR_CODE.DICT_NOT_FOUND);
				}

				for (const id of ids) {
					const existing = await findDictById(id, db);
					if (!existing) throw notFound(ERR_CODE.DICT_NOT_FOUND);
					await softDeleteDict(id, db);
					await invalidateDictCache(existing.type);
					broadcastDict(existing.type);
				}
				return true;
			}

			const id = Number(idStr);
			if (Number.isNaN(id)) {
				throw notFound(ERR_CODE.DICT_NOT_FOUND);
			}
			const existing = await findDictById(id, db);
			if (!existing) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			await softDeleteDict(id, db);
			await invalidateDictCache(existing.type);
			broadcastDict(existing.type);
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
				description: "支持单条 ID 或逗号分隔的批量 ID，如 1 或 1,2,3",
			},
		},
	)
	// ── 字典项 CRUD（嵌套在 dictId 下） ──
	.get(
		"/:id/items",
		async ({ params, query }) => {
			const raw = params.id;
			// :id 双模式：纯数字走 ID 查询，非数字走 dictCode 查询
			const dict = /^\d+$/.test(raw)
				? await findDictById(Number(raw), db)
				: await findDictByType(raw, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			const result = await findDictItems(dict.id, query, db);
			return {
				list: result.list.map((item) => parseDictItem(item, dict.type)),
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
	.get(
		"/:id/items/options",
		async ({ params }) => {
			const raw = params.id;
			// :id 双模式：纯数字走 ID 查询，非数字走 dictCode 查询
			const dict = /^\d+$/.test(raw)
				? await findDictById(Number(raw), db)
				: await findDictByType(raw, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			const items = await findDictItems(
				dict.id,
				{ status: 1, pageNum: 1, pageSize: 9999 },
				db,
			);
			return items.list.map((item) => parseDictItem(item, dict.type));
		},
		{
			auth: true,
			requirePerm: ["sys:dict:list"],
			params: DictItemListParams,
			detail: {
				tags: ["Dict"],
				summary: "字典项下拉列表",
				description:
					"返回某个字典类型下的启用字典项，供前端下拉框使用，:id 支持数字 ID 或 dictCode",
			},
		},
	)
	.post(
		"/:id/items",
		async ({ params, body }) => {
			const raw = params.id;
			// :id 双模式：纯数字走 ID 查询，非数字走 dictCode 查询
			const dict = /^\d+$/.test(raw)
				? await findDictById(Number(raw), db)
				: await findDictByType(raw, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);

			// label 全局唯一校验（同一字典类型下）
			const dupLabel = await findDictItemByDictIdAndLabel(
				dict.id,
				body.label,
				db,
			);
			if (dupLabel) {
				throw new BizError(ERR_CODE.DICT_ITEM_LABEL_DUPLICATE);
			}
			// value 全局唯一校验（同一字典类型下）
			const dupValue = await findDictItemByDictIdAndValue(
				dict.id,
				body.value,
				db,
			);
			if (dupValue) {
				throw new BizError(ERR_CODE.DICT_ITEM_VALUE_DUPLICATE);
			}

			const item = await createDictItem(dict.id, body, db);
			await invalidateDictCache(dict.type);
			broadcastDict(dict.type);
			return parseDictItem(item, dict.type);
		},
		{
			auth: true,
			requirePerm: ["sys:dict:create"],
			audit: "dict:create-item",
			params: DictItemListParams,
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
			const dict = await findDictById(existing.dictId, db);
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			return parseDictItem(existing, dict.type);
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

			// 更新 label 时校验重复（排除自身）
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
			// 更新 value 时校验重复（排除自身）
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
			if (!dict) throw notFound(ERR_CODE.DICT_NOT_FOUND);
			await invalidateDictCache(dict.type);
			broadcastDict(dict.type);
			return parseDictItem(item, dict.type);
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
			const idStr = String(params.itemId);
			// 前端批量删除传 "1,2,3"，单条传 "1"
			if (idStr.includes(",")) {
				const ids = idStr
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => !Number.isNaN(n));

				if (ids.length === 0) {
					throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
				}

				for (const itemId of ids) {
					const existing = await findDictItemById(itemId, db);
					if (!existing) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
					await softDeleteDictItem(itemId, db);
					const dict = await findDictById(existing.dictId, db);
					if (dict) {
						await invalidateDictCache(dict.type);
						broadcastDict(dict.type);
					}
				}
				return true;
			}

			const itemId = Number(idStr);
			if (Number.isNaN(itemId)) {
				throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
			}
			const existing = await findDictItemById(itemId, db);
			if (!existing) throw notFound(ERR_CODE.DICT_ITEM_NOT_FOUND);
			await softDeleteDictItem(itemId, db);
			const dict = await findDictById(existing.dictId, db);
			if (dict) {
				await invalidateDictCache(dict.type);
				broadcastDict(dict.type);
			}
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
				description: "支持单条 ID 或逗号分隔的批量 ID，如 1 或 1,2,3",
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
				return items.list.map((item) => parseDictItem(item, dict.type));
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
