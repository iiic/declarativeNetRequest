// Copies the version of package.json into manifest.json. Runs in `npm version <version>` through the "version" script,
// so that the commit and tag that npm creates carry the same version in both files.
import { readFileSync, writeFileSync } from "node:fs";

const packageUrl = new URL("../package.json", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);

const { version } = JSON.parse(readFileSync(packageUrl, "utf8"));
const text = readFileSync(manifestUrl, "utf8");
// Replace the value only, to keep the formatting of the file. "manifest_version" does not match: "version" must follow a quote.
const updated = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);

if (JSON.parse(updated).version !== version) {
	console.error(`Could not set the version ${version} in manifest.json.`);
	process.exit(1);
}
writeFileSync(manifestUrl, updated);
console.log(`manifest.json: version ${version}`);
