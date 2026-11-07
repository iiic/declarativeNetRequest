//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/rulesEditor.mjs
// The editor of header edit, GET parameter, blocking and HTTPS upgrade rules of declarativeNetRequest in Settings — the settings view of
// the module (registerModule({ settingsView }), init({ location: "settings" })); it used to be a custom settings field of
// declarativeNetRequest. A rule is a card: the header
// (the "Enabled" checkbox, title, color, ×) is always visible, below it a collapsible
// <details> "Details" (in the summary the kind and number of edits and how many declarativeNetRequest rules
// the stored rule makes in the browser — readable on a collapsed card; stored rules collapsed, a new rule expanded) with three parts — WHAT to do (choosing
// edit headers / edit GET parameters / block requests / redirect HTTP to HTTPS and below it
// the edit rows of the chosen kind: a request or response header, remove /
// set / append a value, or a parameter, remove / set a value — also a parameter with a related one ("and at the same
// time", the second button next to "+ Add parameter": the operation for both, only in an address with both);
// common headers and tracking parameters are suggested by a <datalist>, any
// can be entered; blocking and the upgrade to HTTPS have no rows), WHICH requests (page, frames, scripts, …;
// a parameter rule and the upgrade without WebSocket, the upgrade without the protocol — it targets only http://) and WHERE (domains, addresses, a bookmark folder
// with the "whole domain" option, "Except" domains with "except private and local IP addresses" and "except the requests of this
// extension"). Below the kind the heading "Notify when a declarativeNetRequest rule is
// applied" with two checkboxes — by a silent notification and into the own event log of declarativeNetRequest (the overview
// lists it, matchLogViewer.mjs) —, each checked one with a line on whether it can work (notifyText(), logText()), and below
// it "List the rule in the overview" with the checkbox "Closed": the rule starts folded in the overview of the page.
// At the bottom of the details the button "Show the rule in JSON" shows (and hides again) the declarativeNetRequest rules the
// card makes, written as the static rules of an extension in manifest.json — only those of this rule, following its changes
// (manifestRules(), renderJson(); the request types of this browser come with the load of the background part), with a
// bookmark folder with the addresses of its bookmarks as the folder has them now (with "whole domain" their domains) — the
// background part reads them (folderUrls(), declarativeNetRequest.getFolderUrls) when the card shows its JSON. Above it a
// warning, while the settings of the card need regular expressions (regexFilter) instead of urlFilter in the browser —
// how many and why (regexNotes()); the summary says after saving how many the stored rule has in the browser — and, in red,
// how many the background part left out because the browser cannot compile their regular expression.
// A button adds a rule, × removes it after a second click (requireSecondClick()). Between the title and × is the color of
// the rule — the overview of the page draws it as a thin line next to the rule. By default it is the color of the name
// (colorFromText() of the SDK — the same name always the same color): it comes once the name is written and the field left,
// and follows a renaming as long as the user has not picked another one; until then the rule has none. The input
// is checked continuously —
// what the browser would reject the editor shows below the part and the background part does not send it
// into the browser (headers.mjs, params.mjs, rules.mjs — copies of the files of declarativeNetRequest, the same check as in
// its background part). Rows of a kind that is not selected stay hidden in the card (switching back restores them), but
// only the edits of the selected kind are saved. The text fields may hold the user's notes between "/*" and "*/" (the second
// hint at the top): they are saved as written, the checks and the conversion ignore them (withoutComments() of rules.mjs);
// a comment without "*/" and "/*" glued to an address or a value (not a comment there) the card says (commentProblems()).
//
// Everything the editor needs from the browser and from the storage of declarativeNetRequest it gets in one answer of its
// background part (load() — declarativeNetRequest.getRules, Types.DeclarativeNetRequest.RulesView): the stored rules, the
// folders of the bookmark tree (null without the permission — then the selection keeps only the already stored folder, so
// it is not lost when saving), the permissions and the notifications, how the stored rules turned out in the browser and
// the suspended rules (onView() gives them to the overview of the suspensions). The cards are stored by the common
// "Save module settings" button of Settings (saveSettings() of the element → saveRules() — save(),
// declarativeNetRequest.setRules, the background part checks them again): the editor tells the element whether the cards
// differ from the stored rules — a changed, added or removed rule (onUnsaved(), setUnsavedChanges() — the reminder above
// the button) — and below the cards says what happened with the last saving. A click in the sandbox frame cannot ask for a
// permission — what is missing the notice at the top and the cards only say (the access to all pages and to the bookmarks, what
// the checked notifications and logs of the cards need, onPermissionNeeds()), the element has the core draw the buttons right
// above the notice (declarativeNetRequest.requestPermission); only for a module of a client the notice has a button of its own,
// to the Settings of the client (openPermissions).
//
// Rules stored elsewhere while the editor is open (the button "Block the image permanently" of imageInfoSandbox,
// another tab with Settings) the editor takes over rule by rule — only into cards the user has not changed here
// (takeOver()), so saving does not overwrite them. It learns about them from onChange() (the listener
// declarativeNetRequest.onChange of the element), which also brings a new bookmark folder into the menus right away (and has
// the JSON of a card with a folder read its bookmarks again).
//
// The look is in declarativeNetRequestSandbox.css (.dnr-editor).
import { t, tp, colorFromText } from "../../sdk.mjs";
import { normalizeDomain } from "./domains.mjs";
import {
	DIRECTIONS,
	OPERATIONS,
	REQUEST_APPEND_HEADERS,
	COMMON_REQUEST_HEADERS,
	COMMON_RESPONSE_HEADERS,
	emptyHeader,
	isBlankHeader,
	headerProblem,
} from "./headers.mjs";
import { PARAM_OPERATIONS, COMMON_PARAMS, emptyParam, isBlankParam, paramProblem, paramsShadowed } from "./params.mjs";
import {
	RULE_KINDS,
	PROTOCOLS,
	PART_KEYS,
	emptyRule,
	newRuleId,
	normalizeRules,
	parsePageList,
	ruleHasTargets,
	hasValidEdits,
	validParams,
	ruleParts,
	compileRules,
	buildNetworkRules,
	regexReasons,
	privateGaps,
	pageKey,
	parseComments,
	stripComments,
	withoutComments,
	PRIVATE_RANGES,
	NOT_PRIVATE_HOST_PARTS,
	COMMON_RESOURCE_TYPES,
	PAGE_FILTER_BUDGET,
} from "./rules.mjs";

// The editor's sequence number — the ids of its <datalist>s must be unique in the document.
let editorCount = 0;

// Several changes in quick succession (a bookmark import, saving) — one load.
const RELOAD_DELAY_MS = 200;

// How long the × of a rule waits for the second click that removes it (the same as "Clear log", matchLogViewer.mjs).
const CONFIRM_MS = 4000;

// What the color picker of a rule without a color shows (<input type="color"> always has a value) — dimmed until the user
// picks one (.dnr-rule-color--unset), the rule stays without a color until then.
const UNSET_COLOR = "#808080";

// How many lines the JSON of a rule shows at most without scrolling (a domain list makes long ones).
const JSON_MAX_ROWS = 24;

// A line where "/*" right after other text is followed by "*/" with a space between them (commentProblems()).
const GLUED_COMMENT = /\/\*.*[ \t].*\*\//;

// What the card says about the comments of a field (validateRow()): unclosed — a comment without "*/", the rest of the field
// is ignored; glued — in the addresses and the values (separated) the lines (without their comments) where "/*" right after
// other text is followed by "*/" with a space between them: "/*" is a part of the text there (parseComments() of rules.mjs —
// "https://example.com/*"), so it is not a comment, though the user most likely meant one.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.commentProblems} */
export function commentProblems(value, separated) {
	const { text, unclosed } = parseComments(value, separated);
	const glued = separated
		? text
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter((line) => GLUED_COMMENT.test(line))
		: [];
	return { unclosed, glued };
}

// Items of the domain list that cannot be read as a domain (the same splitting
// as the core's parseDomainList()).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.invalidDomains} */
export function invalidDomains(value) {
	return value.split(/[\s,;]+/).filter((item) => item && normalizeDomain(item) === null);
}

// A rule the user wrote nothing into (skipped when saving).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.isEmptyRule} */
export function isEmptyRule(rule) {
	return (
		![rule.title, rule.domains, rule.pages, rule.folderId, rule.exceptDomains].some((text) => text.trim()) &&
		rule.headers.every(isBlankHeader) &&
		rule.params.every(isBlankParam)
	);
}

// The rule as it is saved: only the edits of the selected kind (not the hidden rows of the other one; blocking
// none), without empty edit rows.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.savedRule} */
export function savedRule(rule) {
	return {
		...rule,
		headers: rule.kind === "headers" ? rule.headers.filter((edit) => !isBlankHeader(edit)) : [],
		params: rule.kind === "params" ? rule.params.filter((edit) => !isBlankParam(edit)) : [],
	};
}

// The content of a rule for comparing a card with the stored rule — without the folder name: the card takes it from the
// bookmark tree once it loads, the stored one is the name at the time of saving.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.ruleContent} */
export function ruleContent(rule) {
	return JSON.stringify({ ...normalizeRules([savedRule(rule)])[0], folderTitle: "" });
}

// "Show the rule in JSON": the declarativeNetRequest rules one rule makes — the same conversion as in the background part
// (compileRules(), buildNetworkRules() of rules.mjs) — written as the static rules of an extension (the content of a file
// declarative_net_request.rule_resources of manifest.json points to): each with an id from 1 in the order of the listing,
// the priority of the rule alone (1 — in the extension the order of the list decides and the core shifts it above its bulk
// layer), the action and the condition. Only what this rule does: a turned-off rule as if it were on (the listing shows what
// it does). available: the request types the browser knows (the groups "images", "WebSocket" and "Other" differ between
// Chrome and Firefox). folderUrls: the addresses of the bookmarks in the folder of the rule (also in its subfolders — what
// declarativeNetRequest.getFolderUrls gives, the same the conversion in the background part takes); without them (null — not
// read) the rule has nothing from the folder. extensionHost: the host of this extension from the answer of the background part
// (RulesView) — "except the requests of this extension" puts it among excludedInitiatorDomains; without it (null) nothing.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.manifestRules} */
export function manifestRules(rule, available, folderUrls = null, extensionHost = null) {
	const bookmarkUrls = new Map(rule.folderId && folderUrls ? [[rule.folderId, folderUrls]] : []);
	const compiled = compileRules([{ ...rule, enabled: true }], bookmarkUrls, extensionHost);
	return buildNetworkRules(compiled, available).map((networkRule, index) => ({
		id: index + 1,
		priority: networkRule.priority ?? 1,
		action: networkRule.action,
		condition: networkRule.condition,
	}));
}

// The notes of the JSON of a card with a bookmark folder (renderJson()) by what the editor knows about its bookmarks: loaded —
// how many of them the listing has (only those with an http(s) address, as the folder has them now: a static rule in
// manifest.json does not follow later changes of the folder, the conversion here takes them again after every change), with
// "whole domain" that it has their domains, and how many have another address (a bookmarklet) no rule targets;
// a folder without bookmarks; while they load; otherwise that the listing has none of them and why — the function
// declarativeNetRequest.getFolderUrls is denied, the permission to bookmarks is missing, the folder cannot be read (deleted).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.folderNotes} */
export function folderNotes(rule, bookmarks) {
	const title = rule.folderTitle || rule.folderId;
	if (bookmarks.state === "loading") return [t("declarativeNetRequestSandbox_editor_json_folder_loading", title)];
	if (bookmarks.state === "loaded") {
		if (bookmarks.urls.length === 0) return [t("declarativeNetRequestSandbox_editor_json_folder_no_bookmarks", title)];
		// Only http(s) addresses get into the rule (pageKey() — the same as compileRules()); a bookmarklet does not.
		const listed = bookmarks.urls.filter((url) => pageKey(url) !== null).length;
		const skipped = bookmarks.urls.length - listed;
		/** @type {string[]} */
		const lines = [];
		if (listed > 0) lines.push(tp("declarativeNetRequestSandbox_editor_json_folder_bookmarks", listed, title));
		if (listed > 0 && rule.wholeDomain) lines.push(t("declarativeNetRequestSandbox_editor_json_folder_whole_domain"));
		if (skipped > 0) lines.push(tp("declarativeNetRequestSandbox_editor_json_folder_skipped", skipped, title));
		return lines;
	}
	const reason =
		bookmarks.state === "denied"
			? t("declarativeNetRequestSandbox_editor_json_folder_denied")
			: bookmarks.state === "permission"
				? t("declarativeNetRequestSandbox_editor_folder_needs_permission")
				: bookmarks.state === "missing"
					? t("declarativeNetRequestSandbox_editor_json_folder_missing")
					: t("declarativeNetRequestSandbox_editor_json_folder_failed", bookmarks.error);
	return [t("declarativeNetRequestSandbox_editor_json_folder", title), reason];
}

// The warning of a card whose rule needs regular expressions (regexFilter) in the browser instead of urlFilter — the browser
// evaluates them more slowly and allows an extension only a limited number of them. The lines of the box below "Which
// requests" and "Where" (validateRow()), empty = no box: how many of the declarativeNetRequest rules of the card have one
// (manifestRules() — without the bookmarks of a folder) and why (regexReasons() of rules.mjs: addresses and patterns with
// | or ^, names of parameters urlFilter cannot write; none of them = too many addresses for urlFilter), and for a rule that
// only removes parameters with a bookmark folder that its bookmarks get urlFilter only while the module has room for it
// (how it turned out the summary of the card says after saving, browserText()). The names of parameters also without
// another target — the bookmarks of the folder get the regular expression too.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.regexNotes} */
export function regexNotes(rule, available) {
	const count = manifestRules(rule, available).filter((networkRule) => !!networkRule.condition.regexFilter).length;
	const reasons = regexReasons(rule);
	/** @type {string[]} */
	const lines = [];
	if (count > 0) lines.push(tp("declarativeNetRequestSandbox_editor_regex", count));
	if (count > 0 || rule.folderId) {
		if (reasons.addresses.length > 0) lines.push(t("declarativeNetRequestSandbox_editor_regex_addresses", reasons.addresses.join(", ")));
		if (reasons.patterns.length > 0) lines.push(t("declarativeNetRequestSandbox_editor_regex_patterns", reasons.patterns.join(", ")));
		if (reasons.paramNames.length > 0) lines.push(t("declarativeNetRequestSandbox_editor_regex_param_names", reasons.paramNames.join(", ")));
		if (reasons.privateAddresses) lines.push(t("declarativeNetRequestSandbox_editor_regex_private", String(NOT_PRIVATE_HOST_PARTS.length)));
	}
	if (count > 0 && lines.length === 1) lines.push(t("declarativeNetRequestSandbox_editor_regex_budget", String(PAGE_FILTER_BUDGET)));
	if (reasons.folder) lines.push(t("declarativeNetRequestSandbox_editor_regex_folder", String(PAGE_FILTER_BUDGET)));
	return lines;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.errorText} */
function errorText(err) {
	return err instanceof Error ? err.message : String(err);
}

// A label with a field: text above the field, the field inside the <label>.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.labeled} */
function labeled(text, control, hint) {
	const label = document.createElement("label");
	label.className = "dnr-field";
	const caption = document.createElement("span");
	caption.className = "dnr-field-caption";
	caption.textContent = text;
	label.appendChild(caption);
	if (hint) {
		const small = document.createElement("small");
		small.textContent = hint;
		label.appendChild(small);
	}
	label.appendChild(control);
	return label;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.textarea} */
function textarea(value, placeholder) {
	const area = document.createElement("textarea");
	area.rows = 3;
	area.spellcheck = false;
	area.value = value;
	area.placeholder = placeholder;
	return area;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.section} */
function section(className, title, hint) {
	const box = document.createElement("div");
	box.className = `dnr-rule-section ${className}`;
	const heading = document.createElement("div");
	heading.className = "dnr-rule-section-title";
	heading.textContent = title;
	box.appendChild(heading);
	if (hint) {
		const small = document.createElement("small");
		small.className = "dnr-section-hint";
		small.textContent = hint;
		box.appendChild(small);
	}
	return box;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.message} */
function message() {
	const box = document.createElement("div");
	box.className = "dnr-editor-message";
	box.setAttribute("aria-live", "polite");
	return box;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.select} */
function select(values, labels, value, ariaLabel) {
	const element = document.createElement("select");
	element.setAttribute("aria-label", ariaLabel);
	element.replaceChildren(...values.map((item) => new Option(labels[item], item)));
	element.value = value;
	return element;
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.datalist} */
function datalist(id, names) {
	const list = document.createElement("datalist");
	list.id = id;
	list.replaceChildren(...names.map((name) => new Option(name, name)));
	return list;
}

// The × button (remove a rule or an edit row).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.removeButton} */
function removeButton(label) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "dnr-remove";
	button.textContent = "×";
	button.title = label;
	button.setAttribute("aria-label", label);
	return button;
}

// A safeguard against removing a rule by accident: the first click on the × only asks — the button turns red with "Really?"
// and the title "Press again to confirm" —, the second one within CONFIRM_MS runs onConfirm. The button goes back after the
// time runs out or when the focus leaves it. While it asks, its name is the text "Really?" (without the aria-label of the ×).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.requireSecondClick} */
function requireSecondClick(button, onConfirm) {
	const text = button.textContent;
	const title = button.title;
	const ariaLabel = button.getAttribute("aria-label") || "";
	/** @type {ReturnType<typeof setTimeout> | null} */
	let confirmTimer = null;
	const reset = () => {
		if (confirmTimer) clearTimeout(confirmTimer);
		confirmTimer = null;
		button.textContent = text;
		button.title = title;
		button.setAttribute("aria-label", ariaLabel);
		button.classList.remove("dnr-remove--confirm");
	};
	button.addEventListener("click", () => {
		if (!confirmTimer) {
			button.textContent = t("declarativeNetRequestSandbox_editor_remove_confirm");
			button.title = t("declarativeNetRequestSandbox_editor_remove_confirm_title");
			button.removeAttribute("aria-label");
			button.classList.add("dnr-remove--confirm");
			confirmTimer = setTimeout(reset, CONFIRM_MS);
			return;
		}
		reset();
		onConfirm();
	});
	button.addEventListener("blur", () => {
		if (confirmTimer) reset();
	});
}

// A text field of an edit row (name or value).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.textInput} */
function textInput(className, value, placeholder, ariaLabel) {
	const input = document.createElement("input");
	input.type = "text";
	input.className = className;
	input.spellcheck = false;
	input.autocomplete = "off";
	input.value = value;
	input.placeholder = placeholder;
	input.setAttribute("aria-label", ariaLabel);
	return input;
}

// Whether the notifications of a rule with "Notify …" can come (the line below the checkbox): without onRuleMatchedDebug
// (Firefox, Chrome with a packed extension) only blocking rules and the rules redirecting to HTTPS are announced — the
// background part infers them from requests an extension blocked and requests the browser redirected to https (webRequest).
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.notifyText} */
export function notifyText(view, kind) {
	const { notify } = view;
	const requests = !notify.feedback;
	if (notifyAsks(view, kind)) return t(requests ? "declarativeNetRequestSandbox_notify_requests_ask" : "declarativeNetRequestSandbox_notify_ask");
	if (!notify.supported) return t("declarativeNetRequestSandbox_notify_unsupported");
	if (requests && kind !== "block" && kind !== "upgrade") return t("declarativeNetRequestSandbox_notify_feedback_unavailable");
	if (notify.permission === "denied") return t("declarativeNetRequestSandbox_notify_blocked");
	if (!requests) return t("declarativeNetRequestSandbox_notify_granted");
	return t(kind === "upgrade" ? "declarativeNetRequestSandbox_notify_upgraded_granted" : "declarativeNetRequestSandbox_notify_requests_granted");
}

// Whether a permission a button can ask for is what the notifications of a rule of the kind miss.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.notifyAsks} */
export function notifyAsks(view, kind) {
	const { notify, permissions } = view;
	if (!notify.supported) return false;
	const requests = !notify.feedback;
	if (requests && kind !== "block" && kind !== "upgrade") return false;
	if (notify.permission === "granted" && (requests ? permissions.webRequest : permissions.feedback)) return false;
	return !(notify.permission === "denied" && permissions.notifications);
}

// Whether a rule with "Into the own event log" can write into it (the line below the checkboxes): the same following of the
// applied rules as for the notifications, only without the permission for notifications.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.logText} */
export function logText(view, kind) {
	const requests = !view.notify.feedback;
	if (logAsks(view, kind)) return t(requests ? "declarativeNetRequestSandbox_log_requests_ask" : "declarativeNetRequestSandbox_log_ask");
	if (requests && kind !== "block" && kind !== "upgrade") return t("declarativeNetRequestSandbox_log_feedback_unavailable");
	if (!requests) return t("declarativeNetRequestSandbox_log_granted");
	return t(kind === "upgrade" ? "declarativeNetRequestSandbox_log_upgraded_granted" : "declarativeNetRequestSandbox_log_requests_granted");
}

// Whether a permission a button can ask for is what the log of a rule of the kind misses.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.logAsks} */
export function logAsks(view, kind) {
	const { notify, permissions } = view;
	const requests = !notify.feedback;
	if (requests && kind !== "block" && kind !== "upgrade") return false;
	return !(requests ? permissions.webRequest : permissions.feedback);
}

// How the stored rules turned out in the browser (the conversion in the background part) — the line at the top.
/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.statusText} */
export function statusText(status) {
	if (status.reason === "disabled") return { text: t("declarativeNetRequestSandbox_status_disabled"), problem: true };
	if (status.reason === "notListed") return { text: t("declarativeNetRequestSandbox_status_not_listed"), problem: true };
	if (status.reason === "unavailable") return { text: t("declarativeNetRequestSandbox_status_unavailable"), problem: true };
	if (status.reason === "error") return { text: t("declarativeNetRequestSandbox_status_error", status.error || ""), problem: true };
	return { text: tp("declarativeNetRequestSandbox_status_active", status.active), problem: false };
}

/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.createRulesEditor} */
export function createRulesEditor({ load, save, folderUrls, openPermissions, onView, onPermissionNeeds, onUnsaved }) {
	editorCount += 1;
	/** @type {Record<Types.DeclarativeNetRequest.Direction, string>} */
	const datalistIds = { request: `dnr-request-headers-${editorCount}`, response: `dnr-response-headers-${editorCount}` };
	const paramsDatalistId = `dnr-params-${editorCount}`;

	const root = document.createElement("div");
	root.className = "dnr-editor";

	const hint = document.createElement("div");
	hint.className = "dnr-editor-hint";
	hint.textContent = t("declarativeNetRequestSandbox_editor_hint");

	// The user's notes between "/*" and "*/" in the text fields (parseComments() of rules.mjs).
	const commentsHint = document.createElement("div");
	commentsHint.className = "dnr-editor-hint";
	commentsHint.textContent = t("declarativeNetRequestSandbox_editor_comments_hint");

	const notice = document.createElement("div");
	notice.className = "dnr-editor-notice";
	notice.textContent = t("declarativeNetRequestSandbox_editor_loading");

	const list = document.createElement("div");
	list.className = "dnr-rules";

	const empty = document.createElement("div");
	empty.className = "dnr-editor-hint";
	empty.textContent = t("declarativeNetRequestSandbox_editor_empty");
	empty.hidden = true;

	const addButton = document.createElement("button");
	addButton.type = "button";
	addButton.className = "dnr-add";
	addButton.textContent = t("declarativeNetRequestSandbox_editor_add");
	addButton.disabled = true;

	// What happened with the last saving ("Save module settings") — or that the cards differ from the stored rules.
	const actions = document.createElement("div");
	actions.className = "dnr-editor-actions";
	const saved = document.createElement("span");
	saved.className = "dnr-editor-saved";
	saved.setAttribute("role", "status");
	actions.append(saved);

	// The notice first — right below the buttons of the core for the permissions it says are missing.
	root.append(
		notice,
		hint,
		commentsHint,
		datalist(datalistIds.request, COMMON_REQUEST_HEADERS),
		datalist(datalistIds.response, COMMON_RESPONSE_HEADERS),
		datalist(paramsDatalistId, COMMON_PARAMS),
		list,
		empty,
		addButton,
		actions
	);

	/** @type {Record<Types.DeclarativeNetRequest.RuleKind, string>} */
	const kindLabels = {
		headers: t("declarativeNetRequestSandbox_kind_headers"),
		params: t("declarativeNetRequestSandbox_kind_params"),
		block: t("declarativeNetRequestSandbox_kind_block"),
		upgrade: t("declarativeNetRequestSandbox_kind_upgrade"),
	};
	/** @type {Record<Types.DeclarativeNetRequest.Protocol, string>} */
	const protocolLabels = {
		any: t("declarativeNetRequestSandbox_protocol_any"),
		http: t("declarativeNetRequestSandbox_protocol_http"),
		https: t("declarativeNetRequestSandbox_protocol_https"),
	};
	/** @type {Record<Types.DeclarativeNetRequest.Direction, string>} */
	const directionLabels = { request: t("declarativeNetRequestSandbox_direction_request"), response: t("declarativeNetRequestSandbox_direction_response") };
	/** @type {Record<Types.DeclarativeNetRequest.Operation, string>} */
	const operationLabels = {
		remove: t("declarativeNetRequestSandbox_operation_remove"),
		set: t("declarativeNetRequestSandbox_operation_set"),
		append: t("declarativeNetRequestSandbox_operation_append"),
	};
	/** @type {Record<Types.DeclarativeNetRequest.ParamOperation, string>} */
	const paramOperationLabels = { remove: t("declarativeNetRequestSandbox_operation_remove"), set: t("declarativeNetRequestSandbox_operation_set") };

	/** @type {Types.DeclarativeNetRequestSandbox.RuleEditorRow[]} */
	const rows = [];
	// The last answer of the background part (null — not loaded yet): the permissions and the notifications.
	/** @type {Types.DeclarativeNetRequest.RulesView | null} */
	let view = null;
	// Folders of the bookmark tree, as soon as the tree can be read (null = not yet, or without the permission).
	/** @type {Types.DeclarativeNetRequest.BookmarkFolder[] | null} */
	let folders = null;
	let hasBookmarks = false;
	// declarativeNetRequest rules of the stored rules in the browser (refreshView()), null = not known. While the next load
	// runs (after saving the conversion and the core take a moment) the cards do not show the old numbers.
	/** @type {Types.DeclarativeNetRequestSandbox.BrowserCounts | null} */
	let browserCounts = null;
	let browserCountsPending = false;
	// The stored rules the cards show (takeOver()) — rule id → content, and the stored list (JSON and the contents in
	// order, for "unsaved changes"); the defaults until the first saving.
	/** @type {Map<string, string>} */
	let baseline = new Map();
	let storedJson = "";
	let storedContent = "";
	// The result of the last successful saving (empty — none, or the cards were changed since then).
	let savedText = "";
	// The bookmarks of the folders whose cards show their JSON (bookmarksOf()): folder id → being loaded, the addresses, or why
	// not. Read again after a change of the bookmarks or of the permissions (onChange()) and when a card shows its JSON;
	// a load that started before the last forgetting is not used (folderGeneration).
	/** @type {Map<string, Types.DeclarativeNetRequestSandbox.FolderBookmarks>} */
	const folderBookmarks = new Map();
	let folderGeneration = 0;

	// The lines below "Notify …" of a card — one for the notification and one for the log, each only while it is checked.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.refreshNotifyStatus} */
	function refreshNotifyStatus(row) {
		const kind = /** @type {Types.DeclarativeNetRequest.RuleKind} */ (row.kindSelect.value);
		row.notifyStatus.hidden = !row.notifyMatchedInput.checked || !view;
		row.notifyStatus.textContent = view && !row.notifyStatus.hidden ? notifyText(view, kind) : "";
		row.logStatus.hidden = !row.logMatchedInput.checked || !view;
		row.logStatus.textContent = view && !row.logStatus.hidden ? logText(view, kind) : "";
	}

	// The row's folder name: from the bookmark tree, otherwise the stored one.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.folderTitleOf} */
	const folderTitleOf = (row) => {
		const folder = folders && folders.find((item) => item.id === row.folderSelect.value);
		return folder ? folder.title : row.folderSelect.value === row.storedFolderId ? row.storedFolderTitle : "";
	};

	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.readHeader} */
	const readHeader = (headerRow) => ({
		direction: /** @type {Types.DeclarativeNetRequest.Direction} */ (headerRow.directionSelect.value),
		header: headerRow.headerInput.value.trim(),
		operation: /** @type {Types.DeclarativeNetRequest.Operation} */ (headerRow.operationSelect.value),
		value: headerRow.valueInput.value,
	});

	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.readParam} */
	const readParam = (paramRow) => ({
		param: paramRow.paramInput.value.trim(),
		operation: /** @type {Types.DeclarativeNetRequest.ParamOperation} */ (paramRow.operationSelect.value),
		value: paramRow.valueInput.value,
		...(paramRow.andInput ? { andParam: paramRow.andInput.value.trim() } : {}),
	});

	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.readRow} */
	const readRow = (row) => ({
		id: row.id,
		title: row.titleInput.value.trim(),
		enabled: row.enabledInput.checked,
		notifyMatched: row.notifyMatchedInput.checked,
		logMatched: row.logMatchedInput.checked,
		closedInOverview: row.closedInOverviewInput.checked,
		color: row.colorChosen ? row.colorInput.value : "",
		protocol: /** @type {Types.DeclarativeNetRequest.Protocol} */ (row.protocolSelect.value),
		kind: /** @type {Types.DeclarativeNetRequest.RuleKind} */ (row.kindSelect.value),
		headers: row.headerRows.map(readHeader),
		params: row.paramRows.map(readParam),
		parts: PART_KEYS.filter((key) => row.partInputs[key].checked),
		domains: row.domainsInput.value,
		pages: row.pagesInput.value,
		folderId: row.folderSelect.value,
		folderTitle: folderTitleOf(row),
		wholeDomain: row.wholeDomainInput.checked,
		exceptDomains: row.exceptDomainsInput.value,
		exceptPrivate: row.exceptPrivateInput.checked,
		exceptExtension: row.exceptExtensionInput.checked,
	});

	// The rules of the cards as they are saved (empty rules and empty edit rows are skipped).
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.getValue} */
	const getValue = () => normalizeRules(rows.map(readRow).map(savedRule).filter((rule) => !isEmptyRule(rule)));

	// The row's folder menu: of the bookmark tree, and the stored folder that
	// cannot be found in the tree (deleted, or the tree cannot be read).
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.fillFolders} */
	function fillFolders(row) {
		const selected = row.folderSelect.options.length > 0 ? row.folderSelect.value : row.storedFolderId;
		const placeholder = new Option(t("declarativeNetRequestSandbox_editor_no_folder"), "");
		const options = (folders || []).map((folder) => new Option(folder.label, folder.id));
		if (selected && !options.some((option) => option.value === selected)) {
			const label = row.storedFolderTitle || selected;
			options.push(new Option(folders ? t("declarativeNetRequestSandbox_editor_folder_not_found", label) : label, selected));
		}
		row.folderSelect.replaceChildren(placeholder, ...options);
		row.folderSelect.value = selected;
	}

	// Checking how one rule is written — messages below the parts and marking the fields.
	// Shows the form part by the rule kind; messages only for the selected kind. The checks take the rule without the
	// comments of its fields (plain — withoutComments() of rules.mjs, the same as the conversion); a comment without "*/"
	// and "/*" glued to an address or a value (commentProblems()) the card says below the part, for the name at the name.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.validateRow} */
	function validateRow(row) {
		const rule = readRow(row);
		const plain = withoutComments(rule);
		const empty = isEmptyRule(rule);
		const params = rule.kind === "params";
		const block = rule.kind === "block";
		const upgrade = rule.kind === "upgrade";
		row.headersPart.hidden = rule.kind !== "headers";
		row.paramsPart.hidden = !params;
		row.blockPart.hidden = !block;
		row.upgradePart.hidden = !upgrade;
		row.scriptsNote.hidden = !block;
		// The upgrade to HTTPS targets only http:// (ruleProtocol() of rules.mjs) — the choice of the protocol stays hidden as it was.
		row.protocolField.hidden = upgrade;

		/** @type {Record<Types.DeclarativeNetRequest.HeaderProblem, string[]>} */
		const problems = { name: [], value: [], valueChars: [], append: [] };
		// The comments of the edit rows of each kind: the rows with a comment without "*/", the values with "/*" glued to the text.
		/** @type {Record<"headers" | "params", { unclosed: string[], glued: string[] }>} */
		const editComments = { headers: { unclosed: [], glued: [] }, params: { unclosed: [], glued: [] } };
		row.headerRows.forEach((headerRow, index) => {
			const edit = plain.headers[index];
			const written = rule.headers[index];
			const problem = isBlankHeader(edit) ? null : headerProblem(edit);
			const label = edit.header || t("declarativeNetRequestSandbox_editor_header_untitled", String(index + 1));
			if (problem) problems[problem].push(label);
			// The value of a removal is not used (the field is disabled) — nor are its comments.
			const name = commentProblems(written.header, false);
			const value = edit.operation === "remove" ? { unclosed: false, glued: [] } : commentProblems(written.value, true);
			if (name.unclosed || value.unclosed) editComments.headers.unclosed.push(label);
			editComments.headers.glued.push(...value.glued);
			headerRow.headerInput.classList.toggle("dnr-invalid", problem === "name" || name.unclosed);
			headerRow.valueInput.classList.toggle("dnr-invalid", problem === "value" || problem === "valueChars" || value.unclosed || value.glued.length > 0);
			headerRow.operationSelect.classList.toggle("dnr-invalid", problem === "append");
			headerRow.valueInput.disabled = edit.operation === "remove";
			headerRow.headerInput.setAttribute("list", datalistIds[edit.direction]);
		});
		/** @type {string[]} */
		const missingParams = [];
		/** @type {string[]} */
		const samePairs = [];
		row.paramRows.forEach((paramRow, index) => {
			const edit = plain.params[index];
			const written = rule.params[index];
			const problem = isBlankParam(edit) ? null : paramProblem(edit);
			const label = t("declarativeNetRequestSandbox_editor_header_untitled", String(index + 1));
			if (problem === "sameName") samePairs.push(edit.param);
			else if (problem) missingParams.push(label);
			const name = commentProblems(written.param, false);
			const andName = commentProblems(written.andParam ?? "", false);
			const value = edit.operation === "remove" ? { unclosed: false, glued: [] } : commentProblems(written.value, true);
			if (name.unclosed || andName.unclosed || value.unclosed) editComments.params.unclosed.push(edit.param || label);
			editComments.params.glued.push(...value.glued);
			paramRow.paramInput.classList.toggle("dnr-invalid", problem === "name" || name.unclosed);
			paramRow.andInput?.classList.toggle("dnr-invalid", problem === "andName" || problem === "sameName" || andName.unclosed);
			paramRow.valueInput.classList.toggle("dnr-invalid", value.unclosed || value.glued.length > 0);
			paramRow.valueInput.disabled = edit.operation === "remove";
		});
		/** @type {string[]} */
		const what = [];
		if (params) {
			if (missingParams.length > 0) what.push(t("declarativeNetRequestSandbox_editor_missing_params", missingParams.join(", ")));
			if (samePairs.length > 0) what.push(t("declarativeNetRequestSandbox_editor_same_pair_params", samePairs.join(", ")));
			// Set value next to a related parameter — a redirect that changes nothing may stop the others (paramsShadowed()).
			if (paramsShadowed(validParams(plain))) what.push(t("declarativeNetRequestSandbox_editor_pair_shadowed"));
		} else if (rule.kind === "headers") {
			if (problems.name.length > 0) what.push(t("declarativeNetRequestSandbox_editor_invalid_names", problems.name.join(", ")));
			if (problems.value.length > 0) what.push(t("declarativeNetRequestSandbox_editor_missing_values", problems.value.join(", ")));
			if (problems.valueChars.length > 0) what.push(t("declarativeNetRequestSandbox_editor_invalid_values", problems.valueChars.join(", ")));
			if (problems.append.length > 0) {
				what.push(t("declarativeNetRequestSandbox_editor_append_not_allowed", problems.append.join(", "), REQUEST_APPEND_HEADERS.join(", ")));
			}
		}
		if (params || rule.kind === "headers") {
			const comments = editComments[params ? "params" : "headers"];
			if (comments.unclosed.length > 0) what.push(t("declarativeNetRequestSandbox_editor_comment_unclosed", comments.unclosed.join(", ")));
			if (comments.glued.length > 0) what.push(t("declarativeNetRequestSandbox_editor_comment_glued", comments.glued.join(", ")));
		}
		if (!empty && !hasValidEdits(plain)) what.push(t("declarativeNetRequestSandbox_editor_no_edits"));
		row.whatMessage.textContent = what.join(" ");

		// A parameter rule and the upgrade to HTTPS do not change WebSocket (kindPartKeys() of rules.mjs) — the checkbox stays as
		// it was, it just cannot be changed.
		const websocket = row.partInputs.websocket;
		websocket.disabled = params || upgrade;
		/** @type {HTMLElement} */ (websocket.parentElement).title = t(
			params
				? "declarativeNetRequestSandbox_part_websocket_params_title"
				: upgrade
					? "declarativeNetRequestSandbox_part_websocket_upgrade_title"
					: "declarativeNetRequestSandbox_part_websocket_title"
		);
		row.partsMessage.textContent = !empty && ruleParts(plain).length === 0 ? t("declarativeNetRequestSandbox_editor_no_parts") : "";
		// The same for "Except private and local IP addresses" (exceptsPrivate() of rules.mjs).
		row.exceptPrivateInput.disabled = params;
		/** @type {HTMLElement} */ (row.exceptPrivateInput.parentElement).title = params
			? t("declarativeNetRequestSandbox_editor_except_private_params_title")
			: t("declarativeNetRequestSandbox_editor_except_private_title", PRIVATE_RANGES.join(", "));
		const pagesHint = t(params ? "declarativeNetRequestSandbox_editor_pages_hint_params" : "declarativeNetRequestSandbox_editor_pages_hint");
		if (row.pagesHint.textContent !== pagesHint) row.pagesHint.textContent = pagesHint;

		const badDomains = invalidDomains(plain.domains);
		const badPages = parsePageList(plain.pages, params).invalid;
		const badExcept = invalidDomains(plain.exceptDomains);
		const domainsComments = commentProblems(rule.domains, false);
		const pagesComments = commentProblems(rule.pages, true);
		const exceptComments = commentProblems(rule.exceptDomains, false);
		const unclosedFields = [
			...(domainsComments.unclosed ? [t("declarativeNetRequestSandbox_editor_domains")] : []),
			...(pagesComments.unclosed ? [t("declarativeNetRequestSandbox_editor_pages")] : []),
			...(exceptComments.unclosed ? [t("declarativeNetRequestSandbox_editor_except_domains")] : []),
		];
		/** @type {string[]} */
		const where = [];
		if (badDomains.length > 0) where.push(t("declarativeNetRequestSandbox_editor_invalid_domains", badDomains.join(", ")));
		if (badPages.length > 0) where.push(t("declarativeNetRequestSandbox_editor_invalid_pages", badPages.join(", ")));
		if (badExcept.length > 0) where.push(t("declarativeNetRequestSandbox_editor_invalid_except_domains", badExcept.join(", ")));
		if (unclosedFields.length > 0) where.push(t("declarativeNetRequestSandbox_editor_comment_unclosed", unclosedFields.join(", ")));
		if (pagesComments.glued.length > 0) where.push(t("declarativeNetRequestSandbox_editor_comment_glued", pagesComments.glued.join(", ")));
		const gaps = privateGaps(plain);
		if (gaps.length > 0) where.push(t("declarativeNetRequestSandbox_editor_except_private_gaps", gaps.join(", ")));
		if (rule.folderId && view && !hasBookmarks) where.push(t("declarativeNetRequestSandbox_editor_folder_needs_permission"));
		if (!empty && !ruleHasTargets(plain)) where.push(t("declarativeNetRequestSandbox_editor_no_targets"));
		row.whereMessage.textContent = where.join(" ");

		row.domainsInput.classList.toggle("dnr-invalid", badDomains.length > 0 || domainsComments.unclosed);
		row.pagesInput.classList.toggle("dnr-invalid", badPages.length > 0 || pagesComments.unclosed || pagesComments.glued.length > 0);
		row.exceptDomainsInput.classList.toggle("dnr-invalid", badExcept.length > 0 || exceptComments.unclosed);
		// A comment without "*/" in the name — the rest of the name is not in the overview (the title of the field says why).
		const titleUnclosed = parseComments(rule.title).unclosed;
		const titleProblem = titleUnclosed ? t("declarativeNetRequestSandbox_editor_comment_unclosed", t("declarativeNetRequestSandbox_editor_title_aria")) : "";
		row.titleInput.classList.toggle("dnr-invalid", titleUnclosed);
		if (row.titleInput.title !== titleProblem) row.titleInput.title = titleProblem;
		row.wholeDomainInput.disabled = !rule.folderId;
		row.card.classList.toggle("dnr-rule--disabled", !rule.enabled);
		row.colorInput.classList.toggle("dnr-rule-color--unset", !row.colorChosen);
		// The summary of collapsed details: the kind and number of edits (for blocking and the upgrade to HTTPS only
		// the kind — a row with only a comment does not count); a message in some part = the summary in red (otherwise it would
		// not be visible in a collapsed rule).
		const count = (params ? plain.params.filter((edit) => !isBlankParam(edit)) : plain.headers.filter((edit) => !isBlankHeader(edit))).length;
		row.detailsSummary.textContent =
			block || upgrade
				? t("declarativeNetRequestSandbox_editor_details_block", kindLabels[rule.kind])
				: t("declarativeNetRequestSandbox_editor_details", kindLabels[rule.kind], String(count));
		const browser = browserText(row, rule);
		if (browser) {
			const made = document.createElement("span");
			made.className = "dnr-rule-count";
			made.textContent = ` · ${browser}`;
			row.detailsSummary.appendChild(made);
		}
		row.detailsSummary.classList.toggle(
			"dnr-problem",
			[row.whatMessage, row.partsMessage, row.whereMessage].some((box) => box.textContent) || titleUnclosed || unsupportedCount(row) > 0
		);
		row.titleInput.placeholder = t("declarativeNetRequestSandbox_rule_untitled", String(rows.indexOf(row) + 1));
		renderLines(row.regexWarning, regexNotes(rule, availableTypes()));
		if (!row.jsonPanel.hidden) renderJson(row, rule);
	}

	// The request types of this browser for the conversion of a card (the JSON, the warning about regular expressions) — from
	// the background part (an older one does not send them — then the types both browsers know).
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.availableTypes} */
	function availableTypes() {
		return view && Array.isArray(view.resourceTypes) && view.resourceTypes.length > 0 ? view.resourceTypes : COMMON_RESOURCE_TYPES;
	}

	// Lines of text as the children of a box — only when they changed (the box is rendered with every input of the editor).
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.renderLines} */
	function renderLines(box, lines) {
		if (lines.join("\n") === [...box.children].map((item) => item.textContent).join("\n")) return;
		box.replaceChildren(
			...lines.map((line) => {
				const item = document.createElement("div");
				item.textContent = line;
				return item;
			})
		);
	}

	// The bookmarks of a folder for the JSON of a card: without the function declarativeNetRequest.getFolderUrls or the
	// permission to bookmarks why not, otherwise what the editor has — the first time it asks the background part (the cards
	// that show the JSON with the folder render again once the answer comes).
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.bookmarksOf} */
	function bookmarksOf(folderId) {
		if (!folderUrls) return { state: "denied" };
		if (!hasBookmarks) return { state: "permission" };
		const known = folderBookmarks.get(folderId);
		if (known) return known;
		const generation = folderGeneration;
		/** @type {Types.DeclarativeNetRequestSandbox.FolderBookmarks} */
		const loading = { state: "loading" };
		folderBookmarks.set(folderId, loading);
		folderUrls(folderId)
			.then(
				/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.bookmarksOf.loaded} */
				(urls) => (urls === null ? { state: "missing" } : { state: "loaded", urls }),
				/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.bookmarksOf.failed} */
				(err) => {
					console.warn("declarativeNetRequestSandbox: záložky složky nejde načíst:", err);
					return { state: "failed", error: errorText(err) };
				}
			)
			.then((result) => {
				if (generation !== folderGeneration || folderBookmarks.get(folderId) !== loading) return;
				folderBookmarks.set(folderId, result);
				for (const row of rows) if (!row.jsonPanel.hidden && row.folderSelect.value === folderId) renderJson(row, readRow(row));
			});
		return loading;
	}

	// The JSON of a card while it is shown (manifestRules()) — it follows every change of the card — with the notes above it:
	// a turned-off rule, a bookmark folder (folderNotes() — the listing has its bookmarks once they are loaded), a rule that
	// makes nothing yet (the messages of the parts say why), otherwise what the rule needs in manifest.json.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.renderJson} */
	function renderJson(row, rule) {
		const bookmarks = rule.folderId ? bookmarksOf(rule.folderId) : null;
		const networkRules = manifestRules(rule, availableTypes(), bookmarks && bookmarks.state === "loaded" ? bookmarks.urls : null, view?.extensionHost ?? null);
		const text = JSON.stringify(networkRules, null, 2);
		if (row.jsonOutput.value !== text) row.jsonOutput.value = text;
		row.jsonOutput.rows = Math.min(text.split("\n").length, JSON_MAX_ROWS);
		/** @type {string[]} */
		const notes = [];
		if (!rule.enabled) notes.push(t("declarativeNetRequestSandbox_editor_json_disabled"));
		if (bookmarks) notes.push(...folderNotes(rule, bookmarks));
		if (networkRules.length === 0) notes.push(t("declarativeNetRequestSandbox_editor_json_empty"));
		else {
			// Blocking and the upgrade to HTTPS need no access to the pages (verified in Chrome 154 and Firefox 159).
			notes.push(
				t(
					rule.kind === "block"
						? "declarativeNetRequestSandbox_editor_json_permissions_block"
						: rule.kind === "upgrade"
							? "declarativeNetRequestSandbox_editor_json_permissions_upgrade"
							: "declarativeNetRequestSandbox_editor_json_permissions_edit"
				)
			);
		}
		renderLines(row.jsonNotes, notes);
	}

	// How many declarativeNetRequest rules the stored rule of the card makes in the browser (refreshView(), after every
	// saving): nothing for a card not stored yet or when the rules do not apply; a card changed since the saving says the
	// number is of the stored version.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.browserText} */
	function browserText(row, rule) {
		if (!browserCounts || !Object.hasOwn(browserCounts.counts, row.id)) return "";
		if (browserCountsPending) return t("declarativeNetRequestSandbox_editor_browser_pending");
		const count = tp("declarativeNetRequestSandbox_editor_browser_count", browserCounts.counts[row.id]);
		const regex = browserCounts.regexCounts[row.id] || 0;
		const made = browserCounts.suspended.includes(row.id)
			? t("declarativeNetRequestSandbox_editor_browser_suspended")
			: regex > 0
				? t("declarativeNetRequestSandbox_editor_browser_regex", count, String(regex))
				: count;
		const unsupported = unsupportedCount(row);
		const text = unsupported > 0 ? t("declarativeNetRequestSandbox_editor_browser_unsupported", made, String(unsupported)) : made;
		return ruleContent(rule) === baseline.get(row.id) ? text : t("declarativeNetRequestSandbox_editor_browser_saved", text);
	}

	// How many declarativeNetRequest rules of the stored rule of the card the background part left out because the browser
	// cannot compile their regular expression (supportedNetworkRules() of background-script.mjs) — 0 while not known.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.unsupportedCount} */
	function unsupportedCount(row) {
		if (!browserCounts || browserCountsPending) return 0;
		return browserCounts.unsupportedCounts[row.id] || 0;
	}

	// Checking all cards and whether they differ from the stored rules (a rule changed, added — not an empty one, it is not
	// saved — or removed) — the element hears about it (the reminder above "Save module settings").
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.refresh} */
	function refresh() {
		rows.forEach(validateRow);
		empty.hidden = !view || rows.length > 0;
		if (!view) return;
		const changed = getValue().map(ruleContent).join("\n") !== storedContent;
		if (changed) savedText = "";
		saved.textContent = changed ? t("declarativeNetRequestSandbox_editor_unsaved") : savedText;
		saved.classList.remove("dnr-problem");
		onUnsaved(changed);
		refreshPermissionNeeds(view);
	}

	// What is missing according to the last answer of the background part and the checked options of the cards — also of a
	// card not saved yet, each checked option says it in its line.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.permissionNeeds} */
	function permissionNeeds(current) {
		/** @type {(row: Types.DeclarativeNetRequestSandbox.RuleEditorRow) => Types.DeclarativeNetRequest.RuleKind} */
		const kindOf = (row) => /** @type {Types.DeclarativeNetRequest.RuleKind} */ (row.kindSelect.value);
		return {
			rules: !current.permissions.headers,
			bookmarks: !current.permissions.bookmarks,
			notify: rows.some((row) => row.notifyMatchedInput.checked && notifyAsks(current, kindOf(row))),
			log: rows.some((row) => row.logMatchedInput.checked && logAsks(current, kindOf(row))),
			feedback: current.notify.feedback,
		};
	}

	// A change of what is missing goes to the element (the buttons of the core) and to the notice (the button of a module of a client).
	let lastNeeds = "";
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.refreshPermissionNeeds} */
	function refreshPermissionNeeds(current) {
		const needs = permissionNeeds(current);
		const json = JSON.stringify(needs);
		if (json === lastNeeds) return;
		lastNeeds = json;
		onPermissionNeeds(needs);
		renderNotice(current);
	}

	// The row of one header edit: direction, name (with suggestions), operation,
	// value, remove.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.addHeaderRow} */
	function addHeaderRow(row, edit) {
		const line = document.createElement("div");
		line.className = "dnr-edit";
		const directionSelect = select(DIRECTIONS, directionLabels, edit.direction, t("declarativeNetRequestSandbox_editor_direction_aria"));
		const headerInput = textInput(
			"dnr-edit-name",
			edit.header,
			edit.direction === "response" ? "Content-Security-Policy" : "User-Agent",
			t("declarativeNetRequestSandbox_editor_header_aria")
		);
		headerInput.setAttribute("list", datalistIds[edit.direction]);
		const operationSelect = select(OPERATIONS, operationLabels, edit.operation, t("declarativeNetRequestSandbox_editor_operation_aria"));
		const valueInput = textInput(
			"dnr-edit-value",
			edit.value,
			t("declarativeNetRequestSandbox_editor_value_placeholder"),
			t("declarativeNetRequestSandbox_editor_value_aria")
		);
		const remove = removeButton(t("declarativeNetRequestSandbox_editor_remove_header"));
		line.append(directionSelect, headerInput, operationSelect, valueInput, remove);
		row.headersBox.appendChild(line);

		/** @type {Types.DeclarativeNetRequestSandbox.HeaderEditorRow} */
		const headerRow = { line, directionSelect, headerInput, operationSelect, valueInput };
		row.headerRows.push(headerRow);
		directionSelect.addEventListener("change", () => {
			headerInput.placeholder = directionSelect.value === "response" ? "Content-Security-Policy" : "User-Agent";
		});
		remove.addEventListener("click", () => {
			row.headerRows.splice(row.headerRows.indexOf(headerRow), 1);
			line.remove();
			refresh();
		});
		return headerRow;
	}

	// The row of one GET parameter edit: name (with suggestions), operation,
	// value, remove. An edit with a related parameter ("and at the same time", andParam) has between the name and the
	// operation the words "and at the same time" and the second name — the operation and the value are for both.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.addParamRow} */
	function addParamRow(row, edit) {
		const line = document.createElement("div");
		line.className = "dnr-edit";
		const paramInput = textInput("dnr-edit-name", edit.param, "utm_source", t("declarativeNetRequestSandbox_editor_param_aria"));
		paramInput.setAttribute("list", paramsDatalistId);
		const operationSelect = select(PARAM_OPERATIONS, paramOperationLabels, edit.operation, t("declarativeNetRequestSandbox_editor_param_operation_aria"));
		const valueInput = textInput(
			"dnr-edit-value",
			edit.value,
			t("declarativeNetRequestSandbox_editor_value_placeholder"),
			t("declarativeNetRequestSandbox_editor_param_value_aria")
		);
		const remove = removeButton(t("declarativeNetRequestSandbox_editor_remove_header"));
		/** @type {HTMLInputElement | null} */
		let andInput = null;
		if (typeof edit.andParam === "string") {
			line.classList.add("dnr-edit--paired");
			const and = document.createElement("span");
			and.className = "dnr-edit-and";
			and.textContent = t("declarativeNetRequestSandbox_editor_param_and");
			andInput = textInput("dnr-edit-name", edit.andParam, "utm_medium", t("declarativeNetRequestSandbox_editor_param_and_aria"));
			andInput.setAttribute("list", paramsDatalistId);
			line.append(paramInput, and, andInput, operationSelect, valueInput, remove);
		} else {
			line.append(paramInput, operationSelect, valueInput, remove);
		}
		row.paramsBox.appendChild(line);

		/** @type {Types.DeclarativeNetRequestSandbox.ParamEditorRow} */
		const paramRow = { line, paramInput, andInput, operationSelect, valueInput };
		row.paramRows.push(paramRow);
		remove.addEventListener("click", () => {
			row.paramRows.splice(row.paramRows.indexOf(paramRow), 1);
			line.remove();
			refresh();
		});
		return paramRow;
	}

	// The "What to change" part for one rule kind: hint, edit rows
	// and a button for another row — with pairText next to it a button for a row with a related parameter.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.editsPart} */
	function editsPart(hintText, addText, pairText) {
		const part = document.createElement("div");
		part.className = "dnr-edits-part";
		const small = document.createElement("small");
		small.className = "dnr-section-hint";
		small.textContent = hintText;
		const box = document.createElement("div");
		box.className = "dnr-edits";
		/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.editsPart.button} */
		const button = (label) => {
			const element = document.createElement("button");
			element.type = "button";
			element.className = "dnr-add-edit";
			element.textContent = label;
			return element;
		};
		const buttons = document.createElement("div");
		buttons.className = "dnr-add-edits";
		const addLine = button(addText);
		const addPair = pairText ? button(pairText) : null;
		buttons.append(addLine, ...(addPair ? [addPair] : []));
		part.append(small, box, buttons);
		return { part, box, addLine, addPair };
	}

	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.addRow} */
	function addRow(rule, open = false) {
		const card = document.createElement("fieldset");
		card.className = "dnr-rule";

		// Header: enabled, title, the color of the rule (the line next to it in the overview; a rule without one shows the
		// picker dimmed), remove (after a second click — requireSecondClick()).
		const head = document.createElement("div");
		head.className = "dnr-rule-head";
		const enabledLabel = document.createElement("label");
		enabledLabel.className = "dnr-check";
		const enabledInput = document.createElement("input");
		enabledInput.type = "checkbox";
		enabledInput.checked = rule.enabled;
		enabledLabel.append(enabledInput, t("declarativeNetRequestSandbox_editor_enabled"));
		const titleInput = document.createElement("input");
		titleInput.type = "text";
		titleInput.className = "dnr-rule-title";
		titleInput.value = rule.title;
		titleInput.setAttribute("aria-label", t("declarativeNetRequestSandbox_editor_title_aria"));
		const colorInput = document.createElement("input");
		colorInput.type = "color";
		colorInput.className = "dnr-rule-color";
		colorInput.value = rule.color || UNSET_COLOR;
		colorInput.title = t("declarativeNetRequestSandbox_editor_color_title");
		colorInput.setAttribute("aria-label", t("declarativeNetRequestSandbox_editor_color_title"));
		const remove = removeButton(t("declarativeNetRequestSandbox_editor_remove"));
		head.append(enabledLabel, titleInput, colorInput, remove);

		// What to do: choosing the kind and below it the rows of header or GET
		// parameter edits, or the explanation of blocking or of the upgrade to HTTPS (validateRow() shows the part
		// according to the selection).
		const what = section("dnr-rule-what", t("declarativeNetRequestSandbox_editor_what"));
		const kindSelect = select(RULE_KINDS, kindLabels, rule.kind, t("declarativeNetRequestSandbox_editor_kind_aria"));
		kindSelect.classList.add("dnr-kind");
		/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.addRow.settingOption} */
		const settingOption = (checked, text) => {
			const label = document.createElement("label");
			label.className = "dnr-check";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.checked = checked;
			label.append(input, text);
			return { label, input };
		};
		/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.addRow.settingGroup} */
		const settingGroup = (heading, ...options) => {
			const group = document.createElement("div");
			group.className = "dnr-notify-setting";
			group.setAttribute("role", "group");
			group.setAttribute("aria-label", heading);
			const title = document.createElement("div");
			title.className = "dnr-notify-title";
			title.textContent = heading;
			const box = document.createElement("div");
			box.className = "dnr-notify-options";
			box.append(...options);
			group.append(title, box);
			return group;
		};
		// "Notify when the rule is applied" — a heading with the two ways below it: a silent notification and the module's own
		// event log (listed at the bottom of the overview); each checked one with a line on whether it can work.
		const byNotification = settingOption(rule.notifyMatched, t("declarativeNetRequestSandbox_setting_notify_notification"));
		const byLog = settingOption(rule.logMatched, t("declarativeNetRequestSandbox_setting_notify_log"));
		const notifyMatchedInput = byNotification.input;
		const logMatchedInput = byLog.input;
		const notifySetting = settingGroup(t("declarativeNetRequestSandbox_setting_notify_matched"), byNotification.label, byLog.label);
		const notifyStatus = document.createElement("div");
		notifyStatus.className = "dnr-notify-status";
		notifyStatus.hidden = true;
		const logStatus = document.createElement("div");
		logStatus.className = "dnr-notify-status";
		logStatus.hidden = true;
		notifySetting.append(notifyStatus, logStatus);
		// "List the rule in the overview" — "Closed": the rule starts folded in the overview of the page (_createRuleItem() of the element).
		const closedOption = settingOption(rule.closedInOverview, t("declarativeNetRequestSandbox_setting_overview_closed"));
		const closedInOverviewInput = closedOption.input;
		const overviewSetting = settingGroup(t("declarativeNetRequestSandbox_setting_overview"), closedOption.label);
		const headersPart = editsPart(t("declarativeNetRequestSandbox_editor_what_hint"), t("declarativeNetRequestSandbox_editor_add_header"));
		const paramsPart = editsPart(
			t("declarativeNetRequestSandbox_editor_params_hint"),
			t("declarativeNetRequestSandbox_editor_add_param"),
			t("declarativeNetRequestSandbox_editor_add_param_pair")
		);
		const blockPart = document.createElement("small");
		blockPart.className = "dnr-section-hint dnr-block-hint";
		blockPart.textContent = t("declarativeNetRequestSandbox_editor_block_hint");
		const upgradePart = document.createElement("small");
		upgradePart.className = "dnr-section-hint dnr-upgrade-hint";
		upgradePart.textContent = t("declarativeNetRequestSandbox_editor_upgrade_hint");
		const whatMessage = message();
		what.append(kindSelect, notifySetting, overviewSetting, headersPart.part, paramsPart.part, blockPart, upgradePart, whatMessage);

		// Which requests: the page and individual file kinds.
		const parts = section("dnr-rule-parts", t("declarativeNetRequestSandbox_editor_parts"), t("declarativeNetRequestSandbox_editor_parts_hint"));
		const protocolSelect = select(PROTOCOLS, protocolLabels, rule.protocol, t("declarativeNetRequestSandbox_protocol_aria"));
		const partsBox = document.createElement("div");
		partsBox.className = "dnr-parts";
		/** @type {Record<Types.DeclarativeNetRequest.PartKey, HTMLInputElement>} */
		const partInputs = /** @type {Record<Types.DeclarativeNetRequest.PartKey, HTMLInputElement>} */ ({});
		for (const key of PART_KEYS) {
			const label = document.createElement("label");
			label.className = "dnr-check";
			label.title = t(`declarativeNetRequestSandbox_part_${key}_title`);
			const input = document.createElement("input");
			input.type = "checkbox";
			input.checked = rule.parts.includes(key);
			label.append(input, t(`declarativeNetRequestSandbox_part_${key}`));
			partsBox.appendChild(label);
			partInputs[key] = input;
		}
		// Below the checkboxes, only for blocking (validateRow()): blocking "Scripts" stops only the JavaScript files the page
		// loads — inline scripts are not requests of their own and keep running; all of them stop with a header rule
		// (Content-Security-Policy: script-src 'none'), how to write it says the second line.
		const scriptsNote = document.createElement("div");
		scriptsNote.className = "dnr-scripts-note";
		scriptsNote.setAttribute("role", "note");
		for (const key of ["declarativeNetRequestSandbox_editor_block_scripts_note", "declarativeNetRequestSandbox_editor_block_scripts_csp"]) {
			const line = document.createElement("small");
			line.className = "dnr-section-hint";
			line.textContent = t(key);
			scriptsNote.appendChild(line);
		}
		const partsMessage = message();
		const protocolField = labeled(t("declarativeNetRequestSandbox_protocol_label"), protocolSelect);
		parts.append(protocolField, partsBox, scriptsNote, partsMessage);

		// Where: domains, addresses, a bookmark folder, "Except" domains.
		const where = section("dnr-rule-where", t("declarativeNetRequestSandbox_editor_where"));
		const domainsInput = textarea(rule.domains, "example.com\nnews.example.org");
		const pagesInput = textarea(rule.pages, "https://example.com/article\nhttps://cdn.example.com/*.js");
		const exceptDomainsInput = textarea(rule.exceptDomains, "intranet.example.com\nbank.example");
		const folderSelect = document.createElement("select");
		folderSelect.className = "dnr-folder";
		const wholeDomainLabel = document.createElement("label");
		wholeDomainLabel.className = "dnr-check";
		wholeDomainLabel.title = t("declarativeNetRequestSandbox_editor_whole_domain_title");
		const wholeDomainInput = document.createElement("input");
		wholeDomainInput.type = "checkbox";
		wholeDomainInput.checked = rule.wholeDomain;
		wholeDomainLabel.append(wholeDomainInput, t("declarativeNetRequestSandbox_editor_whole_domain"));
		// "Except private and local IP addresses" below the "Except" domains — the ranges in the title.
		const exceptPrivateLabel = document.createElement("label");
		exceptPrivateLabel.className = "dnr-check";
		const exceptPrivateInput = document.createElement("input");
		exceptPrivateInput.type = "checkbox";
		exceptPrivateInput.checked = rule.exceptPrivate;
		exceptPrivateLabel.append(exceptPrivateInput, t("declarativeNetRequestSandbox_editor_except_private"));
		// "Except the requests of this extension" below it — the browser applies the rules also to the extension's own fetch/XHR.
		const exceptExtensionLabel = document.createElement("label");
		exceptExtensionLabel.className = "dnr-check";
		exceptExtensionLabel.title = t("declarativeNetRequestSandbox_editor_except_extension_title");
		const exceptExtensionInput = document.createElement("input");
		exceptExtensionInput.type = "checkbox";
		exceptExtensionInput.checked = rule.exceptExtension;
		exceptExtensionLabel.append(exceptExtensionInput, t("declarativeNetRequestSandbox_editor_except_extension"));
		const whereMessage = message();
		// The hint for addresses is changed by validateRow() according to the rule kind.
		const pagesField = labeled(t("declarativeNetRequestSandbox_editor_pages"), pagesInput, t("declarativeNetRequestSandbox_editor_pages_hint"));
		where.append(
			labeled(t("declarativeNetRequestSandbox_editor_domains"), domainsInput, t("declarativeNetRequestSandbox_editor_domains_hint")),
			pagesField,
			labeled(t("declarativeNetRequestSandbox_editor_folder"), folderSelect, t("declarativeNetRequestSandbox_editor_folder_hint")),
			wholeDomainLabel,
			labeled(t("declarativeNetRequestSandbox_editor_except_domains"), exceptDomainsInput, t("declarativeNetRequestSandbox_editor_except_domains_hint")),
			exceptPrivateLabel,
			exceptExtensionLabel,
			whereMessage
		);

		// "Show the rule in JSON" at the bottom: the button shows and hides the declarativeNetRequest rules of the card
		// (renderJson()) — a read-only field the user copies from, with the notes above it.
		const json = document.createElement("div");
		json.className = "dnr-rule-json";
		const jsonButton = document.createElement("button");
		jsonButton.type = "button";
		jsonButton.className = "dnr-json-toggle";
		jsonButton.textContent = t("declarativeNetRequestSandbox_editor_json_show");
		jsonButton.setAttribute("aria-expanded", "false");
		const jsonPanel = document.createElement("div");
		jsonPanel.className = "dnr-json-panel";
		jsonPanel.hidden = true;
		const jsonHint = document.createElement("small");
		jsonHint.className = "dnr-section-hint";
		jsonHint.textContent = t("declarativeNetRequestSandbox_editor_json_hint");
		const jsonNotes = document.createElement("div");
		jsonNotes.className = "dnr-json-notes";
		const jsonOutput = document.createElement("textarea");
		jsonOutput.className = "dnr-json-output";
		jsonOutput.readOnly = true;
		jsonOutput.spellcheck = false;
		jsonOutput.wrap = "off";
		jsonOutput.setAttribute("aria-label", t("declarativeNetRequestSandbox_editor_json_aria"));
		jsonPanel.append(jsonHint, jsonNotes, jsonOutput);
		json.append(jsonButton, jsonPanel);

		// The rule needs regular expressions instead of urlFilter (regexNotes()) — empty = hidden.
		const regexWarning = document.createElement("div");
		regexWarning.className = "dnr-regex-warning";
		regexWarning.setAttribute("role", "note");

		// "What to change" across the whole width, below it "Which requests" and "Where" side by side, the warning about
		// regular expressions, at the bottom the JSON.
		const lower = document.createElement("div");
		lower.className = "dnr-rule-lower";
		lower.append(parts, where);
		const body = document.createElement("div");
		body.className = "dnr-rule-body";
		body.append(what, lower, regexWarning, json);
		const details = document.createElement("details");
		details.className = "dnr-rule-details";
		details.open = open;
		const detailsSummary = document.createElement("summary");
		details.append(detailsSummary, body);
		card.append(head, details);
		list.appendChild(card);

		/** @type {Types.DeclarativeNetRequestSandbox.RuleEditorRow} */
		const row = {
			id: rule.id,
			card,
			details,
			detailsSummary,
			enabledInput,
			titleInput,
			colorInput,
			colorChosen: rule.color !== "",
			nameColor: colorFromText(stripComments(rule.title).trim()),
			notifyMatchedInput,
			notifyStatus,
			logMatchedInput,
			logStatus,
			closedInOverviewInput,
			kindSelect,
			protocolSelect,
			protocolField,
			headersPart: headersPart.part,
			headersBox: headersPart.box,
			headerRows: [],
			paramsPart: paramsPart.part,
			paramsBox: paramsPart.box,
			paramRows: [],
			blockPart,
			upgradePart,
			partInputs,
			scriptsNote,
			domainsInput,
			pagesInput,
			pagesHint: /** @type {HTMLElement} */ (pagesField.querySelector("small")),
			folderSelect,
			wholeDomainInput,
			exceptDomainsInput,
			exceptPrivateInput,
			exceptExtensionInput,
			whatMessage,
			partsMessage,
			whereMessage,
			regexWarning,
			jsonButton,
			jsonPanel,
			jsonNotes,
			jsonOutput,
			storedFolderId: rule.folderId,
			storedFolderTitle: rule.folderTitle,
		};
		rows.push(row);
		// A new rule (and a kind the rule does not have yet) starts with one
		// empty edit row.
		for (const edit of rule.headers.length > 0 ? rule.headers : [emptyHeader()]) addHeaderRow(row, edit);
		for (const edit of rule.params.length > 0 ? rule.params : [emptyParam()]) addParamRow(row, edit);
		fillFolders(row);
		refreshNotifyStatus(row);
		notifyMatchedInput.addEventListener("change", () => refreshNotifyStatus(row));
		logMatchedInput.addEventListener("change", () => refreshNotifyStatus(row));
		kindSelect.addEventListener("change", () => refreshNotifyStatus(row));
		headersPart.addLine.addEventListener("click", () => {
			const headerRow = addHeaderRow(row, emptyHeader());
			refresh();
			headerRow.headerInput.focus();
		});
		paramsPart.addLine.addEventListener("click", () => {
			const paramRow = addParamRow(row, emptyParam());
			refresh();
			paramRow.paramInput.focus();
		});
		paramsPart.addPair?.addEventListener("click", () => {
			const paramRow = addParamRow(row, emptyParam(true));
			refresh();
			paramRow.paramInput.focus();
		});
		// The rule gets its color with the first pick (before the listeners of the editor check the card).
		for (const type of ["input", "change"]) {
			colorInput.addEventListener(type, () => {
				row.colorChosen = true;
			});
		}
		// The default color by the name: "change" comes when the user leaves the field after changing the name (or presses
		// Enter). A rule without a color, or with the color of its previous name, gets the color of the new one; a color the
		// user picked stays. An empty name changes nothing; a comment in the name does not count (stripComments()). The listener of the editor checks the card right after it.
		titleInput.addEventListener("change", () => {
			const color = colorFromText(stripComments(titleInput.value).trim());
			if (!color) return;
			if (!row.colorChosen || row.colorInput.value === row.nameColor) {
				row.colorInput.value = color;
				row.colorChosen = true;
			}
			row.nameColor = color;
		});
		requireSecondClick(remove, () => {
			removeRow(row);
			refresh();
		});
		jsonButton.addEventListener("click", () => {
			const show = jsonPanel.hidden;
			jsonPanel.hidden = !show;
			jsonButton.textContent = t(show ? "declarativeNetRequestSandbox_editor_json_hide" : "declarativeNetRequestSandbox_editor_json_show");
			jsonButton.setAttribute("aria-expanded", String(show));
			if (!show) return;
			// The bookmarks as the folder has them now (also without the listener of the changes).
			const rule = readRow(row);
			if (rule.folderId) folderBookmarks.delete(rule.folderId);
			renderJson(row, rule);
		});
		return row;
	}

	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.removeRow} */
	function removeRow(row) {
		rows.splice(rows.indexOf(row), 1);
		row.card.remove();
	}

	// The order of the cards is the priority of the rules — the list and the DOM together.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.moveRowBefore} */
	function moveRowBefore(row, before) {
		list.insertBefore(row.card, before.card);
		rows.splice(rows.indexOf(row), 1);
		rows.splice(rows.indexOf(before), 0, row);
	}

	// The stored rules the cards are compared with from now on.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.setStored} */
	function setStored(stored) {
		baseline = new Map(stored.map((rule) => [rule.id, ruleContent(rule)]));
		storedJson = JSON.stringify(stored);
		storedContent = stored.map(ruleContent).join("\n");
	}

	// Rules changed elsewhere while the editor is open — the button "Block the image permanently" of imageInfoSandbox
	// adds an address in the background part, another tab with Settings saves. Saving here would otherwise overwrite
	// them with what the editor showed. Rule by rule against the stored rules it took over last (baseline): a card the user
	// has not changed here since then gets the stored rule — or goes away with it; a card changed or added here stays
	// (saving stores it), and so does a rule removed here. A rule new elsewhere gets its card in its place in the stored order.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.takeOver} */
	function takeOver(stored) {
		const next = new Map(stored.map((rule) => [rule.id, ruleContent(rule)]));
		const shown = new Set(rows.map((row) => row.id));
		for (const row of [...rows]) {
			const base = baseline.get(row.id);
			if (base === undefined || ruleContent(readRow(row)) !== base) continue;
			const theirs = next.get(row.id);
			if (theirs === base) continue;
			const rule = stored.find((item) => item.id === row.id);
			if (rule) moveRowBefore(addRow(rule, row.details.open), row);
			removeRow(row);
		}
		stored.forEach((rule, index) => {
			if (shown.has(rule.id) || baseline.has(rule.id)) return;
			const row = addRow(rule);
			const following = stored
				.slice(index + 1)
				.map((item) => rows.find((other) => other.id === item.id))
				.find((other) => other && other !== row);
			if (following) moveRowBefore(row, following);
		});
		setStored(stored);
	}

	// The notice at the top: the missing permissions (the buttons of the core above it ask for them; openPermissions — a module
	// of a client — a button here that leads to the Settings of the client) and how the stored rules turned out in the browser.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.renderNotice} */
	function renderNotice(current) {
		notice.replaceChildren();
		/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.renderNotice.line} */
		const line = (text, problem = true) => {
			const item = document.createElement("div");
			item.classList.toggle("dnr-problem", problem);
			item.textContent = text;
			notice.appendChild(item);
			return item;
		};
		/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.renderNotice.missing} */
		const missing = (text) => {
			const item = line(text);
			if (!openPermissions) return;
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = t("declarativeNetRequestSandbox_editor_grant");
			button.addEventListener("click", openPermissions);
			item.append(" ", button);
		};
		if (!current.permissions.headers) missing(t("declarativeNetRequestSandbox_editor_missing_permission"));
		else if (current.browser) {
			const status = statusText(current.browser.status);
			line(status.text, status.problem);
		}
		if (!current.permissions.bookmarks) missing(t("declarativeNetRequestSandbox_editor_missing_bookmarks"));
		// The cards say this themselves — here only for the button that leads to the Settings of the client.
		if (openPermissions) {
			const { notify, log } = permissionNeeds(current);
			if (notify || log) missing(t("declarativeNetRequestSandbox_editor_missing_watch"));
		}
		notice.hidden = notice.childElementCount === 0;
	}

	// The rules, the permissions, the bookmark tree and the rule state from the background part — when the editor opens,
	// after every change the listener reports and after saving. The first answer creates the cards; the next ones take over
	// the rules stored elsewhere (only what is stored — the defaults until the first saving are not). Concurrent calls:
	// only the last one changes the editor.
	let loadToken = 0;
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.refreshView} */
	async function refreshView() {
		const token = ++loadToken;
		if (browserCounts && !browserCountsPending) {
			browserCountsPending = true;
			rows.forEach(validateRow);
		}
		/** @type {Types.DeclarativeNetRequest.RulesView} */
		let next;
		try {
			next = await load();
		} catch (err) {
			if (token !== loadToken) return;
			console.error("declarativeNetRequestSandbox: pravidla nejde načíst:", err);
			browserCountsPending = false;
			notice.hidden = false;
			notice.replaceChildren();
			const item = document.createElement("div");
			item.className = "dnr-problem";
			item.textContent = t("declarativeNetRequestSandbox_status_no_background", errorText(err));
			notice.appendChild(item);
			rows.forEach(validateRow);
			return;
		}
		if (token !== loadToken) return;
		const first = view === null;
		view = next;
		hasBookmarks = next.permissions.bookmarks;
		folders = next.folders;
		browserCounts = next.browser
			? {
					counts: next.browser.counts,
					regexCounts: next.browser.regexCounts || {},
					unsupportedCounts: next.browser.unsupportedCounts || {},
					suspended: next.browser.suspendedIds,
				}
			: null;
		browserCountsPending = false;
		if (first) {
			for (const rule of next.rules) addRow(rule);
			setStored(next.rules);
			addButton.disabled = false;
		} else if (next.stored && JSON.stringify(next.rules) !== storedJson) {
			takeOver(next.rules);
		}
		renderNotice(next);
		rows.forEach(fillFolders);
		rows.forEach(refreshNotifyStatus);
		refresh();
		onView(next);
	}

	// A change the listener reported (the rules, the suspensions, the permissions, the module list, the bookmarks) — the
	// editor loads again a moment later.
	/** @type {ReturnType<typeof setTimeout> | null} */
	let reloadTimer = null;
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.onChange} */
	function onChange(change) {
		// Other bookmarks or permissions — the JSON of the cards reads the bookmarks of their folders again (after the load).
		if (change === "bookmarks" || change === "status") {
			folderBookmarks.clear();
			folderGeneration += 1;
		}
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => {
			reloadTimer = null;
			if (root.isConnected) refreshView();
		}, RELOAD_DELAY_MS);
	}

	// "Save module settings" (saveSettings() of the element): the background part checks the rules and stores them — the
	// cards then show what it stored, the state in the browser comes with the next load. A failure stays below the cards
	// until their next change (nothing was stored — nothing to load) and goes back to the core, which says it next to its
	// button; the cards keep their unsaved changes.
	/** @type {Functions.DeclarativeNetRequestSandbox.RulesEditor.saveRules} */
	async function saveRules() {
		// Not loaded yet — no cards (an empty list would delete the stored rules), nothing changed.
		if (!view) return;
		saved.textContent = t("declarativeNetRequestSandbox_editor_saving");
		saved.classList.remove("dnr-problem");
		try {
			const result = await save(getValue());
			if (JSON.stringify(result.rules) !== storedJson) takeOver(result.rules);
			savedText = t("declarativeNetRequestSandbox_editor_saved");
		} catch (err) {
			console.error("declarativeNetRequestSandbox: pravidla nejde uložit:", err);
			refresh();
			saved.textContent = t("declarativeNetRequestSandbox_editor_save_failed", errorText(err));
			saved.classList.add("dnr-problem");
			throw err;
		}
		refresh();
		refreshView();
	}

	root.addEventListener("input", refresh);
	root.addEventListener("change", refresh);
	addButton.addEventListener("click", () => {
		const row = addRow(emptyRule(newRuleId()), true);
		refresh();
		row.titleInput.focus();
	});

	refreshView();
	return { root, onChange, save: saveRules };
}
