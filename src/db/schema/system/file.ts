import { auditColumns } from "@db/schema/_shared";
import { bigint, index, integer, pgTable, varchar } from "drizzle-orm/pg-core";

/**
 * 系统文件元数据表
 *
 * 设计要点：
 * - 只存元数据，不存文件本身（文件在 storage 侧）
 * - url 冗余存储：前端删除时传完整 url，后端按 url 反查拿 key
 * - 完整复用 auditColumns（文件元数据可改：能重命名、能关联），走软删
 *
 * 物理删除 vs 软删：
 * - DB 行：软删（auditColumns.deleteTime）
 * - 存储侧对象：物理删除（不可恢复，也无必要恢复）
 */
export const sysFile = pgTable(
	"sys_file",
	{
		/** 主键 ID */
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),

		/** 存储键（storage 侧的主键），格式 {date}/{uuid}.{ext} */
		key: varchar("key", { length: 255 }).notNull(),
		/** 原始文件名（前端传的 file.name） */
		filename: varchar("filename", { length: 255 }).notNull(),
		/** 文件大小（字节） */
		size: integer("size").notNull(),
		/** MIME 类型 */
		mimeType: varchar("mime_type", { length: 128 }),
		/** 永久可访问的 URL（冗余存储，用于反查删除） */
		url: varchar("url", { length: 512 }).notNull(),

		/** 上传者 ID（从 ctx.user.userId 取） */
		uploaderId: bigint("uploader_id", { mode: "number" }),

		...auditColumns,
	},
	(table) => ({
		/** 按 url 反查（删除接口用，前端传 url 不传 key） */
		urlIdx: index("idx_sys_file_url").on(table.url),
	}),
);
