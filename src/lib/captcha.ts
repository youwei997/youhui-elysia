import { CAPTCHA_TTL_S } from "@/lib/auth-constants";
import { redis } from "./redis";
import { redisKeys } from "./redis-keys";

/**
 * 验证码生成器
 *
 * 生成 4 位运算验证码（如 "3+5=?"），返回 base64 SVG 图片，
 * 答案存入 Redis（5 分钟 TTL）。
 * 对齐 youlai-boot 的 EasyCaptcha 设计，简化实现。
 */

/**
 * 生成随机运算题
 * 返回 { expression, answer }
 * expression 格式如 "3+5"
 * answer 为计算结果
 */
const generateMathProblem = (): { expression: string; answer: number } => {
	const a = Math.floor(Math.random() * 9) + 1; // 1-9
	const b = Math.floor(Math.random() * 9) + 1; // 1-9
	const operators = ["+", "-", "×"] as const;
	const op = operators[Math.floor(Math.random() * operators.length)] as
		| "+"
		| "-"
		| "×";
	let answer: number;
	switch (op) {
		case "+":
			answer = a + b;
			break;
		case "-":
			answer = a - b;
			break;
		case "×":
			answer = a * b;
			break;
	}
	return { expression: `${a}${op}${b}`, answer };
};

/**
 * 将运算题渲染为 SVG
 *
 * 生成 120×48 的 SVG 图片，包含彩色字符和干扰线，
 * 返回 "data:image/svg+xml;base64,..." 格式的 data URI
 */
const renderMathSvg = (expression: string): string => {
	const chars = [...expression, "=", "?"];
	const charCount = chars.length;

	// 随机颜色（深色，保证可读性）
	const colors = [
		"#E24B4A",
		"#378ADD",
		"#1D9E75",
		"#EF9F27",
		"#7F77DD",
		"#D4537E",
	];

	const svgParts: string[] = [];
	svgParts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="52" viewBox="0 0 160 52">`,
	);
	svgParts.push(
		`<rect width="160" height="52" rx="6" fill="#F8F9FA" stroke="#D3D1C7" stroke-width="0.5"/>`,
	);

	// 干扰线
	const noiseLines = 3;
	for (let i = 0; i < noiseLines; i++) {
		const x1 = Math.floor(Math.random() * 160);
		const y1 = Math.floor(Math.random() * 52);
		const x2 = x1 + Math.floor(Math.random() * 60) - 30;
		const y2 = y1 + Math.floor(Math.random() * 20) - 10;
		svgParts.push(
			`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#B4B2A9" stroke-width="0.5" opacity="0.5"/>`,
		);
	}

	// 干扰点
	for (let i = 0; i < 15; i++) {
		const cx = Math.floor(Math.random() * 160);
		const cy = Math.floor(Math.random() * 52);
		svgParts.push(
			`<circle cx="${cx}" cy="${cy}" r="1" fill="#B4B2A9" opacity="0.4"/>`,
		);
	}

	// 字符渲染
	const startX = 16;
	const spacing = 20;
	for (let i = 0; i < charCount; i++) {
		const char = chars[i];
		const color = colors[i % colors.length] || "#333333";
		// 随机微调偏移
		const x = startX + i * spacing + Math.floor(Math.random() * 4) - 2;
		const y = 34 + Math.floor(Math.random() * 4) - 2;
		// 随机微调旋转
		const rotation = Math.floor(Math.random() * 20) - 10;
		svgParts.push(
			`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="${color}" transform="rotate(${rotation}, ${x}, ${y})" dominant-baseline="central">${char}</text>`,
		);
	}

	svgParts.push(`</svg>`);

	const svg = svgParts.join("");
	const base64 = Buffer.from(svg).toString("base64");
	return `data:image/svg+xml;base64,${base64}`;
};

/** 验证码生成结果 */
export type CaptchaResult = {
	/** 验证码缓存 ID，登录时回传 */
	captchaId: string;
	/** base64 SVG 图片 data URI */
	captchaBase64: string;
};

/**
 * 生成验证码
 *
 * 1. 随机生成算术题
 * 2. 渲染为 SVG base64
 * 3. 将答案存入 Redis（TTL 5 分钟）
 * 4. 返回 captchaId + captchaBase64
 */
export const generateCaptcha = async (): Promise<CaptchaResult> => {
	const { expression, answer } = generateMathProblem();
	const captchaId = crypto.randomUUID();
	const captchaBase64 = renderMathSvg(expression);

	await redis.set(
		redisKeys.captchaAnswer(captchaId),
		String(answer),
		"EX",
		CAPTCHA_TTL_S,
	);

	return { captchaId, captchaBase64 };
};

/**
 * 校验验证码
 *
 * 从 Redis 取出答案比对（不区分前后空格），
 * 校验后立即删除（一次性使用）。
 * 返回 true 表示通过，false 表示验证码不存在、已过期或答案不匹配
 */
export const verifyCaptcha = async (
	captchaId: string,
	captchaCode: string,
): Promise<boolean> => {
	const key = redisKeys.captchaAnswer(captchaId);
	const answer = await redis.get(key);
	if (!answer) {
		return false;
	}
	// 一次性消费：校验后删除
	await redis.del(key);
	// 去除首尾空格后比对
	const cleanCode = captchaCode.trim();
	const cleanAnswer = answer.trim();
	// 兼容中文输入法可能把数字转成全角的情况
	const normalize = (s: string): string => {
		return s
			.replace(/[０-９]/g, (ch) =>
				String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
			)
			.replace(/（/g, "(")
			.replace(/）/g, ")")
			.replace(/×/g, "*")
			.replace(/＋/g, "+");
	};
	return normalize(cleanCode) === normalize(cleanAnswer);
};
