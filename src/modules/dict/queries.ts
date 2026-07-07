import { and, asc, count, eq, isNull, like, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { escapeLike } from "@/db/helpers/like";
import { sysDict } from "@/db/schema/system/dict";
import { sysDictItem } from "@/db/schema/system/dict-item";
import type { PageResult } from "@/lib/pagination";
import type { DictItemRecord, DictRecord } from "./types";

// ── 字典类型 ──

/**
 * 字典类型列表查询（分页，软删过滤，keywords 模糊匹配 type/name，支持 status 筛选）
 */
export const findDicts = async (
	query: {
		pageNum: number;
		pageSize: number;
		keywords?: string;
		status?: number;
	},
	db: DB,
): Promise<PageResult<DictRecord>> => {
	// 默认过滤已软删记录（§4.10 软删过滤规则）
	const where = [isNull(sysDict.deleteTime)];

	if (query.keywords) {
		// keywords 非空时 escapeLike 必有输出，or() 实际恒真
		// guard 仅为了满足 TS 类型（or() 返回 SQL | undefined）
		const kwCond = or(
			like(sysDict.type, `%${escapeLike(query.keywords)}%`),
			like(sysDict.name, `%${escapeLike(query.keywords)}%`),
		);
		if (kwCond) where.push(kwCond);
	}
	// 用 !== undefined 而非 truthy，因为 status=0（禁用）是合法值
	if (query.status !== undefined) {
		where.push(eq(sysDict.status, query.status));
	}

	// where 为空时传 undefined，Drizzle 会跳过 WHERE 子句
	const whereClause = and(...where);

	const list = await db
		.select()
		.from(sysDict)
		.where(whereClause)
		.orderBy(asc(sysDict.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysDict)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查字典类型（软删过滤）
 */
export const findDictById = async (
	id: number,
	db: DB,
): Promise<DictRecord | undefined> => {
	const [dict] = await db
		.select()
		.from(sysDict)
		.where(and(eq(sysDict.id, id), isNull(sysDict.deleteTime)));
	return dict;
};

/**
 * 按 type 查字典类型（软删过滤）
 *
 * type 字段同时承担后端存储键和前端 dictCode 语义，全局唯一。
 */
export const findDictByType = async (
	type: string,
	db: DB,
): Promise<DictRecord | undefined> => {
	const [dict] = await db
		.select()
		.from(sysDict)
		.where(and(eq(sysDict.type, type), isNull(sysDict.deleteTime)));
	return dict;
};

/**
 * 新增字典类型（INSERT ... RETURNING，返回值非空）
 */
export const createDict = async (
	data: {
		type: string;
		name: string;
		status: number;
		remark?: string | undefined;
	},
	db: DB,
): Promise<DictRecord> => {
	const [dict] = await db.insert(sysDict).values(data).returning();
	return dict as DictRecord;
};

/**
 * 更新字典类型（type 变更时先校验唯一性，抛 "DICT_TYPE_DUPLICATE"）
 */
export const updateDict = async (
	id: number,
	data: {
		name?: string | undefined;
		status?: number | undefined;
		type?: string | undefined;
	},
	db: DB,
): Promise<DictRecord | undefined> => {
	// 如果要修改 type，需检查新值是否已被其他记录占用
	if (data.type) {
		const existing = await findDictByType(data.type, db);
		if (existing && existing.id !== id) {
			throw new Error("DICT_TYPE_DUPLICATE");
		}
	}

	const [dict] = await db
		.update(sysDict)
		.set(data)
		.where(and(eq(sysDict.id, id), isNull(sysDict.deleteTime)))
		.returning();
	return dict as DictRecord | undefined;
};

/**
 * 软删字典类型（级联软删关联的字典项）
 *
 * ponytail: 当前直接级联软删所有字典项，不检查是否有字典项被前端引用。
 * 如果前端下拉框/级联选择器在大缓存 + 延时刷新的场景下读取已被软删的字典项，
 * 可能因引用丢失而渲染异常。后续升级方向：
 *   - 软删前检查字典项是否被业务数据引用（如用户表的 gender 字段）
 *   - 或改用"标记禁用 + 异步清理"策略
 */
export const softDeleteDict = async (id: number, db: DB): Promise<boolean> => {
	// 事务保证：先删字典项再删字典类型，避免 FK 约束或级联不一致
	await db.transaction(async (tx) => {
		const now = new Date().toISOString();
		await tx
			.update(sysDictItem)
			.set({ deleteTime: now })
			.where(and(eq(sysDictItem.dictId, id), isNull(sysDictItem.deleteTime)));
		await tx
			.update(sysDict)
			.set({ deleteTime: now })
			.where(and(eq(sysDict.id, id), isNull(sysDict.deleteTime)));
	});
	return true;
};

// ── 字典项 ──

/**
 * 字典项列表查询（分页，软删过滤，keywords 模糊匹配 label/value，支持 status 筛选）
 */
export const findDictItems = async (
	dictId: number,
	query: {
		keywords?: string | undefined;
		status?: number | undefined;
		pageNum: number;
		pageSize: number;
	},
	db: DB,
): Promise<PageResult<DictItemRecord>> => {
	const where = [
		eq(sysDictItem.dictId, dictId),
		isNull(sysDictItem.deleteTime),
	];

	if (query.keywords) {
		// keywords 非空时 escapeLike 必有输出，or() 实际恒真
		// guard 仅为了满足 TS 类型（or() 返回 SQL | undefined）
		const kwCond = or(
			like(sysDictItem.label, `%${escapeLike(query.keywords)}%`),
			like(sysDictItem.value, `%${escapeLike(query.keywords)}%`),
		);
		if (kwCond) where.push(kwCond);
	}
	// 用 !== undefined 而非 truthy，因为 status=0（禁用）是合法值
	if (query.status !== undefined) {
		where.push(eq(sysDictItem.status, query.status));
	}

	// where 为空时传 undefined，Drizzle 会跳过 WHERE 子句
	const whereClause = and(...where);

	const list = await db
		.select()
		.from(sysDictItem)
		.where(whereClause)
		.orderBy(asc(sysDictItem.sort), asc(sysDictItem.id))
		.limit(query.pageSize)
		.offset((query.pageNum - 1) * query.pageSize);

	const [{ total = 0 } = {}] = await db
		.select({ total: count() })
		.from(sysDictItem)
		.where(whereClause);

	return { list, total };
};

/**
 * 按 ID 查字典项（用于详情查询、编辑回填、删除前校验）
 */
export const findDictItemById = async (
	id: number,
	db: DB,
): Promise<DictItemRecord | undefined> => {
	const [item] = await db
		.select()
		.from(sysDictItem)
		.where(and(eq(sysDictItem.id, id), isNull(sysDictItem.deleteTime)));
	return item;
};

/**
 * 新增字典项（INSERT ... RETURNING，返回值非空）
 */
export const createDictItem = async (
	dictId: number,
	data: {
		label: string;
		value: string;
		sort: number;
		status: number;
		tagType: string;
	},
	db: DB,
): Promise<DictItemRecord> => {
	const [item] = await db
		.insert(sysDictItem)
		.values({ ...data, dictId })
		.returning();
	return item as DictItemRecord;
};

/**
 * 更新字典项（调用方保证不传入 deleteTime 等受保护字段）
 */
export const updateDictItem = async (
	id: number,
	data: {
		label?: string | undefined;
		value?: string | undefined;
		sort?: number | undefined;
		status?: number | undefined;
		tagType?: string | undefined;
	},
	db: DB,
): Promise<DictItemRecord | undefined> => {
	const [item] = await db
		.update(sysDictItem)
		.set(data)
		.where(and(eq(sysDictItem.id, id), isNull(sysDictItem.deleteTime)))
		.returning();
	return item;
};

/**
 * 软删字典项
 *
 * 返回是否实际删除了记录（false 表示记录不存在或已被软删）。
 */
export const softDeleteDictItem = async (
	id: number,
	db: DB,
): Promise<boolean> => {
	const result = await db
		.update(sysDictItem)
		.set({ deleteTime: new Date().toISOString() })
		.where(and(eq(sysDictItem.id, id), isNull(sysDictItem.deleteTime)))
		.returning({ id: sysDictItem.id });
	return result.length > 0;
};

/**
 * 按 dictId + label 查字典项（用于校验 label 重复）
 */
export const findDictItemByDictIdAndLabel = async (
	dictId: number,
	label: string,
	db: DB,
): Promise<DictItemRecord | undefined> => {
	const [item] = await db
		.select()
		.from(sysDictItem)
		.where(
			and(
				eq(sysDictItem.dictId, dictId),
				eq(sysDictItem.label, label),
				isNull(sysDictItem.deleteTime),
			),
		);
	return item;
};

/**
 * 按 dictId + value 查字典项（用于校验 value 重复）
 */
export const findDictItemByDictIdAndValue = async (
	dictId: number,
	value: string,
	db: DB,
): Promise<DictItemRecord | undefined> => {
	const [item] = await db
		.select()
		.from(sysDictItem)
		.where(
			and(
				eq(sysDictItem.dictId, dictId),
				eq(sysDictItem.value, value),
				isNull(sysDictItem.deleteTime),
			),
		);
	return item;
};
