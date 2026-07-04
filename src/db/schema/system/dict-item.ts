import { auditColumns } from "@db/schema/_shared";
import {
	bigint,
	index,
	integer,
	pgTable,
	smallint,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";

/**
 * 系统字典项表
 *
 * 每个字典类型下可有多个字典项，如 gender 下有 { label: "男", value: "1" }。
 * 同一字典类型下 label 和 value 分别唯一，sort 控制排序。
 */
export const sysDictItem = pgTable(
	"sys_dict_item",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

		/** 所属字典类型 ID（关联 sys_dict.id） */
		dictId: bigint("dict_id", { mode: "number" }).notNull(),
		/** 字典项标签（如 "男"、"女"） */
		label: varchar("label", { length: 128 }).notNull(),
		/** 字典项值（如 "1"、"2"） */
		value: varchar("value", { length: 128 }).notNull(),
		/** 排序号（越小越靠前） */
		sort: integer("sort").default(0).notNull(),
		/** 状态：1-启用 0-禁用 */
		status: smallint("status").default(1).notNull(),
		/** 标签类型：前端 tag 颜色，N(文本)/P(primary)/S(success)/W(warning)/I(info)/D(danger) */
		tagType: varchar("tag_type", { length: 8 }).default("N").notNull(),

		...auditColumns,
	},
	(table) => ({
		/** 按 dictId 查询所有字典项 */
		dictIdIdx: index("idx_dict_item_dict_id").on(table.dictId),
		/** 按 dictId + label 唯一（同一字典类型下 label 不能重复） */
		dictIdLabelUnique: uniqueIndex("uniq_dict_item_dict_id_label").on(
			table.dictId,
			table.label,
		),
		/** 按 dictId + value 唯一（同一字典类型下 value 不能重复） */
		dictIdValueUnique: uniqueIndex("uniq_dict_item_dict_id_value").on(
			table.dictId,
			table.value,
		),
	}),
);
