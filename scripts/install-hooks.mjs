// Points git at the hooks in .githooks/ (pre-commit runs the tests). Runs on `npm install` through the "prepare" script.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Not in a git clone (e.g. an unpacked npm package) or in CI — nothing to do.
if (process.env.CI || !existsSync(new URL("../.git", import.meta.url))) process.exit(0);

try {
	execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, stdio: "inherit" });
} catch {
	console.warn("Could not set the git hooks — run `git config core.hooksPath .githooks` to run the tests on commit.");
}
