import { db } from "@/db/client";
import { sysUser } from "@/db/schema/system/user";

/**
 * bcrypt 哈希密码（明文：123456）
 * 后续阶段 3 接入 auth 模块后，可通过登录接口验证
 */
const DEFAULT_PASSWORD =
  "$2a$10$xVWsNOhHrCxh5UbpCE7/HuJ.PAOKcYAqRxD2CO2nVnJS.IAXkr5aq";

async function main() {
  console.log("🌱 开始写入种子数据...");

  // 清空表数据
  await db.delete(sysUser);

  // 插入用户
  await db.insert(sysUser).values([
    {
      id: 1,
      username: "root",
      nickname: "有来技术",
      gender: 0,
      password: DEFAULT_PASSWORD,
      deptId: null,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345677",
      status: 1,
      email: "youlaitech@163.com",
    },
    {
      id: 2,
      username: "admin",
      nickname: "系统管理员",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 1,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18888888888",
      status: 1,
      email: "youlaitech@163.com",
    },
    {
      id: 3,
      username: "test",
      nickname: "测试小用户",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 3,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345679",
      status: 1,
      email: "youlaitech@163.com",
    },
    {
      id: 4,
      username: "dept_manager",
      nickname: "部门主管",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 1,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345680",
      status: 1,
      email: "manager@youlaitech.com",
    },
    {
      id: 5,
      username: "dept_member",
      nickname: "部门成员",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 1,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345681",
      status: 1,
      email: "member@youlaitech.com",
    },
    {
      id: 6,
      username: "employee",
      nickname: "普通员工",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 2,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345682",
      status: 1,
      email: "employee@youlaitech.com",
    },
    {
      id: 7,
      username: "custom_user",
      nickname: "自定义权限用户",
      gender: 1,
      password: DEFAULT_PASSWORD,
      deptId: 3,
      avatar:
        "https://foruda.gitee.com/images/1723603502796844527/03cdca2a_716974.gif",
      mobile: "18812345683",
      status: 1,
      email: "custom@youlaitech.com",
    },
  ]);

  console.log("✅ 种子数据写入完成：7 个用户");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 种子数据写入失败:", err);
  process.exit(1);
});