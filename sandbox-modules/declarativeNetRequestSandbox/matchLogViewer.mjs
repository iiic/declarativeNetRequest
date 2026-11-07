//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/matchLogViewer.mjs
// The listing of the own event log of declarativeNetRequest at the bottom of the overview (declarativeNetRequestSandbox.mjs):
// the requests the rules with "Into the own event log" were applied to on all pages, the newest first — similar to the
// listing of notificationsCenter. A row shows the time, the title of the rule, what it did (blocked the request, edited its
// headers or GET parameters), how many times the same request came within a moment and the address of the request; unfolded
// it lists all the entry knows (the rule, the request, its type and method, the page it came from, the tab, how the
// background part found out) with a button that deletes the entry. Above the listing a search (the rule, the addresses, the
// request type) and a filter by rule, "Clear log" (a second click confirms it); below it "Load more" (PAGE_SIZE more).
//
// The background part of declarativeNetRequest keeps the log in its api.state (matchLog.mjs) — the listing reads it through
// declarativeNetRequest.getLog (load()) and deletes through declarativeNetRequest.clearLog (remove(), clear() — null when the
// user denied the function: no buttons then). The element has it load again after the listener declarativeNetRequest.onChange
// reported "log" (schedule()); without the listener the listing has its own "Refresh" button.
//
// The addresses are text from the pages: they go into the listing only through textContent.
import { t, tp, getUiLocale } from "../../sdk.mjs";
import { filterLog, listLogRules, formatLogTime } from "./matchLog.mjs";

// How many entries the listing shows at first and adds with "Load more".
export const PAGE_SIZE = 10;

// Several changes of the log in quick succession — one load.
const RELOAD_DELAY_MS = 300;

// How long "Clear log" waits for the confirming second click.
const CONFIRM_MS = 4000;

// The longest address in the row of an entry (the whole one is in the unfolded entry).
const SHORT_URL_LENGTH = 200;

/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.kindText} */
export function kindText(kind) {
	if (kind === "block") return t("declarativeNetRequestSandbox_log_kind_block");
	if (kind === "upgrade") return t("declarativeNetRequestSandbox_log_kind_upgrade");
	return t(kind === "params" ? "declarativeNetRequestSandbox_log_kind_params" : "declarativeNetRequestSandbox_log_kind_headers");
}

// The date and the time of an entry with seconds (in the unfolded entry).
/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.formatFullTime} */
export function formatFullTime(ms) {
	try {
		return new Date(ms).toLocaleString(getUiLocale(), { dateStyle: "medium", timeStyle: "medium" });
	} catch {
		return new Date(ms).toISOString();
	}
}

/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.span} */
function span(className, text) {
	const element = document.createElement("span");
	element.className = className;
	element.textContent = text;
	return element;
}

/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.timeElement} */
function timeElement(ms, text) {
	const time = document.createElement("time");
	time.dateTime = new Date(ms).toISOString();
	time.textContent = text;
	return time;
}

/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.button} */
function button(className, text) {
	const element = document.createElement("button");
	element.type = "button";
	element.className = className;
	element.textContent = text;
	return element;
}

/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer} */
export function createMatchLogViewer({ load, remove, clear, listening, open, onToggle }) {
	const root = document.createElement("details");
	root.className = "dnr-log";
	root.open = open;
	const summary = document.createElement("summary");
	summary.textContent = t("declarativeNetRequestSandbox_log_title");

	const toolbar = document.createElement("div");
	toolbar.className = "dnr-log-toolbar";
	toolbar.hidden = true;
	const search = document.createElement("input");
	search.type = "search";
	search.placeholder = t("declarativeNetRequestSandbox_log_search");
	search.setAttribute("aria-label", t("declarativeNetRequestSandbox_log_search"));
	const ruleSelect = document.createElement("select");
	ruleSelect.setAttribute("aria-label", t("declarativeNetRequestSandbox_log_rule_filter"));
	ruleSelect.appendChild(new Option(t("declarativeNetRequestSandbox_log_rule_all"), ""));
	const refreshButton = button("dnr-log-refresh", t("declarativeNetRequestSandbox_log_refresh"));
	refreshButton.hidden = listening;
	const clearButton = button("dnr-log-clear", t("declarativeNetRequestSandbox_log_clear"));
	clearButton.hidden = !clear;
	toolbar.append(search, ruleSelect, refreshButton, clearButton);

	const heading = document.createElement("div");
	heading.className = "dnr-log-heading";
	const problem = document.createElement("div");
	problem.className = "problem";
	problem.hidden = true;
	const list = document.createElement("ol");
	list.className = "dnr-log-list";
	const more = button("dnr-log-more", t("declarativeNetRequestSandbox_log_more"));
	more.hidden = true;
	root.append(summary, toolbar, problem, heading, list, more);

	/** @type {Types.DeclarativeNetRequest.LogView | null} */
	let view = null;
	let pages = 1;
	let loadToken = 0;
	// Unfolded entries stay unfolded after a new load.
	/** @type {Set<string>} */
	const openIds = new Set();
	/** @type {ReturnType<typeof setTimeout> | null} */
	let reloadTimer = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let confirmTimer = null;
	// The rule filter as it was last filled in (an unchanged one is not rewritten — an open select would close).
	let rulesSignature = "";

	// "Clear log" back to its first state.
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.resetClear} */
	function resetClear() {
		if (confirmTimer) clearTimeout(confirmTimer);
		confirmTimer = null;
		clearButton.textContent = t("declarativeNetRequestSandbox_log_clear");
		clearButton.classList.remove("dnr-log-confirm");
	}

	// The rules of the entries in the filter with the number of their entries; a selected rule that is no longer among
	// them stays (with zero).
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.fillRules} */
	function fillRules(entries) {
		const current = ruleSelect.value;
		const rules = listLogRules(entries);
		const signature = JSON.stringify([current, rules]);
		if (signature === rulesSignature) return;
		rulesSignature = signature;
		const options = [new Option(t("declarativeNetRequestSandbox_log_rule_all"), "")];
		for (const rule of rules) options.push(new Option(`${rule.title} (${rule.count})`, rule.id));
		if (current && !rules.some((rule) => rule.id === current)) {
			const previous = ruleSelect.selectedOptions[0];
			options.push(new Option(`${previous ? previous.text.replace(/ \(\d+\)$/, "") : current} (0)`, current));
		}
		ruleSelect.replaceChildren(...options);
		ruleSelect.value = current;
	}

	// One entry: the summary line (time, rule, what it did, count, address) and all it knows unfolded. The color of its rule
	// (view.colors — the current one of the stored rule) is a thin line to the left of it like in the overview of the rules
	// (.dnr-log-list>li.colored in the CSS).
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.createItem} */
	function createItem(entry) {
		const item = document.createElement("li");
		const color = view?.colors?.[entry.ruleId];
		if (color) {
			item.classList.add("colored");
			item.style.setProperty("--dnr-rule-color", color);
		}
		const details = document.createElement("details");
		details.open = openIds.has(entry.id);
		details.addEventListener("toggle", () => {
			if (details.open) openIds.add(entry.id);
			else openIds.delete(entry.id);
		});
		const line = document.createElement("summary");
		line.append(
			timeElement(entry.at, formatLogTime(entry.at)),
			" ",
			span("dnr-log-rule", entry.title || entry.ruleId),
			" ",
			span(`dnr-chip dnr-chip--${entry.kind}`, kindText(entry.kind))
		);
		if (entry.count > 1) line.append(" ", span("dnr-chip dnr-chip--count", t("declarativeNetRequestSandbox_log_count", String(entry.count))));
		line.append(span("dnr-log-url", entry.url.length > SHORT_URL_LENGTH ? `${entry.url.slice(0, SHORT_URL_LENGTH - 1)}…` : entry.url));
		details.append(line, createDetails(entry));
		item.appendChild(details);
		return item;
	}

	// The unfolded entry: name — value pairs and the button that deletes it.
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.createDetails} */
	function createDetails(entry) {
		const box = document.createElement("div");
		box.className = "dnr-log-details";
		if (remove) {
			const deleteButton = button("dnr-log-delete", "🗑️");
			deleteButton.title = t("declarativeNetRequestSandbox_log_delete");
			deleteButton.setAttribute("aria-label", deleteButton.title);
			deleteButton.addEventListener("click", async () => {
				deleteButton.disabled = true;
				try {
					await remove(entry.id);
					openIds.delete(entry.id);
				} catch (err) {
					console.error("declarativeNetRequestSandbox: záznam logu nejde smazat:", err);
					deleteButton.disabled = false;
					deleteButton.title = t("declarativeNetRequestSandbox_log_delete_failed");
				}
				refresh();
			});
			box.appendChild(deleteButton);
		}
		/** @type {Array<[string, string | Node]>} */
		const rows = [
			[t("declarativeNetRequestSandbox_log_row_rule"), entry.title ? `${entry.title} (${entry.ruleId})` : entry.ruleId],
			[t("declarativeNetRequestSandbox_log_row_action"), kindText(entry.kind)],
			[t("declarativeNetRequestSandbox_log_row_url"), entry.url],
			[t("declarativeNetRequestSandbox_log_row_type"), entry.type || "—"],
			[t("declarativeNetRequestSandbox_log_row_method"), entry.method || "—"],
			[t("declarativeNetRequestSandbox_log_row_initiator"), entry.initiator || "—"],
			[t("declarativeNetRequestSandbox_log_row_tab"), entry.tabId === null ? "—" : String(entry.tabId)],
			[t("declarativeNetRequestSandbox_log_row_time"), timeElement(entry.at, formatFullTime(entry.at))],
		];
		if (entry.count > 1) rows.push([t("declarativeNetRequestSandbox_log_row_count"), tp("declarativeNetRequestSandbox_log_count_long", entry.count)]);
		rows.push([
			t("declarativeNetRequestSandbox_log_row_source"),
			t(
				entry.source === "blocked"
					? "declarativeNetRequestSandbox_log_source_blocked"
					: entry.source === "upgraded"
						? "declarativeNetRequestSandbox_log_source_upgraded"
						: "declarativeNetRequestSandbox_log_source_feedback"
			),
		]);
		const fields = document.createElement("dl");
		for (const [name, value] of rows) {
			const term = document.createElement("dt");
			term.textContent = name;
			const description = document.createElement("dd");
			description.append(value);
			fields.append(term, description);
		}
		box.appendChild(fields);
		return box;
	}

	// The listing by the search, the rule filter and the number of pages — from the last load.
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.render} */
	function render() {
		if (!view) return;
		const { entries, max, rules } = view;
		summary.textContent =
			entries.length === 0
				? t("declarativeNetRequestSandbox_log_title")
				: entries.length >= max
					? t("declarativeNetRequestSandbox_log_title_full")
					: t("declarativeNetRequestSandbox_log_title_count", String(entries.length));
		toolbar.hidden = entries.length === 0;
		clearButton.disabled = entries.length === 0;
		fillRules(entries);
		const criteria = { query: search.value, ruleId: ruleSelect.value };
		const filtered = !!criteria.query.trim() || !!criteria.ruleId;
		const matched = filtered ? filterLog(entries, criteria) : entries;
		const shown = matched.slice(0, PAGE_SIZE * pages);
		list.replaceChildren(...shown.map(createItem));
		more.hidden = matched.length <= shown.length;
		more.title = tp("declarativeNetRequestSandbox_log_more_title", Math.min(PAGE_SIZE, matched.length - shown.length));
		if (entries.length === 0) {
			heading.textContent = t(rules > 0 ? "declarativeNetRequestSandbox_log_empty" : "declarativeNetRequestSandbox_log_empty_no_rules");
		} else if (matched.length === 0) {
			heading.textContent = t("declarativeNetRequestSandbox_log_no_match");
		} else {
			heading.textContent = filtered
				? t("declarativeNetRequestSandbox_log_heading_filtered", String(shown.length), String(matched.length), String(entries.length))
				: t("declarativeNetRequestSandbox_log_heading", String(shown.length), String(entries.length));
		}
		// The oldest entries drop out of a full log — said only in the title of the heading.
		heading.title = entries.length > 0 && matched.length > 0 ? t("declarativeNetRequestSandbox_log_full", String(max)) : "";
	}

	// Loads the log and renders it; concurrent loads — only the last one renders.
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.refresh} */
	async function refresh() {
		const token = ++loadToken;
		try {
			const next = await load();
			if (token !== loadToken) return;
			view = next;
			problem.hidden = true;
			render();
		} catch (err) {
			if (token !== loadToken) return;
			console.error("declarativeNetRequestSandbox: log nejde načíst:", err);
			problem.hidden = false;
			problem.textContent = t("declarativeNetRequestSandbox_log_load_failed", err instanceof Error ? err.message : String(err));
		}
	}

	// A change of the log the listener reported — a load a moment later.
	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.schedule} */
	function schedule() {
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => {
			reloadTimer = null;
			if (root.isConnected) refresh();
		}, RELOAD_DELAY_MS);
	}

	/** @type {Functions.DeclarativeNetRequestSandbox.MatchLogViewer.createMatchLogViewer.dispose} */
	function dispose() {
		if (reloadTimer) clearTimeout(reloadTimer);
		reloadTimer = null;
		resetClear();
	}

	// A new search or rule — from the first page again.
	search.addEventListener("input", () => {
		pages = 1;
		render();
	});
	ruleSelect.addEventListener("change", () => {
		pages = 1;
		render();
	});
	more.addEventListener("click", () => {
		pages += 1;
		render();
	});
	refreshButton.addEventListener("click", () => refresh());
	// The first click asks for a second one (CONFIRM_MS) — then the whole log goes.
	clearButton.addEventListener("click", async () => {
		if (!clear) return;
		if (!confirmTimer) {
			clearButton.textContent = t("declarativeNetRequestSandbox_log_clear_confirm");
			clearButton.classList.add("dnr-log-confirm");
			confirmTimer = setTimeout(resetClear, CONFIRM_MS);
			return;
		}
		resetClear();
		clearButton.disabled = true;
		try {
			await clear();
			openIds.clear();
			pages = 1;
		} catch (err) {
			console.error("declarativeNetRequestSandbox: log nejde smazat:", err);
			problem.hidden = false;
			problem.textContent = t("declarativeNetRequestSandbox_log_clear_failed", err instanceof Error ? err.message : String(err));
		}
		await refresh();
	});
	// Only the user's toggling — not the initial state.
	summary.addEventListener("click", () => setTimeout(() => onToggle(root.open), 0));

	heading.textContent = t("declarativeNetRequestSandbox_log_loading");
	refresh();
	return { root, refresh, schedule, dispose };
}
