// Translations: every _locales directory (of the extension and of its modules) has all texts of the default locale.
import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionFiles, readJson } from "./helpers.mjs";

const defaultLocale = readJson("manifest.json").default_locale;

// Plural forms (CLDR categories): a language may need more forms than the default locale has (e.g. "_few" in Czech).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** @type {Map<string, string[]>} _locales directory → its locales */
const localeDirs = new Map();
for (const path of extensionFiles()) {
	const match = path.match(/^(.*_locales)\/([^/]+)\/messages\.json$/);
	if (!match) continue;
	const [, dir, locale] = match;
	localeDirs.set(dir, [...(localeDirs.get(dir) ?? []), locale]);
}

test("_locales directories exist", () => {
	assert.ok(localeDirs.has("_locales"));
});

for (const [dir, locales] of localeDirs) {
	test(`${dir}: every locale has the texts of the default locale "${defaultLocale}"`, () => {
		assert.ok(locales.includes(defaultLocale), `${dir}/${defaultLocale}/messages.json is missing`);
		const defaultNames = Object.keys(readJson(`${dir}/${defaultLocale}/messages.json`));
		const pluralStems = new Set(defaultNames.filter((name) => PLURAL_SUFFIX.test(name)).map((name) => name.replace(PLURAL_SUFFIX, "")));

		for (const locale of locales) {
			const messages = readJson(`${dir}/${locale}/messages.json`);
			const names = Object.keys(messages);
			const missing = defaultNames.filter((name) => !(name in messages));
			const extra = names.filter((name) => !defaultNames.includes(name) && !pluralStems.has(name.replace(PLURAL_SUFFIX, "")));
			assert.deepEqual(missing, [], `${locale}: texts missing`);
			assert.deepEqual(extra, [], `${locale}: texts not in "${defaultLocale}"`);

			for (const [name, entry] of Object.entries(messages)) {
				assert.equal(typeof entry?.message, "string", `${locale}: "${name}" has no "message"`);
				// $name$ placeholders must be declared in "placeholders" (the browser looks them up case-insensitively).
				const declared = new Set(Object.keys(entry.placeholders ?? {}).map((key) => key.toLowerCase()));
				for (const [, placeholder] of entry.message.matchAll(/\$(\w+)\$/g)) {
					assert.ok(declared.has(placeholder.toLowerCase()), `${locale}: "${name}" uses $${placeholder}$ without declaring it`);
				}
			}
		}
	});
}
