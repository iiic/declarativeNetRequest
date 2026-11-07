//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/declarativeNetRequestSandbox.mjs
//
// The rules of declarativeNetRequest (editing and removing HTTP headers and GET parameters in the address, blocking
// requests, upgrading them from HTTP to HTTPS) — which of them target the page of the active tab and what they do, and in Settings their editor. An UPLOADED
// module (a package of JS modules) that the extension brings itself (BUNDLED_SANDBOX_MODULES in base.mjs): the overview
// used to be the element of modules/declarativeNetRequest and the editor its custom settings fields; now both run in the
// sandbox.
//
// The work that needs the browser stays with declarativeNetRequest: its background part converts the rules into the
// browser, keeps the rules and their temporary suspensions and does for the module what needs the browser or its storage —
// its services, functions outside the sandbox (CAPABILITIES in module.mjs). declarativeNetRequest.getStatus says which rules
// target the address of the page and how the rules turned out in the browser; declarativeNetRequest.suspendRule and
// restoreRule suspend a rule for an hour and restore it sooner (with { domain } only for a domain); declarativeNetRequest.reloadTab reloads the page (the edits
// apply to its requests only after it); the listener declarativeNetRequest.onChange says when the rules, the suspensions,
// the permissions, the module list or the bookmarks changed. The user can deny each function in Settings → "Uploaded modules
// (sandbox)": without the overview the module shows only why, without the listener it does not follow the changes, a denied
// button is not shown.
//
// A rule targeting the page is a details: the summary with its title and how it targets the page, in the part that folds its
// edits and buttons. It starts folded or unfolded by its setting in the editor ("List the rule in the overview": "Closed",
// closedInOverview); how the user then left it stays for the life of the element (_openRules).
//
// Every rule targeting the page has a "Suspend temporarily" button: the rule stops applying for an hour (everywhere it
// targets — the background part takes it out of the browser), then the permanent rule applies again; a suspended rule is
// listed with the time it ends and can be restored sooner (here or in the overview in Settings, suspensionsViewer.mjs).
// Next to it (outlined in the same color) "Suspend temporarily for <domain>" — the domain of the page (without "www.", the same as
// "Block the domain …", blockedPageDomain() of rules.mjs; with its subdomains): the rule stops applying for an hour only
// there — the background part gives it the domain among its "Except" domains, so it targets neither requests to the domain
// nor files its pages load from elsewhere —, elsewhere it applies on. A rule suspended for the domain of the page is listed
// with the domain and the time and has "Restore for <domain>" (the button suspending the whole rule stays).
//
// After them "Add <domain> to the exceptions list" (declarativeNetRequest.addExceptDomain, outlined in the second color) — the same
// domain of the page permanently: the background part adds it to the "Except" domains of the rule (addExceptDomain() of
// rules.mjs) and ends a suspension of the rule for it. The rule then no longer targets the page — the overview says where the
// domain went (the notice of the page, the same as after a block); the user removes it in the editor. This is how a rule that
// blocks on all addresses (the default rule blocking scripts and fetch/XHR) gets its exceptions while browsing.
//
// After a button of a rule (suspend, restore, add to the exceptions) and after a block of the page the overview renders right
// away (_renderNow()), the changes of the rules from elsewhere a moment later (_scheduleRender()).
//
// Below the rules are the buttons "Block the domain …" and "Block this address" (declarativeNetRequest.blockPage): the domain of
// the page (without "www.") or its exact address goes into the rule "Direct blocking list created by browsing" (one rule for
// all of them, the first in the list — the background part creates it), the browser then blocks the requests to it on all
// pages. The overview says what happened (or why the browser does not block it) and renders the rule among the others.
//
// Without the permissions the overview only says what is missing and opens the page where declarativeNetRequest asks for them
// (declarativeNetRequest.openPermissions — Settings of the extension that runs it, for a module of a client the client's). The
// editor in Settings asks right there: a click in the sandbox frame cannot ask for a permission, so the core draws the buttons
// above the frame and runs declarativeNetRequest.requestPermission within the click; the editor of a module of a client, where
// that function is unavailable, leads to the Settings of the client.
//
// At the bottom of the overview is the listing of the own event log of declarativeNetRequest (matchLogViewer.mjs): the
// requests the rules with "Into the own event log" were applied to on all pages — declarativeNetRequest.getLog reads it,
// declarativeNetRequest.clearLog deletes an entry or the whole log, the listener reports its changes ("log"). It stays in the
// element while the overview above it renders again (the search keeps its focus); unfolded or folded as the user left it
// (api.state, LOG_OPEN_KEY).
//
// In Settings the element is the editor of the rules (registerModule({ settingsView }), init({ location: "settings" }),
// rulesEditor.mjs) with the overview of the suspended rules below it (suspensionsViewer.mjs) — the editor gets the rules
// through declarativeNetRequest.getRules (and the addresses of the bookmarks in the folder of a rule it lists in JSON through
// declarativeNetRequest.getFolderUrls — without it the listing has none of them); the element reports its unsaved changes to the core (setUnsavedChanges()) and the
// common "Save module settings" button of Settings has it store them (saveSettings() → declarativeNetRequest.setRules).
//
// The package: declarativeNetRequestSandbox.mjs (the element), module.mjs (the description without DOM), rulesEditor.mjs and
// suspensionsViewer.mjs (the editor and the overview of the suspensions in Settings), matchLogViewer.mjs (the listing of the
// log), rules.mjs, headers.mjs, params.mjs, suspensions.mjs and matchLog.mjs (copies of the files of
// modules/declarativeNetRequest — tests/sandbox.test.mjs checks they are the same),
// domains.mjs (the domain lists for the copy of rules.mjs), declarativeNetRequestSandbox.css and messages.json (the texts in
// all UI languages) — a new file belongs in BUNDLED_SANDBOX_MODULES too (tests/manifests.test.mjs checks it).
import { BaseElement, registerModule, t } from "../../sdk.mjs";
import {
	MODULE_NAME,
	TAG,
	DESCRIPTION,
	ACTIVATION_SPEC,
	DEFAULT_ACTIVATION_MODE,
	DEFAULT_DISPLAY_LOCATION,
	DEFAULT_OUTPUT_ELEMENT,
	DEFAULT_SHOW_HEADING,
	STYLES,
	DEPENDS_ON,
	CAPABILITIES,
	SETTINGS_VIEW,
} from "./module.mjs";
import { kindPartKeys, pageKey, blockedPageDomain } from "./rules.mjs";
import { formatUntil } from "./suspensions.mjs";
import { createRulesEditor } from "./rulesEditor.mjs";
import { createSuspensionsViewer } from "./suspensionsViewer.mjs";
import { createMatchLogViewer } from "./matchLogViewer.mjs";

// The functions outside the sandbox (declared in module.mjs).
const GET_STATUS = "declarativeNetRequest.getStatus";
const GET_RULES = "declarativeNetRequest.getRules";
const GET_FOLDER_URLS = "declarativeNetRequest.getFolderUrls";
const SET_RULES = "declarativeNetRequest.setRules";
const SUSPEND = "declarativeNetRequest.suspendRule";
const RESTORE = "declarativeNetRequest.restoreRule";
const RELOAD = "declarativeNetRequest.reloadTab";
const BLOCK_PAGE = "declarativeNetRequest.blockPage";
const EXCEPT_DOMAIN = "declarativeNetRequest.addExceptDomain";
const GET_LOG = "declarativeNetRequest.getLog";
const CLEAR_LOG = "declarativeNetRequest.clearLog";
const OPEN_PERMISSIONS = "declarativeNetRequest.openPermissions";
const REQUEST_PERMISSION = "declarativeNetRequest.requestPermission";
const ON_CHANGE = "declarativeNetRequest.onChange";
const OPEN_OPTIONS = "options.open";

// Several changes in quick succession (saving the rules changes the settings and the suspensions) — one render.
const REFRESH_DELAY_MS = 150;

// The module's own state: the listing of the log unfolded (default) or folded.
const LOG_OPEN_KEY = "logOpen";

// Type checking sees this.api of BaseElement in sdk.mjs; in the sandbox it is
// Types.SandboxModuleApi, which has capabilities.
/** @type {Functions.DeclarativeNetRequestSandbox.Element.sandboxApi} */
function sandboxApi(element) {
	return /** @type {Types.SandboxModuleApi} */ (/** @type {unknown} */ (element.api));
}

/** @type {Functions.DeclarativeNetRequestSandbox.Element.errorText} */
export function errorText(err) {
	return err instanceof Error ? err.message : String(err);
}

// A header edit for the output ("remove User-Agent (request)").
/** @type {Functions.DeclarativeNetRequestSandbox.Element.formatEdit} */
export function formatEdit(edit) {
	const direction = t(edit.direction === "response" ? "declarativeNetRequestSandbox_direction_response_short" : "declarativeNetRequestSandbox_direction_request_short");
	if (edit.operation === "remove") return t("declarativeNetRequestSandbox_edit_remove", edit.header, direction);
	return t(edit.operation === "append" ? "declarativeNetRequestSandbox_edit_append" : "declarativeNetRequestSandbox_edit_set", edit.header, edit.value.trim(), direction);
}

// A GET parameter edit for the output ("remove parameter utm_source"; with a related parameter "remove parameters
// utm_source and utm_medium (only when both are in the address)").
/** @type {Functions.DeclarativeNetRequestSandbox.Element.formatParamEdit} */
export function formatParamEdit(edit) {
	const value = edit.value.trim();
	if (typeof edit.andParam === "string") {
		if (edit.operation === "remove") return t("declarativeNetRequestSandbox_param_remove_pair", edit.param, edit.andParam);
		return t("declarativeNetRequestSandbox_param_set_pair", edit.param, edit.andParam, value);
	}
	if (edit.operation === "remove") return t("declarativeNetRequestSandbox_param_remove", edit.param);
	return t("declarativeNetRequestSandbox_param_set", edit.param, value);
}

// The lines of a rule's edits: the edits with the same group key (null = never grouped, used for the removals) make one
// line with the list of the names in place of the first of them; a single one and the other edits stay one per line.
/** @type {Functions.DeclarativeNetRequestSandbox.Element.groupEdits} */
export function groupEdits(edits, groupKey, formatOne, formatGroup) {
	const keys = edits.map(groupKey);
	return edits.flatMap((edit, index) => {
		const key = keys[index];
		if (key === null) return [formatOne(edit)];
		if (keys.indexOf(key) !== index) return [];
		const group = edits.filter((_, other) => keys[other] === key);
		return [group.length > 1 ? formatGroup(group) : formatOne(edit)];
	});
}

// Header edits — the removals in the same direction together ("remove DNT, User-Agent (request)").
/** @type {Functions.DeclarativeNetRequestSandbox.Element.formatEdits} */
export function formatEdits(edits) {
	return groupEdits(
		edits,
		(edit) => (edit.operation === "remove" ? edit.direction : null),
		formatEdit,
		(group) => formatEdit({ ...group[0], header: group.map((edit) => edit.header).join(", ") })
	);
}

// GET parameter edits — the removals together ("remove parameters: utm_source, utm_medium"); an edit with a related
// parameter on its own line.
/** @type {Functions.DeclarativeNetRequestSandbox.Element.formatParamEdits} */
export function formatParamEdits(edits) {
	return groupEdits(
		edits,
		(edit) => (edit.operation === "remove" && typeof edit.andParam !== "string" ? "remove" : null),
		formatParamEdit,
		(group) => t("declarativeNetRequestSandbox_param_remove_many", group.map((edit) => edit.param).join(", "))
	);
}

// What the overview says after a page was blocked (declarativeNetRequest.blockPage): why the browser does not block it, otherwise
// that it went into the rule, or that the rule already blocked it.
/** @type {Functions.DeclarativeNetRequestSandbox.Element.blockNotice} */
export function blockNotice(response) {
	const { target, title, problem } = response;
	/** @type {Record<Types.DeclarativeNetRequest.BlockImageProblem, string>} */
	const problems = {
		permission: "declarativeNetRequestSandbox_block_permission",
		rule: "declarativeNetRequestSandbox_block_inactive",
		module: "declarativeNetRequestSandbox_block_module",
		browser: "declarativeNetRequestSandbox_block_rejected",
	};
	if (problem) return { text: t(problems[problem], target, title), problem: true };
	return { text: t(response.added ? "declarativeNetRequestSandbox_block_done" : "declarativeNetRequestSandbox_block_already", target, title), problem: false };
}

// What the overview says after the domain of the page went into the "Except" domains of a rule (declarativeNetRequest.addExceptDomain).
/** @type {Functions.DeclarativeNetRequestSandbox.Element.exceptNotice} */
export function exceptNotice(response) {
	return { text: t(response.added ? "declarativeNetRequestSandbox_except_done" : "declarativeNetRequestSandbox_except_already", response.domain, response.title), problem: false };
}

/** @implements {Classes.ExtensionDeclarativeNetRequestSandbox} */
class ExtensionDeclarativeNetRequestSandbox extends /** @type {Types.WithFields<typeof BaseElement, Classes.ExtensionDeclarativeNetRequestSandbox.Fields>} */ (BaseElement) {
	// activationSpec is looked up from the registry in init() (see ACTIVATION_SPEC in module.mjs).

	/**
	 * @override
	 * @type {typeof Classes.ExtensionDeclarativeNetRequestSandbox.observedAttributes}
	 */
	static get observedAttributes() {
		return [];
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['connectedCallback']}
	 */
	connectedCallback() {
		this.className = "module-output";
		this.textContent = t("declarativeNetRequestSandbox_loading", TAG);
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['disconnectedCallback']}
	 */
	disconnectedCallback() {
		// The core unsubscribes the module's listeners itself when its element in the extension page
		// goes away (the whole sandbox page goes with it) — this is for a detach in the sandbox.
		super.disconnectedCallback();
		for (const unsubscribe of this._unsubscribers || []) unsubscribe();
		this._unsubscribers = [];
		if (this._renderTimer) clearTimeout(this._renderTimer);
		this._renderTimer = null;
		if (this._expiryTimer) clearTimeout(this._expiryTimer);
		this._expiryTimer = null;
		this._log?.dispose();
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['connectedMoveCallback']}
	 */
	connectedMoveCallback() {
		// The module holds no state tied to a position in the DOM — after a move
		// with moveBefore() there is nothing to do.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['adoptedCallback']}
	 */
	adoptedCallback() {
		// The module does not need to react to a move into another document.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['attributeChangedCallback']}
	 */
	attributeChangedCallback(_name, _oldValue, _newValue) {
		// The module observes no HTML attributes.
	}

	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['init']}
	 */
	async init({ outputEl, name, mode, location }) {
		await super.init({ outputEl, name, mode, location });

		// The editor of the rules works also while the module is turned off.
		if (location !== "settings" && !this.isActivationSatisfied(mode)) {
			this.textContent = t("declarativeNetRequestSandbox_disabled", name);
			return;
		}

		const api = sandboxApi(this);
		this._states = {};
		this._listening = false;
		this._unsubscribers = [];
		this._renderTimer = null;
		this._expiryTimer = null;
		this._renderGeneration = 0;
		this._result = "";
		this._notice = null;
		this._editor = null;
		this._suspensions = null;
		this._log = null;
		this._logOpen = true;
		this._openRules = new Map();
		this._overview = document.createElement("div");
		this._overview.className = "dnr-overview";
		this.textContent = t("declarativeNetRequestSandbox_loading", this._name || TAG);
		this._overview.textContent = this.textContent;

		// The user decides about the functions in Settings — after a change the module starts again (reading allowed
		// now, the listener denied, …).
		this._unsubscribers.push(
			api.capabilities.onChange((states) => {
				this._states = states;
				this._start();
			})
		);
		// The side panel stays open — the overview follows tab switches and new addresses of the page. In the popup and
		// the floating window the page does not change during the element's life.
		if (location === "sidebar") this._unsubscribers.push(api.tabs.onChange(() => this._scheduleRender()));
		// A permission granted comes through the listener too, the browser's answer about notifications does not (the permissions
		// of the extension stay the same) — the editor loads again after every click.
		if (location === "settings") {
			this._unsubscribers.push(
				api.buttons.onClick((click) => {
					if (!click.ok) console.warn("declarativeNetRequestSandbox: oprávnění nejde vyžádat:", click.error);
					this._editor?.onChange("status");
				})
			);
		}
		try {
			this._states = await api.capabilities.state();
		} catch (err) {
			console.error(err);
		}
		if (location !== "settings") {
			try {
				this._logOpen = (await api.state.get(LOG_OPEN_KEY, true)) !== false;
			} catch (err) {
				console.warn("declarativeNetRequestSandbox: stav logu nejde načíst:", err);
			}
		}
		await this._start();
	}

	// Follows the changes and renders the overview or the editor — as far as the user allows the functions. A listener the
	// user denies later gets no events from the core (and gets them again once allowed), so it is subscribed only once.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_start']} */
	async _start() {
		if (this._allowed(ON_CHANGE) && !this._listening) {
			this._listening = true;
			const unsubscribe = sandboxApi(this).capabilities.listen(ON_CHANGE, (change) => this._onChange(/** @type {Enums.DeclarativeNetRequestSandbox.Change} */ (change)));
			(this._unsubscribers ??= []).push(unsubscribe);
		}
		if (this._location === "settings") {
			this._mountSettings();
			return;
		}
		this._mountLog();
		await this._render();
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_allowed']} */
	_allowed(capability) {
		return this._states[capability] === "allowed";
	}

	// A change of the rules, the suspensions, the log, the permissions, the module list or the bookmarks — the editor in
	// Settings takes it over itself (and gives the overview of the suspensions what it loaded; the log is not its business),
	// the overview of the page renders again, the listing of the log loads again after a change of the log or of the rules
	// (how many of them write into it).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_onChange']} */
	_onChange(change) {
		if (this._location === "settings") {
			if (change !== "log") this._editor?.onChange(change);
			return;
		}
		if (change === "log" || change === "settings") this._log?.schedule();
		if (change !== "bookmarks" && change !== "log") this._scheduleRender();
	}

	// Several triggers in quick succession = one render.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_scheduleRender']} */
	_scheduleRender() {
		if (this._renderTimer) clearTimeout(this._renderTimer);
		this._renderTimer = setTimeout(() => {
			this._renderTimer = null;
			this._render();
		}, REFRESH_DELAY_MS);
	}

	// Renders right away — after the user's own action (a button of a rule, blocking the page): its result is known as soon as
	// the function outside the sandbox answered, there is nothing to wait for. A planned render (_scheduleRender()) goes with
	// it. A timer of a page that is not visible waits much longer than REFRESH_DELAY_MS — Firefox holds the timers of a
	// background tab for at least 1 s (verified in Firefox 159: the overview in sidebar.html in a background tab rendered
	// a suspended rule 1 s after the click, its rules were in the browser after 0.6 s). The changes the action causes come
	// to _onChange() after it and render once more (the same content, the status the core stored).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_renderNow']} */
	_renderNow() {
		if (this._renderTimer) clearTimeout(this._renderTimer);
		this._renderTimer = null;
		return this._render();
	}

	// Settings: the editor of the rules and below it the overview of the suspended rules — created once, they follow the
	// changes themselves (a denied or allowed function creates them again — the cards of the previous editor and their
	// unsaved changes are gone).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_mountSettings']} */
	_mountSettings() {
		const name = this._name || TAG;
		const api = sandboxApi(this);
		this.setUnsavedChanges(false);
		// The buttons of the core stay until they are replaced — also after a function was denied.
		this._setPermissionButtons(null);
		if (!this._allowed(GET_RULES) || !this._allowed(SET_RULES)) {
			this._editor = null;
			this._suspensions = null;
			this.replaceChildren(this._status(t("declarativeNetRequestSandbox_editor_not_allowed", name), true));
			return;
		}
		// The overview of the suspensions gets them with every load of the editor (one declarativeNetRequest.getRules) and has
		// it load again after a suspension ended or was cancelled — also without the listener.
		const suspensions = createSuspensionsViewer({
			restore: this._allowed(RESTORE) ? async (id, domain) => void (await api.capabilities.call(RESTORE, domain === null ? { id } : { id, domain })) : null,
			reload: () => this._editor?.onChange("suspensions"),
		});
		this._suspensions = suspensions;
		const askHere = this._allowed(REQUEST_PERMISSION);
		this._editor = createRulesEditor({
			load: async () => /** @type {Types.DeclarativeNetRequest.RulesView} */ (await api.capabilities.call(GET_RULES)),
			save: async (rules) => /** @type {Types.DeclarativeNetRequest.SetRulesResult} */ (await api.capabilities.call(SET_RULES, rules)),
			// The addresses of the bookmarks in a folder (only the texts of the answer; null — the folder cannot be read).
			folderUrls: this._allowed(GET_FOLDER_URLS)
				? async (folderId) => {
						const result = /** @type {Partial<Types.DeclarativeNetRequest.FolderUrls> | null} */ (await api.capabilities.call(GET_FOLDER_URLS, { folderId }));
						return Array.isArray(result?.urls) ? result.urls.filter((url) => typeof url === "string") : null;
					}
				: null,
			openPermissions: !askHere && this._allowed(OPEN_PERMISSIONS) ? () => this._openPermissions() : null,
			onView: (view) => suspensions.render(view.suspensions),
			onPermissionNeeds: (needs) => {
				if (askHere) this._setPermissionButtons(needs);
			},
			onUnsaved: (unsaved) => this.setUnsavedChanges(unsaved),
		});
		this.replaceChildren(this._editor.root, suspensions.root);
	}

	// The buttons for the permissions the editor says are missing (null — none), drawn by the core above the frame. After a
	// permission is granted the listener reports "status", the editor loads again and calls this without its button.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_setPermissionButtons']} */
	_setPermissionButtons(needs) {
		/** @type {Types.SandboxButtonDefinition[]} */
		const buttons = [];
		if (needs?.rules) {
			buttons.push({ id: "allow-rules", label: t("declarativeNetRequestSandbox_editor_allow"), capability: REQUEST_PERMISSION, args: ["rules"] });
		}
		if (needs?.bookmarks) {
			buttons.push({ id: "allow-bookmarks", label: t("declarativeNetRequestSandbox_editor_allow_bookmarks"), capability: REQUEST_PERMISSION, args: ["bookmarks"] });
		}
		if (needs?.notify) {
			buttons.push({
				id: "allow-notify",
				label: t(needs.feedback ? "declarativeNetRequestSandbox_editor_allow_notify" : "declarativeNetRequestSandbox_editor_allow_notify_requests"),
				title: t(needs.feedback ? "declarativeNetRequestSandbox_editor_allow_notify_title" : "declarativeNetRequestSandbox_editor_allow_notify_requests_title"),
				capability: REQUEST_PERMISSION,
				args: ["notifications"],
			});
		}
		if (needs?.log) {
			buttons.push({
				id: "allow-log",
				label: t(needs.feedback ? "declarativeNetRequestSandbox_editor_allow_log" : "declarativeNetRequestSandbox_editor_allow_log_requests"),
				title: t(needs.feedback ? "declarativeNetRequestSandbox_editor_allow_log_title" : "declarativeNetRequestSandbox_editor_allow_log_requests_title"),
				capability: REQUEST_PERMISSION,
				args: ["log"],
			});
		}
		sandboxApi(this)
			.buttons.set(buttons)
			.catch((/** @type {unknown} */ err) => console.error("declarativeNetRequestSandbox: tlačítka oprávnění nejde vykreslit:", err));
	}

	// "Save module settings" in Settings (the core calls it after the editor reported unsaved changes): the cards of the
	// editor through declarativeNetRequest.setRules — a failure goes back to the core (and stays below the cards).
	/**
	 * @override
	 * @type {Classes.ExtensionDeclarativeNetRequestSandbox['saveSettings']}
	 */
	async saveSettings() {
		if (this._location === "settings" && this._editor) await this._editor.save();
	}

	// The overview of the page and below it the listing of the log (when the user allows reading it) — created again after
	// the user allowed or denied a function.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_mountLog']} */
	_mountLog() {
		const api = sandboxApi(this);
		this._log?.dispose();
		this._log = null;
		if (this._allowed(GET_LOG)) {
			const clearable = this._allowed(CLEAR_LOG);
			this._log = createMatchLogViewer({
				load: async () => /** @type {Types.DeclarativeNetRequest.LogView} */ (await api.capabilities.call(GET_LOG)),
				remove: clearable ? async (id) => void (await api.capabilities.call(CLEAR_LOG, { id })) : null,
				clear: clearable ? async () => void (await api.capabilities.call(CLEAR_LOG)) : null,
				listening: this._allowed(ON_CHANGE),
				open: this._logOpen,
				onToggle: (open) => {
					this._logOpen = open;
					api.state.set(LOG_OPEN_KEY, open).catch((/** @type {unknown} */ err) => console.warn("declarativeNetRequestSandbox: stav logu nejde uložit:", err));
				},
			});
		}
		this.replaceChildren(this._overview, ...(this._log ? [this._log.root] : []));
	}

	// The content of the overview above the listing of the log.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_show']} */
	_show(...nodes) {
		this._overview.replaceChildren(...nodes);
	}

	// The overview of the rules that target the page of the active tab, or why there is none.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_render']} */
	async _render() {
		// Concurrent renders: only the last one is rendered.
		const generation = (this._renderGeneration || 0) + 1;
		this._renderGeneration = generation;
		const prefix = this._name || TAG;
		if (!this._allowed(GET_STATUS)) {
			this._show(this._status(t("declarativeNetRequestSandbox_not_allowed", prefix), true));
			return;
		}

		const api = sandboxApi(this);
		const tab = await api.tabs.getActive();
		if (generation !== this._renderGeneration) return;
		const url = tab ? pageKey(tab.url) : null;

		/** @type {Types.DeclarativeNetRequest.PageStatus} */
		let result;
		try {
			result = /** @type {Types.DeclarativeNetRequest.PageStatus} */ (await api.capabilities.call(GET_STATUS, { url }));
		} catch (err) {
			if (generation !== this._renderGeneration) return;
			this._show(this._status(t("declarativeNetRequestSandbox_no_background", prefix, errorText(err)), true));
			return;
		}
		if (generation !== this._renderGeneration) return;
		if (!result.granted || !result.state) {
			this._renderMissingPermission(prefix);
			return;
		}
		if (!tab || !url) {
			this._show(t("declarativeNetRequestSandbox_not_web_page", prefix), " ", ...this._settingsButtons());
			return;
		}
		this._renderStatus(prefix, tab, result.state);
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_renderStatus']} */
	_renderStatus(prefix, tab, response) {
		const box = document.createDocumentFragment();

		const { status, matched } = response;
		const suspended = response.suspended || [];
		const any = matched.length > 0 || suspended.length > 0;
		this._scheduleExpiryRender(suspended);
		const summary = document.createElement("div");
		summary.textContent = any ? t("declarativeNetRequestSandbox_rules_apply", prefix) : t("declarativeNetRequestSandbox_no_rules", prefix);
		box.appendChild(summary);

		if (any) {
			// The domain a rule can be suspended for on this page (null — the host cannot be a domain of a rule).
			const pageDomain = blockedPageDomain(tab.url);
			const list = document.createElement("ul");
			list.className = "rules";
			for (const rule of matched) list.appendChild(this._createRuleItem(rule, pageDomain, tab));
			for (const rule of suspended) list.appendChild(this._createRuleItem(rule, pageDomain, tab));
			box.appendChild(list);
		}

		// The rules do not apply in the browser (module turned off, a browser error, …).
		/** @type {Record<Types.NetworkRulesProblem, string>} */
		const problems = {
			disabled: t("declarativeNetRequestSandbox_status_disabled"),
			notListed: t("declarativeNetRequestSandbox_status_not_listed"),
			unavailable: t("declarativeNetRequestSandbox_status_unavailable"),
			error: t("declarativeNetRequestSandbox_status_error", status.error || ""),
		};
		if (status.reason) {
			box.appendChild(this._status(problems[status.reason], true));
		} else if (any) {
			// Edits apply to requests from the time the rules were saved — a previously loaded
			// page gets them only after a reload.
			box.appendChild(this._status(t("declarativeNetRequestSandbox_reload_hint"), false));
		}
		if (this._result) box.appendChild(this._status(this._result, true));
		// What the last block did — only for the page it was about (the side panel follows other tabs).
		const notice = this._notice;
		if (notice && notice.url === pageKey(tab.url)) box.appendChild(this._status(notice.text, notice.problem));

		const blockButtons = this._blockButtons(tab);
		if (blockButtons.length > 0) {
			const row = document.createElement("div");
			row.className = "buttons block";
			row.append(...blockButtons);
			box.appendChild(row);
		}

		const buttons = document.createElement("div");
		buttons.className = "buttons";
		if (any && this._allowed(RELOAD)) {
			buttons.appendChild(
				this._button(t("declarativeNetRequestSandbox_reload"), async () => {
					try {
						await sandboxApi(this).capabilities.call(RELOAD, { tabId: tab.tabId });
						this._result = "";
					} catch (err) {
						this._result = t("declarativeNetRequestSandbox_action_failed", errorText(err));
						this._scheduleRender();
					}
				})
			);
		}
		buttons.append(...this._settingsButtons());
		box.appendChild(buttons);
		this._show(box);
	}

	// A rule that targets the page: the title, how it targets it, which
	// requests (when not all) and its edits (for blocking "block
	// requests"), with the buttons that suspend it — everywhere, or for the domain of the page —, or, when it is suspended
	// (a SuspendedRule with until), the time the suspension ends (with the domain when it is only for a domain) and a button
	// that restores it right away (_suspendButtons()), and the button that adds the domain of the page to its "Except" domains
	// (_exceptButton()). The output
	// re-renders after the change of the stored suspensions (declarativeNetRequest.onChange).
	// The summary with the title stays visible, the edits and the buttons fold away — the details start as the setting of the
	// rule says (closedInOverview); a rule the user folded or unfolded differently stays so after a re-render (_openRules).
	// The color the user chose for the rule in the editor is a thin line to the left of it (.rules>li.colored in the CSS).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_createRuleItem']} */
	_createRuleItem(rule, pageDomain, tab) {
		const suspension = "until" in rule ? rule : null;
		const item = document.createElement("li");
		if (suspension) item.className = "suspended";
		if (rule.color) {
			item.classList.add("colored");
			item.style.setProperty("--dnr-rule-color", rule.color);
		}
		const startsOpen = !rule.closedInOverview;
		const details = document.createElement("details");
		details.open = this._openRules.get(rule.id) ?? startsOpen;
		// Only a state that differs from the setting is kept: a kept copy of the setting would outlive its later change in the
		// editor — so also not one the setting has just caught up with, nor the toggle the browser fires for the opening above.
		if (details.open === startsOpen) this._openRules.delete(rule.id);
		details.addEventListener("toggle", () => {
			if (details.open === startsOpen) this._openRules.delete(rule.id);
			else this._openRules.set(rule.id, details.open);
		});
		const summary = document.createElement("summary");
		const title = document.createElement("strong");
		title.textContent = rule.title;
		const scope = document.createElement("span");
		scope.className = "scope";
		/** @type {string[]} */
		const scopeParts = [t(rule.via === "domain" ? "declarativeNetRequestSandbox_via_domain" : "declarativeNetRequestSandbox_via_page")];
		// A parameter rule and the upgrade to HTTPS never target WebSocket — "only …" only without another group.
		if (rule.parts.length < kindPartKeys(rule.kind).length) {
			scopeParts.push(t("declarativeNetRequestSandbox_parts_only", rule.parts.map((key) => t(`declarativeNetRequestSandbox_part_${key}`)).join(", ")));
		}
		if (suspension) {
			scopeParts.push(
				suspension.domain === undefined
					? t("declarativeNetRequestSandbox_suspended_until", formatUntil(suspension.until))
					: t("declarativeNetRequestSandbox_suspended_for_until", suspension.domain, formatUntil(suspension.until))
			);
		}
		scope.textContent = ` — ${scopeParts.join("; ")}`;
		const edits = document.createElement("ul");
		edits.className = "edits";
		const texts =
			rule.kind === "block"
				? [t("declarativeNetRequestSandbox_block_requests")]
				: rule.kind === "upgrade"
					? [t("declarativeNetRequestSandbox_upgrade_requests")]
					: rule.kind === "params"
						? formatParamEdits(rule.params)
						: formatEdits(rule.headers);
		for (const text of texts) {
			const line = document.createElement("li");
			line.textContent = text;
			edits.appendChild(line);
		}
		summary.append(title, scope);
		details.append(summary, edits);
		const buttons = [...this._suspendButtons(rule, pageDomain), this._exceptButton(rule, pageDomain, tab)].filter((button) => button !== null);
		if (buttons.length > 0) {
			const row = document.createElement("div");
			row.className = "buttons";
			row.append(...buttons);
			details.appendChild(row);
		}
		item.appendChild(details);
		return item;
	}

	// The buttons of a rule (only those whose function the user allows): a rule that applies — "Suspend rule temporarily"
	// and after it "Suspend rule temporarily for <domain>" (pageDomain — none for a page without one); a rule suspended for a
	// domain — "Suspend rule temporarily" (everywhere) and "Restore rule for <domain>"; a rule suspended as a whole — "Restore rule".
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_suspendButtons']} */
	_suspendButtons(rule, pageDomain) {
		const suspended = "until" in rule;
		// The domain the rule is suspended for (null — it is not, or as a whole).
		const suspendedFor = suspended ? (rule.domain ?? null) : null;
		if (suspended && suspendedFor === null) {
			const restore = this._suspendButton(RESTORE, { id: rule.id }, t("declarativeNetRequestSandbox_restore"), t("declarativeNetRequestSandbox_restore_title"), false);
			return restore ? [restore] : [];
		}
		const buttons = [this._suspendButton(SUSPEND, { id: rule.id }, t("declarativeNetRequestSandbox_suspend"), t("declarativeNetRequestSandbox_suspend_title"), false)];
		if (suspendedFor !== null) {
			const label = t("declarativeNetRequestSandbox_restore_domain", suspendedFor);
			buttons.push(this._suspendButton(RESTORE, { id: rule.id, domain: suspendedFor }, label, t("declarativeNetRequestSandbox_restore_domain_title", suspendedFor), true));
		} else if (pageDomain !== null) {
			const label = t("declarativeNetRequestSandbox_suspend_domain", pageDomain);
			buttons.push(this._suspendButton(SUSPEND, { id: rule.id, domain: pageDomain }, label, t("declarativeNetRequestSandbox_suspend_domain_title", pageDomain), true));
		}
		return buttons.filter((button) => button !== null);
	}

	// One button of _suspendButtons(): suspends or restores the rule (capability with options — { id }, for a domain also
	// { domain }) — null when the user denied the function. forDomain: the button for a domain (outlined, .domain).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_suspendButton']} */
	_suspendButton(capability, options, label, title, forDomain) {
		if (!this._allowed(capability)) return null;
		const button = document.createElement("button");
		button.type = "button";
		button.className = forDomain ? "suspend domain" : "suspend";
		button.textContent = label;
		button.title = title;
		button.addEventListener("click", async () => {
			button.disabled = true;
			try {
				await sandboxApi(this).capabilities.call(capability, options);
				this._result = "";
			} catch (err) {
				console.error("declarativeNetRequestSandbox: dočasné zrušení pravidla nejde uložit:", err);
				this._result = t("declarativeNetRequestSandbox_action_failed", errorText(err));
			}
			// Right away (also without the listener the overview does not learn about the change by itself).
			this._renderNow();
		});
		return button;
	}

	// "Add <domain> to the exceptions list" of a rule (pageDomain — none for a page without one; null also when the user denies
	// declarativeNetRequest.addExceptDomain): the background part takes only the active tab of this window with the address it
	// has now. Then the overview renders again (also without the listener) — without the rule, which no longer targets the page,
	// and with the notice where the domain went.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_exceptButton']} */
	_exceptButton(rule, pageDomain, tab) {
		if (pageDomain === null || !this._allowed(EXCEPT_DOMAIN)) return null;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "suspend except";
		button.textContent = t("declarativeNetRequestSandbox_except_domain", pageDomain);
		button.title = t("declarativeNetRequestSandbox_except_domain_title", pageDomain);
		button.addEventListener("click", async () => {
			button.disabled = true;
			const url = /** @type {string} */ (pageKey(tab.url));
			try {
				const response = /** @type {Types.DeclarativeNetRequest.ExceptDomainResponse} */ (
					await sandboxApi(this).capabilities.call(EXCEPT_DOMAIN, { id: rule.id, tabId: tab.tabId, url: tab.url })
				);
				this._notice = { url, ...exceptNotice(response) };
			} catch (err) {
				console.error("declarativeNetRequestSandbox: doménu nejde přidat do výjimek pravidla:", err);
				this._notice = { url, text: t("declarativeNetRequestSandbox_action_failed", errorText(err)), problem: true };
			}
			this._renderNow();
		});
		return button;
	}

	// "Block the domain …" (when the page has a domain a rule can take — not a host with "_") and "Block this address" — none while the user
	// denies declarativeNetRequest.blockPage. Both are disabled while one of them works.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_blockButtons']} */
	_blockButtons(tab) {
		const url = pageKey(tab.url);
		if (!this._allowed(BLOCK_PAGE) || url === null) return [];
		const domain = blockedPageDomain(url);
		/** @type {HTMLButtonElement[]} */
		const buttons = [];
		if (domain !== null) {
			const button = this._button(t("declarativeNetRequestSandbox_block_domain", domain), () => this._blockPage(tab, "domain", buttons));
			button.title = t("declarativeNetRequestSandbox_block_domain_title", domain);
			buttons.push(button);
		}
		const button = this._button(t("declarativeNetRequestSandbox_block_url"), () => this._blockPage(tab, "url", buttons));
		button.title = t("declarativeNetRequestSandbox_block_url_title", url);
		buttons.push(button);
		return buttons;
	}

	// The domain or the address of the page into the rule of the pages blocked while browsing — the background part takes only the
	// active tab of this window with the address it has now. Then the overview renders again (also without the listener).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_blockPage']} */
	async _blockPage(tab, scope, buttons) {
		const url = /** @type {string} */ (pageKey(tab.url));
		for (const button of buttons) button.disabled = true;
		try {
			const response = /** @type {Types.DeclarativeNetRequest.BlockPageResponse} */ (await sandboxApi(this).capabilities.call(BLOCK_PAGE, { tabId: tab.tabId, url: tab.url, scope }));
			this._notice = { url, ...blockNotice(response) };
		} catch (err) {
			console.error("declarativeNetRequestSandbox: stránku nejde zablokovat:", err);
			this._notice = { url, text: t("declarativeNetRequestSandbox_action_failed", errorText(err)), problem: true };
		}
		this._renderNow();
	}

	// When a suspension listed here ends, the rule applies again — the output re-renders
	// (the status query also makes the background part put the rule back into the browser).
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_scheduleExpiryRender']} */
	_scheduleExpiryRender(suspended) {
		if (this._expiryTimer) clearTimeout(this._expiryTimer);
		this._expiryTimer = null;
		if (suspended.length === 0) return;
		const delay = Math.min(...suspended.map((rule) => rule.until)) - Date.now() + 500;
		this._expiryTimer = setTimeout(() => {
			this._expiryTimer = null;
			this._scheduleRender();
		}, Math.max(0, Math.min(delay, 0x7fffffff)));
	}

	// The "Edit rules" button — Settings with the editor (when the user allows opening them): always at the module's
	// block in "Custom module settings" (options.html#declarativeNetRequestSandbox), not in the section open last.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_settingsButtons']} */
	_settingsButtons() {
		if (!this._allowed(OPEN_OPTIONS)) return [];
		return [this._button(t("declarativeNetRequestSandbox_edit_rules"), () => this._openOptions(MODULE_NAME))];
	}

	// Without the permission for the rules: what is missing and where declarativeNetRequest asks for it.
	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_renderMissingPermission']} */
	_renderMissingPermission(prefix) {
		const line = this._status(t("declarativeNetRequestSandbox_missing_permission", prefix) + " ", true);
		if (this._allowed(OPEN_PERMISSIONS)) line.appendChild(this._button(t("declarativeNetRequestSandbox_open_settings"), () => this._openPermissions()));
		else line.append(t("declarativeNetRequestSandbox_grant_in_options"));
		this._show(line);
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_openPermissions']} */
	_openPermissions() {
		sandboxApi(this)
			.capabilities.call(OPEN_PERMISSIONS)
			.catch((err) => console.warn("declarativeNetRequestSandbox: stránka s oprávněními se neotevřela", err));
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_openOptions']} */
	_openOptions(hash) {
		sandboxApi(this)
			.capabilities.call(OPEN_OPTIONS, ...(hash ? [{ hash }] : []))
			.catch((err) => console.warn("declarativeNetRequestSandbox: Nastavení se neotevřelo", err));
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_status']} */
	_status(text, problem) {
		const status = document.createElement("div");
		status.className = problem ? "problem" : "hint";
		status.textContent = text;
		return status;
	}

	/** @type {Classes.ExtensionDeclarativeNetRequestSandbox['_button']} */
	_button(label, onClick) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.addEventListener("click", onClick);
		return button;
	}
}

customElements.define(TAG, ExtensionDeclarativeNetRequestSandbox);

registerModule({
	name: MODULE_NAME,
	tag: TAG,
	description: DESCRIPTION,
	activationSpec: ACTIVATION_SPEC,
	dependsOn: DEPENDS_ON,
	capabilities: CAPABILITIES,
	settingsView: SETTINGS_VIEW,
	defaultActivationMode: DEFAULT_ACTIVATION_MODE,
	defaultDisplayLocation: DEFAULT_DISPLAY_LOCATION,
	defaultOutputElement: DEFAULT_OUTPUT_ELEMENT,
	defaultShowHeading: DEFAULT_SHOW_HEADING,
	styles: STYLES,
});
