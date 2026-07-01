import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { sysIpBlacklist } from "@/db/schema/system/ip-blacklist";
import { createListQuery } from "@/lib/crud-dto";

/** IP 黑名单列表查询参数 */
export const IpBlacklistListQuery = createListQuery(sysIpBlacklist, {
	ip: z.string().optional().describe("IP 地址（模糊匹配）"),
}).describe("IP 黑名单列表查询参数");

/** IP 黑名单响应 */
export const IpBlacklistResponse = createSelectSchema(sysIpBlacklist)
	.omit({
		createdBy: true,
		updatedBy: true,
		updateTime: true,
	})
	.describe("IP 黑名单信息");

/** IP 黑名单入参 */
export const IpBlacklistParamsWithId = z
	.object({ id: z.coerce.number() })
	.describe("黑名单 ID");
