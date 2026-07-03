import type { sysRole } from "@/db/schema/system/role";

/** 用户角色元素：供 JWT payload 注入 roles / dataScopes */
export type UserRoleItem = {
  code: typeof sysRole.$inferSelect.code;
  dataScope: typeof sysRole.$inferSelect.dataScope;
};
