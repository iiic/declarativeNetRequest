//@ts-check
"use strict";

// sidebar.mjs
import { BaseController, SIDEBAR_DISABLED_KEY, isFirefox, mountExtensionIdWatermark, readSidebarDisabled } from "./base.mjs";
import { t, initPageI18n } from "./i18n.mjs";

/** @implements {Classes.SidebarController} */
class SidebarController extends BaseController {
	constructor() {
		super();
		this.outputEl = /** @type {Classes.SidebarController['outputEl']} */ (document.getElementById("modules-output"));
	}

	/** @type {Classes.SidebarController['initPage']} */
	async initPage() {
		// "Do not use the sidebar" (Settings) turned on or off while the panel is open — the panel
		// starts again with the modules or with the notice (Chrome closes it by itself, Firefox cannot).
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "local" && SIDEBAR_DISABLED_KEY in changes) location.reload();
		});
		if (await readSidebarDisabled()) {
			this._renderDisabledNotice();
			return;
		}
		// An extension that offers its modules and waits for the user's decision — its modules work twice until then.
		this.mountPendingServiceNotice(this.outputEl, "sidebar");
		// Renders the custom elements of all modules that have "Show module output:
		// In the side panel" selected in the module Settings.
		await this.renderModulesFor("sidebar", this.outputEl);
	}

	/** @type {Classes.SidebarController['_renderDisabledNotice']} */
	_renderDisabledNotice() {
		const text = document.createElement("p");
		text.textContent = t("sidebar_disabled_notice");
		this.outputEl.append(text);
		// Chrome hides its turned-off panel by itself, Firefox keeps the icon in the sidebar launcher.
		if (isFirefox()) {
			const hint = document.createElement("p");
			hint.className = "sidebar-disabled-hint";
			hint.textContent = t("sidebar_disabled_remove_icon");
			this.outputEl.append(hint);
		}
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = t("sidebar_disabled_open_options");
		button.addEventListener("click", () => chrome.runtime.openOptionsPage());
		this.outputEl.append(button);
	}
}

document.addEventListener("DOMContentLoaded", async () => {
	mountExtensionIdWatermark();
	await initPageI18n();
	const controller = new SidebarController();
	controller.initPage();
});
