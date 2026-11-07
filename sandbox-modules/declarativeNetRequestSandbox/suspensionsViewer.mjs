//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/suspensionsViewer.mjs
// The overview of temporarily suspended rules in Settings, below the editor of the rules (the settings view of the
// module, see declarativeNetRequestSandbox.mjs). A rule is suspended by the overview's button for SUSPEND_DURATION_MS
// (suspensions.mjs) — everywhere, or only for the domain of the page; here each suspension is listed (one for a domain
// with the domain) with the time it ends and a button that cancels it (declarativeNetRequest.restoreRule, for a domain
// with { domain }) — the background part of declarativeNetRequest then puts the permanent rule back into the browser.
// It used to be a custom settings field of declarativeNetRequest.
//
// The suspensions are in api.state of declarativeNetRequest — the overview gets them with every load of the editor
// (declarativeNetRequest.getRules, render()) and asks it to load again (reload()) when a listed suspension ends by itself
// or the user cancelled it. Cancelling happens right away, without "Save module settings".
import { t } from "../../sdk.mjs";
import { formatUntil } from "./suspensions.mjs";

/** @type {Functions.DeclarativeNetRequestSandbox.SuspensionsViewer.createSuspensionsViewer} */
export function createSuspensionsViewer({ restore, reload }) {
	const root = document.createElement("div");
	root.className = "dnr-suspensions";
	const title = document.createElement("div");
	title.className = "dnr-suspensions-title";
	title.textContent = t("declarativeNetRequestSandbox_setting_suspensions");
	const hint = document.createElement("div");
	hint.className = "dnr-editor-hint";
	hint.textContent = t("declarativeNetRequestSandbox_suspensions_hint");
	const list = document.createElement("ul");
	list.className = "dnr-suspensions-list";
	root.append(title, hint, list);

	/** @type {ReturnType<typeof setTimeout> | null} */
	let expiryTimer = null;

	/** @type {Functions.DeclarativeNetRequestSandbox.SuspensionsViewer.createSuspensionsViewer.createItem} */
	function createItem(suspension) {
		const item = document.createElement("li");
		const name = document.createElement("strong");
		name.textContent = suspension.title || suspension.id;
		const { domain } = suspension;
		const until = formatUntil(suspension.until);
		item.append(name, " ", domain === undefined ? t("declarativeNetRequestSandbox_suspended_until", until) : t("declarativeNetRequestSandbox_suspended_for_until", domain, until));
		if (!restore) return item;
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = t("declarativeNetRequestSandbox_suspension_cancel");
		button.title = domain === undefined ? t("declarativeNetRequestSandbox_restore_title") : t("declarativeNetRequestSandbox_restore_domain_title", domain);
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await restore(suspension.id, domain ?? null);
			} catch (err) {
				console.error("declarativeNetRequestSandbox: dočasné zrušení pravidla nejde zrušit:", err);
				button.disabled = false;
			}
			reload();
		});
		item.append(" ", button);
		return item;
	}

	/** @type {Functions.DeclarativeNetRequestSandbox.SuspensionsViewer.createSuspensionsViewer.render} */
	function render(items) {
		if (items.length === 0) {
			const empty = document.createElement("li");
			empty.className = "dnr-suspensions-empty";
			empty.textContent = t("declarativeNetRequestSandbox_suspensions_empty");
			list.replaceChildren(empty);
		} else {
			list.replaceChildren(...items.map(createItem));
		}

		// A suspension that ends by itself disappears from the overview (the background part drops it when it loads).
		if (expiryTimer) clearTimeout(expiryTimer);
		expiryTimer = null;
		if (items.length === 0) return;
		const expiry = Math.min(...items.map((item) => item.until));
		expiryTimer = setTimeout(() => {
			expiryTimer = null;
			if (root.isConnected) reload();
		}, Math.max(0, Math.min(expiry - Date.now() + 500, 0x7fffffff)));
	}

	return { root, render };
}
