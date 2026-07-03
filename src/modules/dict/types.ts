import type { sysDict } from "@/db/schema/system/dict";
import type { sysDictItem } from "@/db/schema/system/dict-item";

/** sys_dict 表原始记录类型 */
export type DictRecord = typeof sysDict.$inferSelect;

/** sys_dict_item 表原始记录类型 */
export type DictItemRecord = typeof sysDictItem.$inferSelect;
