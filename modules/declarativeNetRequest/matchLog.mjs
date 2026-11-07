//@ts-check
"use strict";

// modules/declarativeNetRequest/matchLog.mjs
// The module's own log of the applied rules — without DOM and without chrome.*, shared by the background part
// (background-script.mjs) and tests; the overview in the sandbox (declarativeNetRequestSandbox) has a copy of it
// (tests/sandbox.test.mjs checks the two are the same).
//
// A rule with "Into the own event log" (logMatched) writes the requests it was applied to into the log. The background part
// learns about them the same way as for the notifications — declarativeNetRequest.onRuleMatchedDebug, without it the requests
// an extension blocked (webRequest.onErrorOccurred, only blocking rules) —, only the permission for notifications is not
// needed. The entries wait a moment in the background part (LOG_FLUSH_DELAY_MS of background-script.mjs): the same request
// repeated in the meantime makes one entry with a count (appendLog()). Then they go into api.state of this module (LOG_KEY,
// chrome.storage.local — they survive the background part going to sleep and a browser restart): an array of entries, the
// newest first, at most MAX_LOG_ENTRIES (the oldest drop out). The overview reads them through the service
// declarativeNetRequest.getLog and deletes them (one, or all) through declarativeNetRequest.clearLog.
import { getUiLocale } from "../../sdk.mjs";
import { RULE_KINDS } from "./rules.mjs";

// The key of the module's own state with the log.
export const LOG_KEY = "matchLog";

// How many entries the log keeps at most (the newest ones).
export const MAX_LOG_ENTRIES = 900;

// The longest address (of the request, of the page it came from) an entry keeps — a longer one ends with "…".
export const MAX_LOG_URL_LENGTH = 1000;

// The longest rule title and id an entry keeps.
const MAX_LOG_TEXT_LENGTH = 200;

// How the background part learned about the applied rule: the browser reported it (onRuleMatchedDebug), or it inferred
// a blocking rule from a request an extension blocked, or a rule redirecting to HTTPS from a request the browser redirected
// from http:// to https:// (webRequest).
/** @type {readonly Types.DeclarativeNetRequest.LogSource[]} */
export const LOG_SOURCES = [ "feedback", "blocked", "upgraded" ];

/** @type {Functions.DeclarativeNetRequest.MatchLog.clip} */
function clip ( value, max )
{
	const text = typeof value === "string" ? value : "";
	return text.length > max ? `${ text.slice( 0, max - 1 ) }…` : text;
}

// The id of an entry — unique in the log (the time and a random part).
/** @type {Functions.DeclarativeNetRequest.MatchLog.newLogId} */
export function newLogId ( at )
{
	const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
		? crypto.randomUUID().slice( 0, 6 )
		: Math.random().toString( 36 ).slice( 2, 8 );
	return `${ Math.floor( at ).toString( 36 ) }-${ random }`;
}

// An entry about one request a rule was applied to (at: when, ms).
/** @type {Functions.DeclarativeNetRequest.MatchLog.createLogEntry} */
export function createLogEntry ( rule, request, source, at = Date.now() )
{
	return {
		id: newLogId( at ),
		at,
		count: 1,
		ruleId: clip( rule.id, MAX_LOG_TEXT_LENGTH ),
		title: clip( rule.title, MAX_LOG_TEXT_LENGTH ),
		kind: rule.kind,
		url: clip( request.url, MAX_LOG_URL_LENGTH ),
		type: clip( request.type, MAX_LOG_TEXT_LENGTH ),
		method: clip( request.method, MAX_LOG_TEXT_LENGTH ).toUpperCase(),
		tabId: Number.isInteger( request.tabId ) && /** @type {number} */ ( request.tabId ) >= 0 ? /** @type {number} */ ( request.tabId ) : null,
		initiator: clip( request.initiator, MAX_LOG_URL_LENGTH ),
		source,
	};
}

// A stored value → an entry, or null when it is not one (without an id, a time, a rule or an address).
/** @type {Functions.DeclarativeNetRequest.MatchLog.normalizeLogEntry} */
export function normalizeLogEntry ( value )
{
	if ( !value || typeof value !== "object" || Array.isArray( value ) ) return null;
	const row = /** @type {Record<string, unknown>} */ ( value );
	if ( typeof row.id !== "string" || !row.id || row.id.length > MAX_LOG_TEXT_LENGTH ) return null;
	if ( typeof row.at !== "number" || !Number.isFinite( row.at ) ) return null;
	if ( typeof row.ruleId !== "string" || !row.ruleId || typeof row.url !== "string" || !row.url ) return null;
	return {
		id: row.id,
		at: row.at,
		count: Number.isInteger( row.count ) && /** @type {number} */ ( row.count ) > 0 ? /** @type {number} */ ( row.count ) : 1,
		ruleId: clip( row.ruleId, MAX_LOG_TEXT_LENGTH ),
		title: clip( row.title, MAX_LOG_TEXT_LENGTH ),
		kind: RULE_KINDS.find( ( kind ) => kind === row.kind ) || "headers",
		url: clip( row.url, MAX_LOG_URL_LENGTH ),
		type: clip( row.type, MAX_LOG_TEXT_LENGTH ),
		method: clip( row.method, MAX_LOG_TEXT_LENGTH ),
		tabId: Number.isInteger( row.tabId ) && /** @type {number} */ ( row.tabId ) >= 0 ? /** @type {number} */ ( row.tabId ) : null,
		initiator: clip( row.initiator, MAX_LOG_URL_LENGTH ),
		source: LOG_SOURCES.find( ( source ) => source === row.source ) || "feedback",
	};
}

// The stored log → valid entries in the stored order (the newest first), without a repeated id, at most MAX_LOG_ENTRIES.
/** @type {Functions.DeclarativeNetRequest.MatchLog.normalizeLog} */
export function normalizeLog ( value )
{
	/** @type {Types.DeclarativeNetRequest.LogEntry[]} */
	const entries = [];
	/** @type {Set<string>} */
	const ids = new Set();
	for ( const item of Array.isArray( value ) ? value : [] ) {
		const entry = normalizeLogEntry( item );
		if ( !entry || ids.has( entry.id ) ) continue;
		ids.add( entry.id );
		entries.push( entry );
		if ( entries.length >= MAX_LOG_ENTRIES ) break;
	}
	return entries;
}

// What makes two entries the same request (merged into one with a count).
/** @type {Functions.DeclarativeNetRequest.MatchLog.logEntryKey} */
export function logEntryKey ( entry )
{
	return JSON.stringify( [ entry.ruleId, entry.url, entry.type, entry.method, entry.tabId, entry.initiator, entry.source ] );
}

// The waiting entries (batch, in the order they came) in front of the stored log: the same request repeated in the batch
// is one entry (the id of the first one, the time of the last one, the counts added up), the newest first; the oldest
// entries over MAX_LOG_ENTRIES drop out.
/** @type {Functions.DeclarativeNetRequest.MatchLog.appendLog} */
export function appendLog ( stored, batch )
{
	/** @type {Map<string, Types.DeclarativeNetRequest.LogEntry>} */
	const merged = new Map();
	for ( const entry of batch ) {
		const key = logEntryKey( entry );
		const known = merged.get( key );
		if ( known ) merged.set( key, { ...known, at: Math.max( known.at, entry.at ), count: known.count + entry.count } );
		else merged.set( key, { ...entry } );
	}
	// The later of the requests with the same time first (sort() keeps the order of equal items).
	const fresh = [ ...merged.values() ].reverse().sort( ( a, b ) => b.at - a.at );
	const ids = new Set( fresh.map( ( entry ) => entry.id ) );
	return [ ...fresh, ...normalizeLog( stored ).filter( ( entry ) => !ids.has( entry.id ) ) ].slice( 0, MAX_LOG_ENTRIES );
}

// The log without the entry with the id.
/** @type {Functions.DeclarativeNetRequest.MatchLog.removeLogEntry} */
export function removeLogEntry ( stored, id )
{
	return normalizeLog( stored ).filter( ( entry ) => entry.id !== id );
}

// Text for searching regardless of letter case and diacritics (as in notificationsCenter).
/** @type {Functions.DeclarativeNetRequest.MatchLog.foldText} */
export function foldText ( text )
{
	return text.normalize( "NFD" ).replace( /[̀-ͯ]/g, "" ).toLowerCase();
}

// Does the entry match the searched text? (the rule title, the address of the request and of the page, the request type)
/** @type {Functions.DeclarativeNetRequest.MatchLog.matchesLogQuery} */
export function matchesLogQuery ( entry, query )
{
	const needle = foldText( query.trim() );
	if ( !needle ) return true;
	return [ entry.title, entry.url, entry.initiator, entry.type ].some( ( text ) => foldText( text ).includes( needle ) );
}

// The entries by the search and the rule (an empty ruleId = all rules), in the order of the log.
/** @type {Functions.DeclarativeNetRequest.MatchLog.filterLog} */
export function filterLog ( entries, { query, ruleId } )
{
	return entries.filter( ( entry ) => ( !ruleId || entry.ruleId === ruleId ) && matchesLogQuery( entry, query ) );
}

// The rules of the entries for the filter: the id, the title of its newest entry and the number of its entries, by title.
/** @type {Functions.DeclarativeNetRequest.MatchLog.listLogRules} */
export function listLogRules ( entries )
{
	/** @type {Map<string, Types.DeclarativeNetRequest.LogRule>} */
	const rules = new Map();
	for ( const entry of entries ) {
		const known = rules.get( entry.ruleId );
		if ( known ) known.count++;
		else rules.set( entry.ruleId, { id: entry.ruleId, title: entry.title || entry.ruleId, count: 1 } );
	}
	const collator = new Intl.Collator( getUiLocale() || undefined, { sensitivity: "base", numeric: true } );
	return [ ...rules.values() ].sort( ( a, b ) => collator.compare( a.title, b.title ) || collator.compare( a.id, b.id ) );
}

// The time of an entry (with seconds, the date too when it is not today).
/** @type {Functions.DeclarativeNetRequest.MatchLog.formatLogTime} */
export function formatLogTime ( ms, now = Date.now() )
{
	const date = new Date( ms );
	/** @type {Intl.DateTimeFormatOptions} */
	const options = date.toDateString() === new Date( now ).toDateString() ? { timeStyle: "medium" } : { dateStyle: "short", timeStyle: "medium" };
	try {
		return date.toLocaleString( getUiLocale(), options );
	} catch {
		return date.toISOString();
	}
}
