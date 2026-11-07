// manifest.json: required keys, the version and the files and texts it refers to.
import assert from "node:assert/strict";
import { test } from "node:test";
import { exists, readJson, readText } from "./helpers.mjs";

const manifest = readJson("manifest.json");

test("manifest.json has the required keys", () => {
	assert.equal(manifest.manifest_version, 3);
	for (const key of ["name", "version", "description", "default_locale"]) {
		assert.equal(typeof manifest[key], "string", `"${key}" is missing`);
	}
	assert.match(manifest.browser_specific_settings?.gecko?.id ?? "", /^[\w.-]+@[\w.-]+$/, "browser_specific_settings.gecko.id is missing or invalid");
});

test("the version is the same as in package.json and valid for Firefox", () => {
	// Firefox accepts 1 to 4 dot-separated numbers only — no npm pre-release suffix like 1.0.0-beta.1.
	assert.match(manifest.version, /^\d+(\.\d+){0,3}$/);
	assert.equal(manifest.version, readJson("package.json").version, "run `npm version <version>` to change both");
});

test("files referenced by the manifest exist", () => {
	/** @type {string[]} */
	const paths = [
		...Object.values(manifest.icons ?? {}),
		manifest.action?.default_popup,
		manifest.options_page,
		manifest.options_ui?.page,
		manifest.sidebar_action?.default_panel,
		manifest.background?.page,
		...(manifest.background?.scripts ?? []),
		...(manifest.sandbox?.pages ?? []),
		...(manifest.content_scripts ?? []).flatMap((/** @type {any} */ entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
		...(manifest.web_accessible_resources ?? []).flatMap((/** @type {any} */ entry) => entry.resources),
	];
	for (const icon of [manifest.action?.default_icon, manifest.sidebar_action?.default_icon]) {
		if (typeof icon === "string") paths.push(icon);
		else if (icon) paths.push(...Object.values(icon));
	}
	const missing = paths
		.filter(Boolean)
		// "dir/*" in web_accessible_resources — the directory must exist.
		.map((path) => path.replace(/\/?\*.*$/, ""))
		.filter((path) => !exists(path));
	assert.deepEqual(missing, []);
});

test("__MSG_*__ texts of the manifest exist in the default locale", () => {
	const messages = readJson(`_locales/${manifest.default_locale}/messages.json`);
	// The browser looks the names up case-insensitively.
	const names = new Set(Object.keys(messages).map((name) => name.toLowerCase()));
	const used = [...readText("manifest.json").matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]);
	assert.ok(used.length > 0);
	assert.deepEqual(used.filter((name) => !names.has(name.toLowerCase())), []);
});
