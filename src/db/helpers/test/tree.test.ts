import { describe, expect, test } from "bun:test";
import { buildTree } from "../tree";

const defined = <T>(value: T | undefined): T => {
	if (value === undefined) throw new Error("Expected defined value");
	return value;
};

describe("buildTree", () => {
	test("空数组返回空数组", () => {
		expect(buildTree([])).toEqual([]);
	});

	test("单节点（根）", () => {
		const nodes = [{ id: 1, parentId: 0, name: "Root" }];
		const result = buildTree(nodes);
		expect(result).toHaveLength(1);
		expect(defined(result[0]).id).toBe(1);
		expect(defined(result[0]).children).toEqual([]);
	});

	test("两层树：1 个根 + 2 个子节点", () => {
		const nodes = [
			{ id: 1, parentId: 0, name: "Root" },
			{ id: 2, parentId: 1, name: "Child A" },
			{ id: 3, parentId: 1, name: "Child B" },
		];
		const result = buildTree(nodes);
		expect(result).toHaveLength(1);
		expect(defined(result[0]).children).toHaveLength(2);
		expect(defined(defined(result[0]).children[0]).id).toBe(2);
		expect(defined(defined(result[0]).children[1]).id).toBe(3);
	});

	test("三层嵌套", () => {
		const nodes = [
			{ id: 1, parentId: 0, name: "Root" },
			{ id: 2, parentId: 1, name: "Child" },
			{ id: 3, parentId: 2, name: "Grandchild" },
		];
		const result = buildTree(nodes);
		expect(
			defined(defined(defined(result[0]).children[0]).children[0]).id,
		).toBe(3);
	});

	test("多根节点", () => {
		const nodes = [
			{ id: 1, parentId: 0, name: "Root A" },
			{ id: 2, parentId: 0, name: "Root B" },
		];
		const result = buildTree(nodes);
		expect(result).toHaveLength(2);
	});

	test("悬空引用（parentId 不存在的节点）视为根", () => {
		const nodes = [
			{ id: 1, parentId: 0, name: "Root" },
			{ id: 2, parentId: 99, name: "Orphan" }, // parentId=99 不存在
		];
		const result = buildTree(nodes);
		expect(result).toHaveLength(2);
		expect(defined(result[1]).id).toBe(2);
	});

	test("字符串 ID 兼容", () => {
		const nodes = [
			{ id: "a", parentId: "0", name: "Root" },
			{ id: "b", parentId: "a", name: "Child" },
		];
		const result = buildTree(nodes);
		expect(defined(result[0]).id).toBe("a");
		expect(defined(defined(result[0]).children[0]).id).toBe("b");
	});

	test("保留原始字段", () => {
		const nodes = [
			{ id: 1, parentId: 0, name: "Root", extra: "value" },
			{ id: 2, parentId: 1, name: "Child", extra: 123 },
		];
		const result = buildTree(nodes);
		expect(defined(result[0]).extra).toBe("value");
		expect(defined(defined(result[0]).children[0]).extra).toBe(123);
	});
});
