// Shared helpers of the tests: paths of the extension files and reading them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Directories of the repository tooling — not part of the extension.
const TOOLING_DIRS = new Set([".git", ".github", ".githooks", "node_modules", "coverage", "web-ext-artifacts", "scripts", "tests"]);

/**
 * Relative paths (with "/") of all files of the extension.
 * @returns {string[]}
 */
export function extensionFiles() {
	/** @type {string[]} */
	const files = [];
	/** @param {string} dir */
	const walk = (dir) => {
		for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
			const path = dir ? `${dir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!TOOLING_DIRS.has(entry.name)) walk(path);
			} else {
				files.push(path);
			}
		}
	};
	walk("");
	return files;
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {string}
 */
export function readText(path) {
	return readFileSync(join(ROOT, path), "utf8");
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {any}
 */
export function readJson(path) {
	return JSON.parse(readText(path));
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {boolean}
 */
export function exists(path) {
	return existsSync(join(ROOT, path));
}
