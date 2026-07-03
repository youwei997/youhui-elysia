/** Redis online:user:{id} 中存储的在线用户信息 */
export type OnlineUserData = {
	username: string;
	loginAt: string;
	ip: string;
	userAgent: string;
};
