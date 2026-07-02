import { Elysia, t } from "elysia";
import { incrementTokenVersion } from "@/lib/login-lock";
import { redis } from "@/lib/redis";
import { redisKeys } from "@/lib/redis-keys";
import { authPlugin } from "@/plugins/auth";

export const onlineRoutes = new Elysia({ prefix: "/api/v1/online" })
	.use(authPlugin)
	.get(
		"/",
		async () => {
			// ponytail: redis.keys() 在生产环境 O(n)，百万级 key 时需换 SCAN。
			// 上线前评估规模，当前 dev 环境 key 数 < 1000，keys 够用。
			const keys = await redis.keys("online:user:*");
			if (keys.length === 0) return [];

			const values = await Promise.all(keys.map((k) => redis.get(k)));
			return values
				.filter((v): v is string => v !== null)
				.map((v) => JSON.parse(v));
		},
		{
			auth: true,
			requirePerm: ["sys:online:list"],
			detail: {
				tags: ["Online"],
				summary: "在线用户列表",
				description: "列出当前所有在线用户（基于 Redis）",
			},
		},
	)
	.delete(
		"/:userId",
		async ({ params }) => {
			await incrementTokenVersion(params.userId);
			await redis.del(redisKeys.onlineUser(params.userId));
			return true;
		},
		{
			auth: true,
			requirePerm: ["sys:online:kick"],
			params: t.Object({ userId: t.Numeric() }),
			detail: {
				tags: ["Online"],
				summary: "强制下线",
				description:
					"递增 tokenVersion 使该用户所有 token 失效，同时清除 Redis 在线状态",
			},
		},
	);
