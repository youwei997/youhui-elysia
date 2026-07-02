/** Storage 接口：put（上传返回永久 url）/ delete（物理删除，幂等） */
export type Storage = {
	/**
	 * 上传文件到存储后端
	 * @param key 存储键，格式 {date}/{uuid}.{ext}
	 * @param data 文件数据流
	 * @param opts.contentType 文件 MIME 类型
	 * @returns 永久可访问的文件 URL
	 */
	put: (
		key: string,
		data: Buffer | ReadableStream<Uint8Array>,
		opts?: { contentType?: string },
	) => Promise<{ url: string }>;

	/**
	 * 从存储后端删除文件
	 * @param key 存储键
	 */
	delete: (key: string) => Promise<void>;
};

/** driver 配置联合 */
export type StorageConfig =
	| {
			/** local-fs / s3 */
			driver: "local-fs";
			/** 文件存储根目录 */
			rootDir: string;
			/** 文件可访问的基础 URL */
			publicBaseUrl: string;
	  }
	| {
			driver: "s3";
			/** S3 兼容 API 地址（MinIO / 七牛 / R2 / OSS） */
			endpoint: string;
			/** 区域 */
			region: string;
			/** 桶名 */
			bucket: string;
			/** 访问密钥 ID */
			accessKeyId: string;
			/** 访问密钥 */
			secretAccessKey: string;
			/** CDN 自定义域名（不传则用 bucket.endpoint） */
			publicBaseUrl?: string;
	  };
