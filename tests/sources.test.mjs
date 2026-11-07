// Source files: valid JSON and JavaScript syntax, and the files that the code, HTML pages and stylesheets refer to exist.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { posix } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { ROOT, exists, extensionFiles, readJson, readText } from "./helpers.mjs";

const execFileAsync = promisify(execFile);
const files = extensionFiles();

// References that are missing on purpose for now — reported as "todo", they do not fail the tests.
// Remove an entry once its file is added.
const KNOWN_MISSING = new Set([]);

/**
 * Path of the referenced file relative to the root, or null when the reference is not a file of the extension.
 * @param {string} from file containing the reference
 * @param {string} ref
 * @returns {string | null}
 */
function resolveReference(from, ref) {
	// URL with a scheme (https:, data:, moz-extension:…), protocol-relative URL, fragment only.
	if (!ref || /^([a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref)) return null;
	const path = ref.replace(/[?#].*$/, "");
	return path.startsWith("/") ? path.slice(1) : posix.join(posix.dirname(from), path);
}

/**
 * Broken references of the files ("file → path"), found by the patterns.
 * @param {string[]} paths files to search
 * @param {RegExp[]} patterns each with the reference in group 1
 * @param {{ accept?: (ref: string) => boolean, fromRoot?: boolean }} [options] which references to check;
 *   whether they are relative to the root of the extension instead of the file
 * @returns {string[]}
 */
function brokenReferences(paths, patterns, { accept = () => true, fromRoot = false } = {}) {
	/** @type {string[]} */
	const broken = [];
	for (const path of paths) {
		const text = readText(path);
		for (const pattern of patterns) {
			for (const [, ref] of text.matchAll(pattern)) {
				if (!accept(ref)) continue;
				const target = resolveReference(fromRoot ? "." : path, ref);
				if (target !== null && !exists(target)) broken.push(`${path} → ${target}`);
			}
		}
	}
	return [...new Set(broken)];
}

test("JSON files are valid", () => {
	for (const path of files.filter((path) => path.endsWith(".json"))) {
		assert.doesNotThrow(() => readJson(path), `${path} is not valid JSON`);
	}
});

test("JavaScript files have valid syntax", async () => {
	const scripts = files.filter((path) => /\.m?js$/.test(path));
	assert.ok(scripts.length > 0);
	const errors = await Promise.all(scripts.map(async (path) => {
		try {
			await execFileAsync(process.execPath, ["--check", path], { cwd: ROOT });
			return null;
		} catch (error) {
			return `${path}\n${/** @type {{ stderr?: string }} */ (error).stderr ?? error}`;
		}
	}));
	assert.deepEqual(errors.filter(Boolean), []);
});

test("imported modules and runtime.getURL() files exist", () => {
	const scripts = files.filter((path) => /\.m?js$/.test(path));
	const imports = brokenReferences(scripts, [
		/^\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/gm,
		/^\s*import\s*["']([^"']+)["']/gm,
		/\bimport\(\s*["']([^"']+)["']\s*\)/g,
	], { accept: (ref) => /^\.{1,2}\//.test(ref) });
	assert.deepEqual(imports, []);
	// getURL() takes a path from the root of the extension.
	assert.deepEqual(brokenReferences(scripts, [/\bgetURL\(\s*["']([^"']+)["']\s*\)/g], { fromRoot: true }), []);
});

test("modules listed in modules.json exist", () => {
	const local = readJson("modules.json").filter((/** @type {string} */ entry) => entry.startsWith("./"));
	assert.ok(local.length > 0);
	assert.deepEqual(local.filter((/** @type {string} */ entry) => !exists(entry)), []);
});

const pageReferences = brokenReferences(files.filter((path) => path.endsWith(".html")), [/\s(?:src|href)\s*=\s*["']([^"']+)["']/gi])
	.concat(brokenReferences(files.filter((path) => path.endsWith(".css")), [/url\(\s*["']?([^"')]+?)["']?\s*\)/g]));

test("files referenced by HTML pages and stylesheets exist", () => {
	assert.deepEqual(pageReferences.filter((entry) => !KNOWN_MISSING.has(entry)), []);
	assert.deepEqual([...KNOWN_MISSING].filter((entry) => !pageReferences.includes(entry)), [], "these exist now — remove them from KNOWN_MISSING");
});

test("known missing files", { todo: pageReferences.filter((entry) => KNOWN_MISSING.has(entry)).join(", ") || false }, () => {});
