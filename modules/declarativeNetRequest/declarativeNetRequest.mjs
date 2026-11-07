//@ts-check
"use strict";

// modules/declarativeNetRequest/declarativeNetRequest.mjs
//
// Editing and removing HTTP headers and GET parameters in the address, blocking
// requests and upgrading them from HTTP to HTTPS through declarativeNetRequest. Headers, parameters, blocking and the
// upgrade are handled by the browser itself according to rules that the background part (background-script.mjs)
// converts from Settings (rules.mjs) and passes to the core (api.networkRules).
//
// The overview of the rules that target the active tab's page (with suspending a rule temporarily) and the editor of the
// rules in Settings are declarativeNetRequestSandbox — they run in the sandbox (sandbox-modules/declarativeNetRequestSandbox)
// and the background part of this module does for them what needs the browser or the storage of this module (its services
// declarativeNetRequest.*, background-script.mjs). What stays here is asking for the permissions — a module in the sandbox
// cannot ask for a permission: the rules themselves (HEADERS_PERMISSIONS), the bookmarks for the rules with a bookmark folder
// and, while some rule announces when it is applied, the notifications with the following of the applied rules, while some
// rule writes into the own event log the following alone — and how the rules turned out in the browser (STATUS_MESSAGE —
// the conversion runs on every query, the state is current).
import { BaseElement, registerModule, t, tp, BOOKMARKS_PERMISSIONS, WEBREQUEST_PERMISSIONS } from "../../sdk.mjs";
import {
	MODULE_NAME,
	TAG,
	DESCRIPTION,
	ACTIVATION_SPEC,
	DEFAULT_ACTIVATION_MODE,
	DEFAULT_DISPLAY_LOCATION,
	DEFAULT_OUTPUT_ELEMENT,
	DEFAULT_SHOW_HEADING,
	SETTINGS_EDITED_BY,
	STYLES,
	USES_PERMISSIONS,
	RULES_KEY,
	STATUS_MESSAGE,
} from "./module.mjs";
import { missingPermissions, NOTIFICATION_PERMISSIONS, MATCHED_RULES_PERMISSIONS } from "./permissions.mjs";
import { normalizeRules, DEFAULT_RULES } from "./rules.mjs";

// The re-render delay after a change — saving the rules changes the settings and the rules in the browser at once.
const RENDER_DEBOUNCE_MS = 150;

// Without declarativeNetRequest.onRuleMatchedDebug (Firefox, Chrome with a packed extension) the background part follows
// only the requests an extension blocked (webRequest) — the notifications and the log only of blocking rules.
/** @type {Functions.DeclarativeNetRequest.Element.followsBlockedRequests} */
function followsBlockedRequests() {
	return !chrome.declarativeNetRequest?.onRuleMatchedDebug;
}

/** @implements {Classes.ExtensionDeclarativeNetRequest} */
class ExtensionDeclarativeNetRequest extends /** @type {Types.WithFields<typeof BaseElement, Classes.ExtensionDeclarativeNetRequest.Fields>} */ (BaseElement) {
	// activationSpec is looked up from the registry in BaseElement.init() (see
	// ACTIVATION_SPEC in module.mjs).

	/**
	 * @override
	 * @type {typeof Classes.ExtensionDeclarativeNetRequest.observedAttributes}
	 */
	static get observedAttributes() {
		return [];
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['connectedCallback']}
	 */
	connectedCallback() {
		this.className = "module-output";
		this.textContent = t("declarativeNetRequest_loading", TAG);
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['disconnectedCallback']}
	 */
	disconnectedCallback() {
		// Listeners of messages (BaseElement), the activation and the permissions from init().
		super.disconnectedCallback();
		for (const unsubscribe of this._unsubscribers || []) unsubscribe();
		this._unsubscribers = [];
		if (this._renderTimer) clearTimeout(this._renderTimer);
		this._renderTimer = null;
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['connectedMoveCallback']}
	 */
	connectedMoveCallback() {
		// The module holds no state tied to a position in the DOM.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['adoptedCallback']}
	 */
	adoptedCallback() {
		// The module does not need to react to a move into another document.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['attributeChangedCallback']}
	 */
	attributeChangedCallback(_name, _oldValue, _newValue) {
		// The module observes no HTML attributes.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequest['init']}
	 */
	async init({ outputEl, name, mode, location, instance }) {
		await super.init({ outputEl, name, mode, location, instance });

		if (!this.isActivationSatisfied(mode)) {
			this.textContent = t("declarativeNetRequest_disabled", name);
			return;
		}

		this._unsubscribers = [
			// Rules saved in the editor or added by imageInfoSandbox, the module list, a permission granted elsewhere.
			this.api.activation.onChange(() => this._scheduleRender()),
			this.api.permissions.onChange(() => this._scheduleRender()),
		];
		await this._render();
	}

	// Several triggers in quick succession = one render.
	/** @type {Classes.ExtensionDeclarativeNetRequest['_scheduleRender']} */
	_scheduleRender() {
		if (this._renderTimer) clearTimeout(this._renderTimer);
		this._renderTimer = setTimeout(() => {
			this._renderTimer = null;
			this._render();
		}, RENDER_DEBOUNCE_MS);
	}

	// The intro, the rules permission with the state of the rules in the browser, the bookmarks and the notifications.
	/** @type {Classes.ExtensionDeclarativeNetRequest['_render']} */
	async _render() {
		// Concurrent renders: only the last one is rendered.
		const generation = (this._renderGeneration || 0) + 1;
		this._renderGeneration = generation;
		const prefix = this._name || TAG;

		const [missing, bookmarks, rules] = await Promise.all([
			missingPermissions(this.api),
			this.api.permissions.contains(BOOKMARKS_PERMISSIONS),
			this.api.settings.get(RULES_KEY, /** @type {unknown} */ (DEFAULT_RULES)).then(normalizeRules),
		]);
		const status = missing ? null : await this._statusLine();
		const notify = await this._notifyLine(rules);
		const log = await this._logLine(rules);
		if (generation !== this._renderGeneration) return;

		const intro = document.createElement("div");
		intro.textContent = t("declarativeNetRequest_intro", prefix);
		this.replaceChildren(intro);
		if (missing) this.appendChild(this._line(t("declarativeNetRequest_missing_permission", prefix), true, this._permissionButton(t("declarativeNetRequest_allow"), missing)));
		if (status) this.appendChild(status);
		if (!bookmarks) {
			this.appendChild(this._line(t("declarativeNetRequest_missing_bookmarks"), true, this._permissionButton(t("declarativeNetRequest_allow_bookmarks"), BOOKMARKS_PERMISSIONS)));
		}
		if (notify) this.appendChild(notify);
		if (log) this.appendChild(log);
		// In Settings the editor of the rules is on the same page.
		if (this._location !== "options") {
			const buttons = document.createElement("div");
			buttons.className = "buttons";
			buttons.appendChild(this._settingsButton());
			this.appendChild(buttons);
		}
	}

	// How the stored rules turned out in the browser (the conversion in the background part).
	/** @type {Classes.ExtensionDeclarativeNetRequest['_statusLine']} */
	async _statusLine() {
		/** @type {Types.DeclarativeNetRequest.StatusResponse | Types.DeclarativeNetRequest.StatusError | void} */
		let response;
		try {
			response = await this.api.messages.send({ type: STATUS_MESSAGE });
		} catch {
			response = undefined;
		}
		if (!response || "error" in response) {
			return this._line(t("declarativeNetRequest_no_background", this._name || TAG, (response && "error" in response && response.error) || ""), true);
		}
		const { status } = response;
		/** @type {Record<Types.NetworkRulesProblem, string>} */
		const problems = {
			disabled: t("declarativeNetRequest_status_disabled"),
			notListed: t("declarativeNetRequest_status_not_listed"),
			unavailable: t("declarativeNetRequest_status_unavailable"),
			error: t("declarativeNetRequest_status_error", status.error || ""),
		};
		return status.reason ? this._line(problems[status.reason], true) : this._line(tp("declarativeNetRequest_status_active", status.active), false);
	}

	// While some enabled rule announces when it is applied: whether the notifications can come and a button for what is
	// missing. Without onRuleMatchedDebug (Firefox, Chrome with a packed extension) only blocking rules and the rules redirecting
	// to HTTPS are announced — the background part infers them from requests an extension blocked and requests the browser
	// redirected to https (webRequest).
	/** @type {Classes.ExtensionDeclarativeNetRequest['_notifyLine']} */
	async _notifyLine(rules) {
		const notifying = rules.filter((rule) => rule.enabled && rule.notifyMatched);
		if (notifying.length === 0) return null;
		if (typeof Notification === "undefined") return this._line(t("declarativeNetRequest_notify_unsupported"), true);
		const requests = followsBlockedRequests();
		if (requests && !notifying.some((rule) => rule.kind === "block" || rule.kind === "upgrade")) return this._line(t("declarativeNetRequest_notify_feedback_unavailable"), true);
		const [notificationGranted, watchGranted] = await Promise.all([
			this.api.permissions.contains(NOTIFICATION_PERMISSIONS),
			this.api.permissions.contains(requests ? WEBREQUEST_PERMISSIONS : MATCHED_RULES_PERMISSIONS),
		]);
		if (Notification.permission === "granted" && watchGranted) {
			return this._line(t(requests ? "declarativeNetRequest_notify_requests_granted" : "declarativeNetRequest_notify_granted"), false);
		}
		if (Notification.permission === "denied" && notificationGranted) return this._line(t("declarativeNetRequest_notify_blocked"), true);
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = t(requests ? "declarativeNetRequest_notify_requests_button" : "declarativeNetRequest_notify_button");
		button.title = t(requests ? "declarativeNetRequest_notify_requests_button_title" : "declarativeNetRequest_notify_button_title");
		button.addEventListener("click", async () => {
			// Firefox asks for notifications with its own prompt and after it does not take the click as a user gesture
			// for permissions.request() — then the request fails and the next click of the button asks for the rest.
			const permissionResult = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
			/** @type {chrome.runtime.ManifestPermission[]} */
			const permissions = [];
			/** @type {string[]} */
			const origins = [];
			if (!watchGranted && requests) {
				permissions.push(...(WEBREQUEST_PERMISSIONS.permissions || []));
				origins.push(...(WEBREQUEST_PERMISSIONS.origins || []));
			}
			if (!watchGranted && !requests) permissions.push("declarativeNetRequestFeedback");
			if (permissionResult === "denied" && !notificationGranted) permissions.push("notifications");
			if (permissions.length > 0) await this.api.permissions.request({ permissions, ...(origins.length > 0 ? { origins } : {}) });
			await this._render();
		});
		return this._line(t(requests ? "declarativeNetRequest_notify_requests_ask" : "declarativeNetRequest_notify_ask"), true, button);
	}

	// While some enabled rule writes into the own event log: whether the background part can follow the applied rules, with
	// a button for the missing permission — the log needs no notifications. Without onRuleMatchedDebug only blocking rules
	// and the rules redirecting to HTTPS are written (from requests an extension blocked or the browser redirected, webRequest).
	/** @type {Classes.ExtensionDeclarativeNetRequest['_logLine']} */
	async _logLine(rules) {
		const logging = rules.filter((rule) => rule.enabled && rule.logMatched);
		if (logging.length === 0) return null;
		const requests = followsBlockedRequests();
		if (requests && !logging.some((rule) => rule.kind === "block" || rule.kind === "upgrade")) return this._line(t("declarativeNetRequest_log_feedback_unavailable"), true);
		const watch = requests ? WEBREQUEST_PERMISSIONS : MATCHED_RULES_PERMISSIONS;
		if (await this.api.permissions.contains(watch)) {
			return this._line(t(requests ? "declarativeNetRequest_log_requests_granted" : "declarativeNetRequest_log_granted"), false);
		}
		const button = this._permissionButton(t(requests ? "declarativeNetRequest_log_requests_button" : "declarativeNetRequest_log_button"), watch);
		button.title = t(requests ? "declarativeNetRequest_log_requests_button_title" : "declarativeNetRequest_log_button_title");
		return this._line(t(requests ? "declarativeNetRequest_log_requests_ask" : "declarativeNetRequest_log_ask"), true, button);
	}

	// A line of the status; a button only where permissions can be asked for — the floating window's <iframe> has no
	// chrome.permissions (the user gesture belongs to the frame, see api.permissions.request()), there it says so instead.
	/** @type {Classes.ExtensionDeclarativeNetRequest['_line']} */
	_line(text, problem, button) {
		const line = document.createElement("div");
		line.className = problem ? "problem" : "hint";
		line.append(text);
		if (button) line.append(" ", typeof chrome.permissions === "undefined" ? t("declarativeNetRequest_permission_floating") : button);
		return line;
	}

	// A permission request button — request() right in the click handler, only for the missing part (computed in
	// advance): Firefox would not recognize the user gesture after an await.
	/** @type {Classes.ExtensionDeclarativeNetRequest['_permissionButton']} */
	_permissionButton(text, permissions) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = text;
		button.addEventListener("click", async () => {
			if (await this.api.permissions.request(permissions)) await this._render();
		});
		return button;
	}

	// The "Edit rules" button — the Settings page with the editor of declarativeNetRequestSandbox.
	/** @type {Classes.ExtensionDeclarativeNetRequest['_settingsButton']} */
	_settingsButton() {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = t("declarativeNetRequest_edit_rules");
		button.addEventListener("click", () => {
			chrome.runtime.openOptionsPage().catch((err) => console.error("declarativeNetRequest: Nastavení nejde otevřít:", err));
		});
		return button;
	}
}

customElements.define(TAG, ExtensionDeclarativeNetRequest);

registerModule({
	name: MODULE_NAME,
	tag: TAG,
	description: DESCRIPTION,
	activationSpec: ACTIVATION_SPEC,
	usesPermissions: USES_PERMISSIONS,
	settingsEditedBy: SETTINGS_EDITED_BY,
	styles: STYLES,
	defaultActivationMode: DEFAULT_ACTIVATION_MODE,
	defaultDisplayLocation: DEFAULT_DISPLAY_LOCATION,
	defaultOutputElement: DEFAULT_OUTPUT_ELEMENT,
	defaultShowHeading: DEFAULT_SHOW_HEADING,
});
