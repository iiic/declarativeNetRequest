//@ts-check
"use strict";

// modules/declarativeNetRequest/background-script.mjs
// The background part of the declarativeNetRequest module (see registerBackgroundScript()
// in sdk.mjs): converts the rules from Settings into declarativeNetRequest rules
// "modifyHeaders", for GET parameters "redirect" with queryTransform, for blocking
// "block", for the upgrade from HTTP to HTTPS "upgradeScheme" (rules.mjs) and passes them to the core
// (api.networkRules.set()) — headers and parameters are then modified (and requests blocked or upgraded) by the
// browser itself, without a request listener. The core is
// the only owner of rule ids in the browser and itself watches the activation mode
// and the module list: it removes the rules of a turned-off or removed module, after
// turning it on it restores them.
//
// The rules are sent to the core again after a change of the rules in Settings, of the bookmarks in
// the rules' folders (bookmark addresses are part of the rules), of permissions
// (bookmarks, the request types the browser knows) and after installation or browser
// start, after a rule is temporarily suspended or restored (suspensions.mjs, api.state)
// and when the earliest suspension ends (an alarm that wakes the background part — in Chrome
// only with the optional "alarms" permission —, and a timer while it is awake) — and only
// when they changed since the last conversion. Suspended rules are left out of the conversion
// (the priorities of the others stay), a rule suspended only for domains gets them among its "Except" domains
// (withSuspendedDomains() — it applies on elsewhere), expired suspensions are dropped from api.state. Rules
// in the browser survive a restart and the background part going to sleep. The element asks with the STATUS_MESSAGE
// message (the conversion always runs — the rules go to the core only when they changed, otherwise the status is the one the
// core stored after its last recalculation —, the response is the current state in the browser and how many
// declarativeNetRequest rules each rule of Settings made there). The overview renders after every button (suspend, restore,
// add an exception) and every change; a forced recalculation of all the rules of the extension each time (~1–2 s with the
// filter lists) made the buttons slow. Rules with a regular expression the browser cannot compile are left out before
// they go to the core (supportedNetworkRules()) — one of them would make the browser reject all the rules of the module.
//
// The overview of the rules for the page and the editor of the rules run in the sandbox (declarativeNetRequestSandbox) —
// what needs the browser or the storage of this module the background part does for them as its services (api.services,
// the functions declarativeNetRequest.* of the catalog of uploaded modules): the state for a page (STATUS_SERVICE), the
// rules with the bookmark folders, the permissions, the suspensions and the request types the browser knows (the JSON of a
// rule in the editor) for the editor (GET_RULES_SERVICE), the addresses of the bookmarks in a folder — the same the
// conversion takes, for the JSON of a rule with a folder (FOLDER_URLS_SERVICE), storing the
// edited rules (SET_RULES_SERVICE — checked by normalizeRules() of rules.mjs, the same as the editor in Settings did),
// suspending and restoring a rule — the whole rule, or with { domain } only for a domain (SUSPEND_SERVICE, RESTORE_SERVICE —
// only a stored rule), reloading the page of the
// active tab of the page's window (RELOAD_SERVICE — only that tab), blocking the domain or the address of the page of that
// tab (BLOCK_PAGE_SERVICE — addBlockedPage() of rules.mjs, the rule of the pages blocked while browsing), adding the domain of
// the page of that tab to the "Except" domains of a rule (EXCEPT_DOMAIN_SERVICE — addExceptDomain() of rules.mjs), the own
// log of the applied rules (GET_LOG_SERVICE, CLEAR_LOG_SERVICE) and opening the page where the element of this module asks for the
// permissions (OPEN_PERMISSIONS_SERVICE). On a page of this extension the core itself follows what the listener of the changes
// reports (declarativeNetRequest.onChange); a service provider showing the overview or the editor of a standalone extension
// sees neither the storage nor the events of this extension, so the background part reports the same changes to it
// (CHANGES_SERVICE, api.services.changed() — nothing without a provider holding a lease on it).
//
// The rules with "Except the requests of this extension" get the host of the extension (extensionHost() — the id, in Firefox
// the internal UUID of moz-extension://) among excludedInitiatorDomains: the browser applies the rules of the extension also
// to its own fetch() and XMLHttpRequest (compileRules() of rules.mjs).
//
// The button "Block the image permanently" of imageInfoSandbox adds the address of an image to the rule of the blocked
// images (BLOCK_IMAGE_SERVICE — the core, imageInfo.blockImage, also of a service provider): the background part stores it
// in Settings like the user's own rules (addBlockedImage() of rules.mjs — the editor shows it), converts the rules right away
// and says whether the browser now blocks the address, or why not.
//
// Rules with "notify" (notifyMatched) get a silent summary notification when they are applied: from
// declarativeNetRequest.onRuleMatchedDebug (with declarativeNetRequestFeedback — only Chrome, and only for an unpacked
// extension; Firefox does not implement it, bug 1745773). Without it only blocking rules and the rules redirecting to HTTPS
// are reported: a request an extension blocked ends in webRequest.onErrorOccurred (WEBREQUEST_PERMISSIONS) with the
// browser's error for it, and matchBlockedRequest() of rules.mjs finds the blocking rule that targets it; a request the
// browser redirected from http:// to the same address with https:// itself comes to webRequest.onBeforeRedirect
// (isSchemeUpgrade()), and matchUpgradedRequest() finds the rule redirecting to HTTPS that targets it.
//
// Rules with "Into the own event log" (logMatched) are found out the same way, only without the permission for notifications:
// every request they were applied to is an entry of the module's own log (matchLog.mjs) — the entries wait LOG_FLUSH_DELAY_MS
// (the same request repeated in the meantime = one entry with a count) and go into api.state (LOG_KEY), the newest first,
// at most MAX_LOG_ENTRIES. The overview of declarativeNetRequestSandbox lists them.
import { registerBackgroundScript, getModuleSettingKey, t, tp, loadI18n, getUiLocale, BOOKMARKS_PERMISSIONS, WEBREQUEST_PERMISSIONS } from "../../sdk.mjs";
import { NETWORK_RULES_BULK_MAX_PRIORITY } from "../../base.mjs";
import {
	MODULE_NAME,
	ACTIVATION_SPEC,
	DEFAULT_ACTIVATION_MODE,
	RULES_KEY,
	STATUS_MESSAGE,
	BLOCK_IMAGE_SERVICE,
	STATUS_SERVICE,
	GET_RULES_SERVICE,
	FOLDER_URLS_SERVICE,
	SET_RULES_SERVICE,
	SUSPEND_SERVICE,
	RESTORE_SERVICE,
	RELOAD_SERVICE,
	BLOCK_PAGE_SERVICE,
	EXCEPT_DOMAIN_SERVICE,
	GET_LOG_SERVICE,
	CLEAR_LOG_SERVICE,
	OPEN_PERMISSIONS_SERVICE,
	CHANGES_SERVICE,
	SETTINGS_EDITED_BY,
} from "./module.mjs";
import
{
	normalizeRules,
	compileRules,
	buildNetworkRules,
	countNetworkRules,
	matchUrl,
	matchBlockedRequest,
	matchUpgradedRequest,
	collectBookmarkUrls,
	listBookmarkFolders,
	addBlockedImage,
	addBlockedPage,
	addExceptDomain,
	pageKey,
	ruleTitle,
	stripComments,
	COMMON_RESOURCE_TYPES,
	DEFAULT_RULES,
	IMAGE_BLOCK_RULE_TITLE,
	PAGE_BLOCK_RULE_TITLE,
	BLOCK_PAGE_SCOPES,
} from "./rules.mjs";
import
{
	SUSPENDED_KEY,
	normalizeSuspensions,
	isSuspended,
	domainSuspensionFor,
	withoutSuspended,
	withSuspendedDomains,
	nextExpiry,
	listSuspensions,
	suspendRule,
	cancelSuspension,
} from "./suspensions.mjs";
import { normalizeDomain } from "./domains.mjs";
import { HEADERS_PERMISSIONS, NOTIFICATION_PERMISSIONS, MATCHED_RULES_PERMISSIONS } from "./permissions.mjs";
import { LOG_KEY, MAX_LOG_ENTRIES, createLogEntry, appendLog, normalizeLog, removeLogEntry } from "./matchLog.mjs";

// How long after the last change (settings, bookmarks) the rules are converted —
// several changes in quick succession (a bookmark import) = one conversion.
export const SYNC_DELAY_MS = 300;
export const MATCHED_NOTIFY_DELAY_MS = 1200;
// How long the entries of the log wait before they are written (one write for a burst of requests).
export const LOG_FLUSH_DELAY_MS = 1000;
const NOTIFICATION_TAG = "extension-declarative-net-request:matched";
const MAX_NOTIFY_URL_LENGTH = 150;
// The error of a request an extension blocked (webRequest.onErrorOccurred): Chrome; Firefox cancels the request
// of a "block" rule with NS_ERROR_ABORT (ExtensionDNR.sys.mjs) — the same as a blocking webRequest listener.
export const BLOCKED_REQUEST_ERROR_RE = /^(?:net::ERR_BLOCKED_BY_CLIENT|NS_ERROR_ABORT)$/;
// The notifications by how the applied rule was found out (the source of the entry of the log): the title and the body.
/** @type {Record<Types.DeclarativeNetRequest.LogSource, [ string, string ]>} */
const NOTICE_TEXTS = {
	feedback: [ "declarativeNetRequest_notify_title", "declarativeNetRequest_notify_body" ],
	blocked: [ "declarativeNetRequest_notify_requests_title", "declarativeNetRequest_notify_requests_body" ],
	upgraded: [ "declarativeNetRequest_notify_upgraded_title", "declarativeNetRequest_notify_upgraded_body" ],
};
// The alarm for the end of the earliest suspension.
const SUSPENSIONS_ALARM_NAME = "declarativeNetRequest-suspensions";
// The longest setTimeout delay (a longer one fires right away).
const MAX_TIMER_MS = 2 ** 31 - 1;
// How many answers of isRegexSupported() the background part remembers (supportedNetworkRules()) — then it starts again.
const REGEX_SUPPORT_CACHE_SIZE = 5000;
// What SET_RULES_SERVICE stores at most — the rules from the editor in the sandbox (the number of the rules and their JSON).
export const MAX_SET_RULES = 1000;
export const MAX_SET_RULES_JSON = 1024 * 1024;
// The longest address STATUS_SERVICE lists the rules for, and the longest id of a rule and domain for SUSPEND_SERVICE and
// RESTORE_SERVICE (a host name has at most 253 characters).
const MAX_URL_LENGTH = 8192;
const MAX_RULE_ID_LENGTH = 200;
const MAX_DOMAIN_LENGTH = 255;

// A redirect from http:// to the same address with https:// the browser made itself (webRequest.onBeforeRedirect), not one
// of the server: Chrome reports the redirect of an upgradeScheme rule as "307 Internal Redirect", Firefox with the status 0,
// both without the address of the server (ip); a redirect of the server (301, 302, …) has its status and ip (verified in
// Chrome 154 and Firefox 159). An upgradeScheme rule of another extension, HSTS or the HTTPS-only mode of the browser look
// the same.
/** @type {Functions.DeclarativeNetRequest.BackgroundScript.isSchemeUpgrade} */
export function isSchemeUpgrade ( details )
{
	if ( details.ip ) return false;
	const internal = details.statusCode === 0 || ( details.statusCode === 307 && /internal redirect/i.test( details.statusLine || "" ) );
	if ( !internal || typeof details.url !== "string" || typeof details.redirectUrl !== "string" ) return false;
	try {
		const from = new URL( details.url );
		const to = new URL( details.redirectUrl );
		if ( from.protocol !== "http:" || to.protocol !== "https:" ) return false;
		from.protocol = "https:";
		return from.href === to.href;
	} catch {
		return false;
	}
}

/** @type {Functions.DeclarativeNetRequest.BackgroundScript.stableJson} */
function stableJson ( value )
{
	if ( Array.isArray( value ) ) return `[${ value.map( stableJson ).join( "," ) }]`;
	if ( value && typeof value === "object" ) {
		const record = /** @type {Record<string, unknown>} */ ( value );
		return `{${ Object.keys( record ).sort().map( ( key ) => `${ JSON.stringify( key ) }:${ stableJson( record[ key ] ) }` ).join( "," ) }}`;
	}
	return JSON.stringify( value ) ?? "null";
}

/** @type {Functions.DeclarativeNetRequest.BackgroundScript.ruleSignature} */
function ruleSignature ( rule )
{
	return stableJson( { priority: rule.priority, action: rule.action, condition: rule.condition } );
}

/** @type {Functions.DeclarativeNetRequest.BackgroundScript.extensionIconUrl} */
function extensionIconUrl ()
{
	const icons = chrome.runtime.getManifest().icons || {};
	const [ size ] = Object.keys( icons ).map( Number ).sort( ( a, b ) => b - a );
	return size ? chrome.runtime.getURL( icons[ size ] ) : undefined;
}

/** @type {Functions.DeclarativeNetRequest.BackgroundScript.shortUrl} */
function shortUrl ( url )
{
	return url.length > MAX_NOTIFY_URL_LENGTH ? `${ url.slice( 0, MAX_NOTIFY_URL_LENGTH - 1 ) }…` : url;
}

// Can the extension show a notification now? (the browser's permission — the log does not need it)
/** @type {Functions.DeclarativeNetRequest.BackgroundScript.notificationsAllowed} */
function notificationsAllowed ()
{
	return typeof Notification !== "undefined" && Notification.permission === "granted";
}

// Request types the browser knows (chrome.declarativeNetRequest.ResourceType
// — Chrome and Firefox differ). Without the declarativeNetRequest* permission the API
// is missing — then the types both know.
/** @type {Functions.DeclarativeNetRequest.BackgroundScript.availableResourceTypes} */
export function availableResourceTypes ()
{
	const dnr = typeof chrome !== "undefined" ? chrome.declarativeNetRequest : undefined;
	const values = dnr && dnr.ResourceType ? Object.values( dnr.ResourceType ).filter( ( value ) => typeof value === "string" ) : [];
	return values.length > 0 ? /** @type {string[]} */ ( values ) : [ ...COMMON_RESOURCE_TYPES ];
}

// The host of this extension — its pages and its background part are the initiator of its own requests with it
// (chrome-extension://<id>, Firefox moz-extension://<the internal UUID of the profile>); null when the browser does not give it.
/** @type {Functions.DeclarativeNetRequest.BackgroundScript.extensionHost} */
export function extensionHost ()
{
	try {
		return new URL( chrome.runtime.getURL( "" ) ).hostname.toLowerCase() || null;
	} catch {
		return null;
	}
}

// Whether the browser can compile a regular expression (case sensitivity, "\n", the expression → the answer of
// isRegexSupported()) — the same expressions come with every conversion.
/** @type {Map<string, boolean>} */
const regexSupport = new Map();

// The declarativeNetRequest rules without those whose regular expression (regexFilter) the browser cannot compile —
// isRegexSupported(): Chrome compiles an expression into at most 2 KB of memory (RE2; Firefox has no such limit). One such
// rule would make the browser reject the whole batch of the module, the core then sets the module's rules alone and none
// of them would apply. The expressions of the module stay small (presenceSources(), pairSource() in params.mjs), but how
// much memory one takes depends on its shape (an expression of an edit with a related parameter and a long address or
// a pattern with many "*" did not fit — verified in Chrome 156), so the browser decides. Without the function, or when it
// fails, the rule stays (the browser decides when adding). dropped: the rules left out.
/** @type {Functions.DeclarativeNetRequest.BackgroundScript.supportedNetworkRules} */
export async function supportedNetworkRules ( rules )
{
	const dnr = typeof chrome !== "undefined" ? chrome.declarativeNetRequest : undefined;
	if ( !dnr || typeof dnr.isRegexSupported !== "function" ) return { rules, dropped: [] };
	/** @type {Types.NetworkRule[]} */
	const kept = [];
	/** @type {Types.NetworkRule[]} */
	const dropped = [];
	for ( const rule of rules ) {
		const regex = rule.condition?.regexFilter;
		if ( !regex ) {
			kept.push( rule );
			continue;
		}
		const isCaseSensitive = !!rule.condition.isUrlFilterCaseSensitive;
		const key = `${ isCaseSensitive }\n${ regex }`;
		let supported = regexSupport.get( key );
		if ( supported === undefined ) {
			try {
				supported = ( await dnr.isRegexSupported( { regex, isCaseSensitive } ) ).isSupported !== false;
				if ( regexSupport.size >= REGEX_SUPPORT_CACHE_SIZE ) regexSupport.clear();
				regexSupport.set( key, supported );
			} catch {
				supported = true;
			}
		}
		( supported ? kept : dropped ).push( rule );
	}
	if ( dropped.length > 0 ) console.warn( `declarativeNetRequest: prohlížeč neumí ${ dropped.length } regulárních výrazů pravidel — vynechány.` );
	return { rules: kept, dropped };
}

registerBackgroundScript( {
	name: MODULE_NAME,
	setup: ( { api } ) =>
	{
		const settingsField = getModuleSettingKey( MODULE_NAME, RULES_KEY );

		// The last conversion: the rules sent to the core (JSON) and how they turned out. After
		// the background part starts it is empty — the first conversion always sends them (the core
		// writes nothing without a change).
		/** @type {string | null} */
		let lastSent = null;
		/** @type {string | null} */
		let lastWatchedJson = null;
		/** @type {Types.NetworkRulesStatus | null} */
		let lastStatus = null;
		// The rules with notifications or the log on (onRuleMatchedDebug): by the id of their declarativeNetRequest rule in
		// the browser, and by its signature (a notice that waited checks its rule is still announced).
		/** @type {Map<number, Types.DeclarativeNetRequest.MatchedRuleNotice>} */
		let matchedRules = new Map();
		/** @type {Map<string, Types.DeclarativeNetRequest.WatchedRule>} */
		let matchedRuleSignatures = new Map();
		/** @type {Types.DeclarativeNetRequest.PendingNotice | null} */
		let pendingNotice = null;
		// The entries of the log waiting for writing (queueLogEntry()), the timer of the write and the writes of the log
		// one after another (the overview's deleting does not get in between).
		/** @type {Types.DeclarativeNetRequest.LogEntry[]} */
		let pendingLog = [];
		/** @type {ReturnType<typeof setTimeout> | null} */
		let logTimer = null;
		/** @type {Promise<unknown>} */
		let logWrites = Promise.resolve();
		let matchListenerRegistered = false;
		// The applied rules of the last conversion (for blocked requests) — after the background part wakes up loaded once.
		/** @type {Promise<Types.DeclarativeNetRequest.CompiledRule[]> | null} */
		let appliedRules = null;
		// Blocked and redirected requests in the order they came (inferRequest()), and the same for the applied rules the browser
		// reported (onRuleMatched()) — the entries of the log and the last request of a notification in the order of the requests.
		/** @type {Promise<void>} */
		let inferredRequests = Promise.resolve();
		/** @type {Promise<void>} */
		let matchedEvents = Promise.resolve();
		// Does some enabled rule target a bookmark folder? As long as it is not known,
		// a bookmark change triggers a conversion.
		let usesFolders = true;
		// The rules from the settings at the last change (JSON) — api.settings.onChange
		// reports a settings change of any module.
		/** @type {string | undefined} */
		let lastSettingsJson;
		/** @type {Promise<unknown>} */
		let queue = Promise.resolve();
		/** @type {ReturnType<typeof setTimeout> | null} */
		let timer = null;
		/** @type {ReturnType<typeof setTimeout> | null} */
		let expiryTimer = null;
		// The end of the earliest suspension the alarm and the timer are set for.
		/** @type {number | null | undefined} */
		let scheduledExpiry;

		// Bookmark addresses of one folder (also in its subfolders); null — the folder cannot be read (deleted, without the
		// permission chrome.bookmarks is missing).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.readFolderUrls} */
		async function readFolderUrls ( folderId )
		{
			if ( typeof chrome.bookmarks === "undefined" ) return null;
			try {
				return collectBookmarkUrls( await chrome.bookmarks.getSubTree( folderId ) );
			} catch {
				// The folder no longer exists — the rule does not apply to it.
				return null;
			}
		}

		// Bookmark addresses of the folders enabled rules target. A folder that
		// cannot be read (deleted, missing permission) is missing from the map.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.readBookmarkUrls} */
		async function readBookmarkUrls ( rules )
		{
			/** @type {Map<string, string[]>} */
			const urls = new Map();
			const folderIds = [ ...new Set( rules.filter( ( rule ) => rule.enabled && rule.folderId ).map( ( rule ) => rule.folderId ) ) ];
			for ( const folderId of folderIds ) {
				const folderUrls = await readFolderUrls( folderId );
				if ( folderUrls !== null ) urls.set( folderId, folderUrls );
			}
			return urls;
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.load} */
		async function load ()
		{
			// Unsaved rules = the defaults (DEFAULT_RULES, as in Settings).
			const rules = normalizeRules( await api.settings.get( RULES_KEY, /** @type {unknown} */( DEFAULT_RULES ) ) );
			usesFolders = rules.some( ( rule ) => rule.enabled && !!rule.folderId );
			const compiled = compileRules( rules, await readBookmarkUrls( rules ), extensionHost() );
			const suspensions = await loadSuspensions();
			// Suspended rules do not go into the browser, the rules suspended for domains go without them (their "Except"
			// domains); the priorities come from the whole list.
			const now = Date.now();
			const applied = withSuspendedDomains( withoutSuspended( compiled, suspensions, now ), suspensions, now );
			// Without the rules whose regular expression the browser cannot compile (supportedNetworkRules()).
			const { rules: networkRules, dropped } = await supportedNetworkRules( buildNetworkRules( applied, availableResourceTypes() ) );
			// The rules with notifications or the log on — by priority (every rule has its own), then by the signature
			// of each of their declarativeNetRequest rules as the core puts them into the browser.
			/** @type {Map<number, Types.DeclarativeNetRequest.WatchedRule>} */
			const watched = new Map(
				applied
					.filter( ( rule ) => rule.notifyMatched || rule.logMatched )
					.map( ( rule ) => [ rule.priority, { id: rule.id, title: rule.title, kind: rule.kind, notify: rule.notifyMatched, log: rule.logMatched } ] )
			);
			/** @type {Map<string, Types.DeclarativeNetRequest.WatchedRule>} */
			const watchedBySignature = new Map();
			for ( const rule of networkRules ) {
				if ( typeof rule.priority !== "number" ) continue;
				const known = watched.get( rule.priority );
				if ( known ) watchedBySignature.set( ruleSignature( { ...rule, priority: rule.priority + NETWORK_RULES_BULK_MAX_PRIORITY } ), known );
			}
			// declarativeNetRequest rules of every stored rule (0 = none in the browser: turned off, suspended, without
			// a valid edit or target, a folder without bookmarks) — for the cards of the editor.
			const made = countNetworkRules( applied, networkRules );
			const counts = Object.fromEntries( rules.map( ( rule ) => [ rule.id, made.get( rule.id ) || 0 ] ) );
			// Of them with a regular expression — the card says it (the browser evaluates them more slowly, the extension may
			// have only 1000); with the bookmarks of the folders, which the editor does not read.
			const regexCounts = Object.fromEntries( countNetworkRules( applied, networkRules.filter( ( rule ) => !!rule.condition?.regexFilter ) ) );
			// The ones left out because of their regular expression — the card says it too.
			const unsupportedCounts = Object.fromEntries( countNetworkRules( applied, dropped ) );
			return { compiled, applied, suspensions, networkRules, watchedBySignature, counts, regexCounts, unsupportedCounts };
		}

		// The suspensions valid now; expired (and invalid) ones are dropped from api.state.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.loadSuspensions} */
		async function loadSuspensions ()
		{
			const stored = await api.state.get( SUSPENDED_KEY, {} );
			const suspensions = normalizeSuspensions( stored, Date.now() );
			const storedCount = stored && typeof stored === "object" ? Object.keys( stored ).length : 0;
			if ( storedCount !== Object.keys( suspensions ).length ) {
				await api.state.set( SUSPENDED_KEY, suspensions ).catch( ( err ) => console.warn( "declarativeNetRequest: prošlá dočasná zrušení nejde smazat:", err ) );
			}
			return suspensions;
		}

		// A conversion when the earliest suspension ends (at: ms, null = none): the alarm wakes
		// a sleeping background part (Chrome only with the "alarms" permission, at the earliest
		// in 30 s), the timer is exact while it is awake.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.scheduleExpiry} */
		function scheduleExpiry ( at )
		{
			if ( at === scheduledExpiry ) return;
			scheduledExpiry = at;
			if ( expiryTimer ) clearTimeout( expiryTimer );
			expiryTimer = null;
			if ( chrome.alarms ) {
				const alarm = at === null ? chrome.alarms.clear( SUSPENSIONS_ALARM_NAME ) : chrome.alarms.create( SUSPENSIONS_ALARM_NAME, { when: at } );
				Promise.resolve( alarm ).catch( ( err ) => console.warn( "declarativeNetRequest: budík pro dočasně zrušená pravidla nejde nastavit:", err ) );
			}
			if ( at === null ) return;
			expiryTimer = setTimeout( () =>
			{
				expiryTimer = null;
				scheduledExpiry = undefined;
				schedule();
			}, Math.min( Math.max( 0, at - Date.now() ), MAX_TIMER_MS ) );
		}

		// The rules with notifications or the log on by the ids of their declarativeNetRequest rules in the browser (the core
		// gives them the ids) — onRuleMatchedDebug reports only the id. Only with the listener of onRuleMatchedDebug and a rule
		// to watch: getDynamicRules() reads all the rules of the extension (~0.6 s with the filter lists in Chrome). Without
		// the listener false — not refreshed, the next conversion tries again (after the permission is granted).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.refreshMatchedRules} */
		async function refreshMatchedRules ( watchedBySignature )
		{
			const dnr = chrome.declarativeNetRequest;
			if ( watchedBySignature.size === 0 ) {
				matchedRules = new Map();
				matchedRuleSignatures = new Map();
				return true;
			}
			if ( !matchListenerRegistered ) return false;
			if ( !dnr || typeof dnr.getDynamicRules !== "function" ) {
				matchedRules = new Map();
				matchedRuleSignatures = new Map();
				return false;
			}
			try {
				/** @type {Map<number, Types.DeclarativeNetRequest.MatchedRuleNotice>} */
				const matched = new Map();
				for ( const rule of await dnr.getDynamicRules() ) {
					const signature = ruleSignature( rule );
					const watched = watchedBySignature.get( signature );
					if ( watched ) matched.set( rule.id, { ...watched, signature } );
				}
				matchedRules = matched;
				matchedRuleSignatures = new Map( watchedBySignature );
				return true;
			} catch {
				matchedRules = new Map();
				matchedRuleSignatures = new Map();
				return false;
			}
		}

		// Converts the stored rules and sends them to the core when they changed since the last
		// conversion (or the last sending failed); fresh: without a change the status the core stored after its last
		// recalculation (api.networkRules.getStatus() — another change may have changed it), not the one of the last sending.
		// Conversions run one after another.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.sync} */
		function sync ( fresh )
		{
			const run = queue.then( async () =>
			{
				const { compiled, applied, suspensions, networkRules, watchedBySignature, counts, regexCounts, unsupportedCounts } = await load();
				appliedRules = Promise.resolve( applied );
				scheduleExpiry( nextExpiry( suspensions ) );
				const json = JSON.stringify( networkRules );
				const watchedJson = JSON.stringify( [ ...watchedBySignature ] );
				const rulesChanged = json !== lastSent || !lastStatus || lastStatus.reason === "error";
				if ( rulesChanged ) {
					lastStatus = await api.networkRules.set( networkRules );
					lastSent = json;
				} else if ( fresh ) {
					lastStatus = await api.networkRules.getStatus();
				}
				if ( rulesChanged || watchedJson !== lastWatchedJson ) {
					if ( await refreshMatchedRules( watchedBySignature ) ) lastWatchedJson = watchedJson;
				}
				return { compiled, applied, suspensions, counts, regexCounts, unsupportedCounts, status: /** @type {Types.NetworkRulesStatus} */ ( lastStatus ) };
			} );
			queue = run.catch( () => { } );
			return run;
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.currentAppliedRules} */
		function currentAppliedRules ()
		{
			if ( !appliedRules ) {
				const loading = load().then( ( loaded ) => loaded.applied );
				appliedRules = loading;
				loading.catch( () =>
				{
					if ( appliedRules === loading ) appliedRules = null;
				} );
			}
			return appliedRules;
		}

		// Is the rule of the notice still applied with notifications on? (it may have changed while the notice waited)
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.isCurrentNotice} */
		async function isCurrentNotice ( last )
		{
			if ( last.ruleId === null ) return last.signature !== null && matchedRuleSignatures.get( last.signature )?.notify === true;
			return ( await currentAppliedRules() ).some( ( rule ) => rule.id === last.ruleId && ( rule.kind === "block" || rule.kind === "upgrade" ) && rule.notifyMatched );
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.showMatchedNotice} */
		async function showMatchedNotice ( { count, last, mixed } )
		{
			if ( !( await api.activation.isActive( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ) ) ) return;
			if ( !( await isCurrentNotice( last ) ) ) return;
			if ( !notificationsAllowed() ) return;
			await loadI18n();
			// A blocked or redirected request is only inferred from webRequest — the text says what happened to it and that the
			// rule targets it; requests found out in different ways in one notification get the general text.
			const [ title, body ] = NOTICE_TEXTS[ mixed ? "feedback" : last.source ];
			await api.notifications.show( t( title ), {
				body: tp( body, count, last.title, shortUrl( last.url ) ),
				silent: true,
				tag: NOTIFICATION_TAG,
				icon: extensionIconUrl(),
				lang: getUiLocale(),
			} );
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.queueMatchedNotice} */
		function queueMatchedNotice ( match )
		{
			if ( pendingNotice ) {
				pendingNotice.count++;
				if ( pendingNotice.last.source !== match.source ) pendingNotice.mixed = true;
				pendingNotice.last = match;
				return;
			}
			pendingNotice = { count: 1, last: match, mixed: false };
			setTimeout( () =>
			{
				const notice = pendingNotice;
				pendingNotice = null;
				if ( notice ) showMatchedNotice( notice ).catch( ( err ) => console.warn( "declarativeNetRequest: oznámení o použití pravidla se nepovedlo", err ) );
			}, MATCHED_NOTIFY_DELAY_MS );
		}

		// An entry of the log waits for the write with the others — LOG_FLUSH_DELAY_MS after the first one; more entries than
		// the log keeps are written right away.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.queueLogEntry} */
		function queueLogEntry ( entry )
		{
			pendingLog.push( entry );
			if ( pendingLog.length >= MAX_LOG_ENTRIES ) {
				flushLog();
				return;
			}
			if ( logTimer ) return;
			logTimer = setTimeout( () =>
			{
				logTimer = null;
				flushLog();
			}, LOG_FLUSH_DELAY_MS );
		}

		// Writes the waiting entries in front of the stored log (after the writes before) — the promise settles once they
		// are stored.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.flushLog} */
		function flushLog ()
		{
			if ( logTimer ) clearTimeout( logTimer );
			logTimer = null;
			const batch = pendingLog;
			pendingLog = [];
			if ( batch.length > 0 ) {
				logWrites = logWrites
					.then( async () => api.state.set( LOG_KEY, appendLog( await api.state.get( LOG_KEY, [] ), batch ) ) )
					.catch( ( err ) => console.warn( "declarativeNetRequest: log použitých pravidel nejde uložit:", err ) );
			}
			return logWrites;
		}

		// A change of the stored log (after the waiting entries are written) — how many entries it removed.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.changeLog} */
		function changeLog ( change )
		{
			const run = flushLog().then( async () =>
			{
				const stored = normalizeLog( await api.state.get( LOG_KEY, [] ) );
				const next = change( stored );
				await api.state.set( LOG_KEY, next );
				return stored.length - next.length;
			} );
			logWrites = run.catch( () => { } );
			return run;
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.onRuleMatched} */
		function onRuleMatched ( info )
		{
			const matched = matchedRules.get( info.rule.ruleId );
			if ( !matched || typeof info.request.url !== "string" ) return;
			const notify = matched.notify && notificationsAllowed();
			if ( !notify && !matched.log ) return;
			const at = Date.now();
			matchedEvents = matchedEvents.then( async () =>
			{
				if ( !( await api.activation.isActive( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ) ) ) return;
				if ( notify ) queueMatchedNotice( { title: matched.title, url: info.request.url, signature: matched.signature, ruleId: null, source: "feedback" } );
				if ( matched.log ) queueLogEntry( createLogEntry( matched, info.request, "feedback", at ) );
			} ).catch( ( err ) => console.warn( "declarativeNetRequest: zásah pravidla nejde zpracovat:", err ) );
		}

		// A request webRequest reported as blocked by an extension or redirected to https — only while the browser does not report
		// the applied rules itself (onRuleMatchedDebug): the rule of the kind (blocking, the redirect to HTTPS) with the highest
		// priority that targets the request, when it has notifications or the log on. webRequest says only what happened to the
		// request, not who did it — a request another module or extension blocked or redirected (a redirect also the browser
		// itself — HSTS, the HTTPS-only mode) is reported when the rule targets it too. The requests one after another — the
		// last one in the notification is the last one that came.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.inferRequest} */
		function inferRequest ( details, source )
		{
			const kind = source === "blocked" ? "block" : "upgrade";
			const at = typeof details.timeStamp === "number" && Number.isFinite( details.timeStamp ) ? details.timeStamp : Date.now();
			const request = { url: details.url, type: details.type, initiator: details.initiator ?? details.originUrl };
			inferredRequests = inferredRequests.then( async () =>
			{
				const notify = notificationsAllowed();
				const [ rules, active ] = await Promise.all( [ currentAppliedRules(), api.activation.isActive( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ) ] );
				// Without a rule of the kind that announces or logs, the request is not matched at all (another extension may
				// block many, the browser upgrades many by HSTS).
				if ( !active || !rules.some( ( rule ) => rule.kind === kind && ( rule.logMatched || ( notify && rule.notifyMatched ) ) ) ) return;
				const rule = ( kind === "block" ? matchBlockedRequest : matchUpgradedRequest )( rules, request, availableResourceTypes() );
				if ( !rule ) return;
				if ( notify && rule.notifyMatched ) queueMatchedNotice( { title: rule.title, url: details.url, signature: null, ruleId: rule.id, source } );
				if ( rule.logMatched ) queueLogEntry( createLogEntry( rule, { ...request, method: details.method, tabId: details.tabId }, source, at ) );
			} ).catch( ( err ) => console.warn( "declarativeNetRequest: požadavek z webRequest nejde zpracovat:", err ) );
		}

		// A request an extension blocked (the browser's error for it, BLOCKED_REQUEST_ERROR_RE).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.onRequestError} */
		function onRequestError ( details )
		{
			if ( matchListenerRegistered || !BLOCKED_REQUEST_ERROR_RE.test( details.error ) ) return;
			inferRequest( details, "blocked" );
		}

		// A request the browser redirected from http:// to the same address with https:// itself (isSchemeUpgrade()).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.onRequestRedirect} */
		function onRequestRedirect ( details )
		{
			if ( matchListenerRegistered || !isSchemeUpgrade( details ) ) return;
			inferRequest( details, "upgraded" );
		}

		// Without the webRequest permission chrome.webRequest does not exist — the listeners (blocked requests, redirects) are
		// added after it is granted (the browser drops them when the permission is removed).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.registerRequestListeners} */
		function registerRequestListeners ()
		{
			const errors = chrome.webRequest?.onErrorOccurred;
			const redirects = chrome.webRequest?.onBeforeRedirect;
			try {
				if ( errors && !errors.hasListener( onRequestError ) ) errors.addListener( onRequestError, { urls: [ "<all_urls>" ] } );
				if ( redirects && !redirects.hasListener( onRequestRedirect ) ) redirects.addListener( onRequestRedirect, { urls: [ "<all_urls>" ] } );
			} catch ( err ) {
				console.warn( "declarativeNetRequest: posluchače požadavků (webRequest) nejde zaregistrovat:", err );
			}
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.registerRuleMatchedListener} */
		function registerRuleMatchedListener ()
		{
			const event = chrome.declarativeNetRequest?.onRuleMatchedDebug;
			if ( !event || matchListenerRegistered ) return;
			try {
				event.addListener( onRuleMatched );
				matchListenerRegistered = true;
			} catch ( err ) {
				console.warn( "declarativeNetRequest: posluchač použitých pravidel nejde zaregistrovat:", err );
			}
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.schedule} */
		function schedule ()
		{
			if ( timer ) clearTimeout( timer );
			timer = setTimeout( () =>
			{
				timer = null;
				sync( false ).catch( ( err ) => console.error( "declarativeNetRequest: pravidla nejde převést:", err ) );
			}, SYNC_DELAY_MS );
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.onBookmarksChanged} */
		function onBookmarksChanged ()
		{
			api.services.changed( CHANGES_SERVICE, "bookmarks" );
			if ( usesFolders ) schedule();
		}

		// Bookmark changes change the addresses in the rules' folders. Without the permission
		// chrome.bookmarks does not exist — the listeners are added after it is granted.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.registerBookmarkListeners} */
		function registerBookmarkListeners ()
		{
			const bookmarks = chrome.bookmarks;
			if ( typeof bookmarks === "undefined" ) return;
			for ( const event of [ bookmarks.onCreated, bookmarks.onRemoved, bookmarks.onChanged, bookmarks.onMoved ] ) {
				try {
					if ( event && !event.hasListener( onBookmarksChanged ) ) event.addListener( onBookmarksChanged );
				} catch ( err ) {
					console.error( "declarativeNetRequest: posluchač záložek nejde zaregistrovat:", err );
				}
			}
		}

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.getStatus} */
		async function getStatus ( { url } )
		{
			const [ { compiled, applied, suspensions, counts, regexCounts, unsupportedCounts, status }, active ] = await Promise.all( [ sync( true ), api.activation.isActive( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ) ] );
			// Rules targeting the address — those suspended right now separately: as a whole, or for a domain that covers the
			// host of the address (applied has the domain among their "Except" domains — matchUrl() does not list them there).
			const now = Date.now();
			const key = typeof url === "string" ? pageKey( url ) : null;
			const host = key === null ? null : new URL( key ).hostname;
			/** @type {Types.DeclarativeNetRequest.SuspendedRule[]} */
			const suspended = key === null || host === null
				? []
				: matchUrl( compiled, key ).flatMap( ( rule ) =>
				{
					if ( isSuspended( suspensions, rule.id, now ) ) return [ { ...rule, until: suspensions[ rule.id ].until } ];
					const byDomain = domainSuspensionFor( suspensions, rule.id, host, now );
					return byDomain ? [ { ...rule, until: byDomain.until, domain: byDomain.domain } ] : [];
				} );
			return {
				active,
				status,
				rules: applied.length,
				counts,
				regexCounts,
				unsupportedCounts,
				suspendedIds: Object.keys( suspensions ).filter( ( id ) => isSuspended( suspensions, id, now ) ),
				matched: typeof url === "string" ? matchUrl( applied, url ) : [],
				suspended,
			};
		}

		// Writes of the stored rules one after another — two quick clicks "Block the image permanently" must not lose
		// an address (each one reads the stored rules and writes them back), and the editor's saving does not get in between.
		/** @type {Promise<unknown>} */
		let writeQueue = Promise.resolve();

		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.enqueueWrite} */
		function enqueueWrite ( work )
		{
			const run = writeQueue.then( work );
			writeQueue = run.catch( () => { } );
			return run;
		}

		// The stored rules — unsaved ones are the defaults (DEFAULT_RULES).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.readRules} */
		async function readRules ()
		{
			return normalizeRules( await api.settings.get( RULES_KEY, /** @type {unknown} */ ( DEFAULT_RULES ) ) );
		}

		// Why the browser does not block an address that went into a blocking rule (blockImage(), blockPage()): the module lacks
		// its permission, it is turned off or not in the list, the browser rejected the rules, or no applied rule blocks the
		// address (blocked: false — the rule is turned off, suspended, changed); null — the browser blocks it.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.blockProblem} */
		function blockProblem ( granted, status, blocked )
		{
			if ( !granted || status.reason === "unavailable" ) return "permission";
			if ( status.reason === "disabled" || status.reason === "notListed" ) return "module";
			if ( status.reason !== null ) return "browser";
			return blocked ? null : "rule";
		}

		// The address of an image into the rule of the blocked images (BLOCK_IMAGE_SERVICE): stored only when it is new
		// (api.settings.onChange then plans a conversion that finds nothing new), converted right away. The browser blocks
		// it when some applied rule blocks images at the address and the module has its permission.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.blockImage} */
		function blockImage ( url )
		{
			return enqueueWrite( async () =>
			{
				const stored = await readRules();
				const result = addBlockedImage( stored, url );
				if ( !result ) throw new Error( "url" );
				if ( result.added ) await api.settings.set( RULES_KEY, result.rules );
				const [ { applied, status }, granted ] = await Promise.all( [ sync( false ), api.permissions.contains( HEADERS_PERMISSIONS ) ] );
				const blocked = matchUrl( applied, url ).some( ( rule ) => rule.kind === "block" && rule.parts.includes( "images" ) );
				return { ruleId: result.rule.id, title: stripComments( result.rule.title ).trim() || IMAGE_BLOCK_RULE_TITLE, added: result.added, problem: blockProblem( granted, status, blocked ) };
			} );
		}

		// The domain or the address of the page of a tab into the rule of the pages blocked while browsing (BLOCK_PAGE_SERVICE,
		// the buttons of the overview — { tabId, url, scope }): only the active tab of the window of the page that asks (the same
		// as reloadTab()) and only the address the tab has now, so a module cannot block any page. Stored only when it is new,
		// converted right away; the browser blocks the page when some applied rule blocks pages (main_frame) at the address.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.blockPage} */
		async function blockPage ( options, context )
		{
			const input = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ) : {};
			const { tabId, url } = input;
			const scope = BLOCK_PAGE_SCOPES.find( ( item ) => item === input.scope );
			const refused = () => new Error( t( "declarativeNetRequest_service_block_refused" ) );
			if ( !Number.isInteger( tabId ) || typeof url !== "string" || url.length > MAX_URL_LENGTH || !scope ) throw refused();
			if ( context.windowId === null || typeof chrome.tabs?.query !== "function" ) throw refused();
			const [ tab ] = await chrome.tabs.query( { active: true, windowId: context.windowId } );
			const key = pageKey( url );
			if ( !tab || tab.id !== tabId || key === null || pageKey( tab.url ) !== key ) throw refused();
			return enqueueWrite( async () =>
			{
				const result = addBlockedPage( await readRules(), url, scope );
				if ( !result ) throw refused();
				if ( result.added ) await api.settings.set( RULES_KEY, result.rules );
				const [ { applied, status }, granted ] = await Promise.all( [ sync( false ), api.permissions.contains( HEADERS_PERMISSIONS ) ] );
				const blocked = matchUrl( applied, url ).some( ( rule ) => rule.kind === "block" && rule.parts.includes( "page" ) );
				return {
					ruleId: result.rule.id,
					title: stripComments( result.rule.title ).trim() || PAGE_BLOCK_RULE_TITLE,
					scope,
					target: result.target,
					added: result.added,
					problem: blockProblem( granted, status, blocked ),
				};
			} );
		}

		// The domain of the page of a tab into the "Except" domains of a rule (EXCEPT_DOMAIN_SERVICE, the button "Add <domain> to the
		// exceptions list" of the overview — { id, tabId, url }): the same as blockPage() only the active tab of the window of the page
		// that asks and only the address the tab has now — a module cannot weaken a rule for any domain. The domain is the host
		// of the page without "www." (addExceptDomain() of rules.mjs); stored only when it is new, converted right away. A temporary
		// suspension of the rule for the same domain ends with it — the exception is permanent now.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.exceptDomain} */
		async function exceptDomain ( options, context )
		{
			const input = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ) : {};
			const { tabId, url } = input;
			const id = ruleIdOf( options );
			const refused = () => new Error( t( "declarativeNetRequest_service_except_refused" ) );
			if ( !Number.isInteger( tabId ) || typeof url !== "string" || url.length > MAX_URL_LENGTH ) throw refused();
			if ( context.windowId === null || typeof chrome.tabs?.query !== "function" ) throw refused();
			const [ tab ] = await chrome.tabs.query( { active: true, windowId: context.windowId } );
			const key = pageKey( url );
			if ( !tab || tab.id !== tabId || key === null || pageKey( tab.url ) !== key ) throw refused();
			return enqueueWrite( async () =>
			{
				const rules = await readRules();
				const index = rules.findIndex( ( rule ) => rule.id === id );
				if ( index < 0 ) throw new Error( t( "declarativeNetRequest_service_unknown_rule", id ) );
				const result = addExceptDomain( rules, id, url );
				if ( !result ) throw refused();
				if ( result.added ) await api.settings.set( RULES_KEY, result.rules );
				const suspensions = await loadSuspensions();
				if ( suspensions[ id ]?.domains?.[ result.domain ] ) await cancelSuspension( api, id, Date.now(), result.domain );
				await sync( false );
				return { ruleId: id, title: ruleTitle( result.rule, index ), domain: result.domain, added: result.added };
			} );
		}

		// --- The services of declarativeNetRequestSandbox (api.services) ---

		// The state for the overview of a page: whether the module works and has its permission, and — with the permission —
		// the state of getStatus() for the address ({ url }, the page of the tab the overview relates to).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.pageStatus} */
		async function pageStatus ( options )
		{
			const input = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ) : {};
			const url = typeof input.url === "string" && input.url.length <= MAX_URL_LENGTH ? input.url : null;
			const [ reason, granted ] = await Promise.all( [ api.activation.reason( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ), api.permissions.contains( HEADERS_PERMISSIONS ) ] );
			return { reason, granted, state: granted ? await getStatus( { url } ) : null };
		}

		// Bookmark folders for the editor's menus — null without the permission (chrome.bookmarks is missing then).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.readFolders} */
		async function readFolders ( granted )
		{
			if ( !granted || typeof chrome.bookmarks === "undefined" ) return null;
			try {
				return listBookmarkFolders( await chrome.bookmarks.getTree() );
			} catch ( err ) {
				console.error( "declarativeNetRequest: záložky nejde načíst:", err );
				return [];
			}
		}

		// The rules with what their editor needs: the stored rules (or the defaults), the bookmark folders, the permissions
		// and the notifications, how the rules turned out in the browser (only with the permission — the conversion runs), the
		// suspensions and the request types the browser knows (the editor converts a rule into JSON with them).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.rulesView} */
		async function rulesView ()
		{
			const stored = await api.settings.get( RULES_KEY, /** @type {unknown} */ ( null ) );
			const [ reason, headers, bookmarks, notifications, feedback, webRequest ] = await Promise.all( [
				api.activation.reason( DEFAULT_ACTIVATION_MODE, ACTIVATION_SPEC ),
				api.permissions.contains( HEADERS_PERMISSIONS ),
				api.permissions.contains( BOOKMARKS_PERMISSIONS ),
				api.permissions.contains( NOTIFICATION_PERMISSIONS ),
				api.permissions.contains( MATCHED_RULES_PERMISSIONS ),
				api.permissions.contains( WEBREQUEST_PERMISSIONS ),
			] );
			const browser = headers ? await getStatus( { url: null } ) : null;
			const [ folders, suspensions ] = await Promise.all( [ readFolders( bookmarks ), loadSuspensions() ] );
			return {
				reason,
				rules: normalizeRules( stored ?? DEFAULT_RULES ),
				stored: stored !== null && stored !== undefined,
				folders,
				permissions: { headers, bookmarks, notifications, feedback, webRequest },
				notify: {
					supported: typeof Notification !== "undefined",
					permission: typeof Notification === "undefined" ? null : Notification.permission,
					feedback: !!chrome.declarativeNetRequest?.onRuleMatchedDebug,
				},
				browser: browser && {
					status: browser.status,
					counts: browser.counts,
					regexCounts: browser.regexCounts,
					unsupportedCounts: browser.unsupportedCounts,
					suspendedIds: browser.suspendedIds,
				},
				suspensions: listSuspensions( suspensions ),
				resourceTypes: availableResourceTypes(),
				extensionHost: extensionHost(),
			};
		}

		// The addresses of the bookmarks in a folder ({ folderId }) for the JSON of a rule with the folder in the editor — the
		// same the conversion of the rule takes (readFolderUrls()); null without the permission to bookmarks or when the folder
		// cannot be read. Not a folder id — an error the module gets.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.folderUrls} */
		async function folderUrls ( options )
		{
			const folderId = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ).folderId : undefined;
			if ( typeof folderId !== "string" || !folderId || folderId.length > MAX_RULE_ID_LENGTH ) {
				throw new Error( t( "declarativeNetRequest_service_unknown_folder", String( folderId ) ) );
			}
			if ( !( await api.permissions.contains( BOOKMARKS_PERMISSIONS ) ) ) return { urls: null };
			return { urls: await readFolderUrls( folderId ) };
		}

		// The rules from the editor (an array of rules, checked by normalizeRules() — what the browser would reject does not
		// go into it, the same as from the editor in Settings) instead of the stored ones; the stored rules back.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.setRules} */
		function setRules ( value )
		{
			if ( !Array.isArray( value ) || value.length > MAX_SET_RULES || JSON.stringify( value ).length > MAX_SET_RULES_JSON ) {
				return Promise.reject( new Error( t( "declarativeNetRequest_service_invalid_rules", String( MAX_SET_RULES ), String( MAX_SET_RULES_JSON / 1024 ) ) ) );
			}
			const rules = normalizeRules( value );
			return enqueueWrite( async () =>
			{
				await api.settings.set( RULES_KEY, rules );
				return { rules };
			} );
		}

		// The id of a stored rule from { id } — otherwise an error the module gets.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.ruleIdOf} */
		function ruleIdOf ( options )
		{
			const id = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ).id : undefined;
			if ( typeof id !== "string" || !id || id.length > MAX_RULE_ID_LENGTH ) throw new Error( t( "declarativeNetRequest_service_unknown_rule", String( id ) ) );
			return id;
		}

		// The domain of { domain } as a domain of a rule (normalizeDomain() — "www.Example.com" → "www.example.com"); missing
		// or null — the whole rule; anything else is an error the module gets.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.domainOf} */
		function domainOf ( options )
		{
			const value = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ).domain : undefined;
			if ( value === undefined || value === null ) return null;
			const domain = typeof value === "string" && value.length <= MAX_DOMAIN_LENGTH ? normalizeDomain( value ) : null;
			if ( domain === null ) throw new Error( t( "declarativeNetRequest_service_invalid_domain", String( value ) ) );
			return domain;
		}

		// Suspends a stored rule for SUSPEND_DURATION_MS (the "Suspend temporarily" button of the overview), with { domain }
		// only for the domain (the button "Suspend temporarily for <domain>") — its name at this moment goes with it (the
		// overview of the suspensions shows it also after the rule changed). A domain-limited suspension is narrower than the
		// whole one, so any domain is accepted, not only that of the active tab.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.suspend} */
		async function suspend ( options )
		{
			const id = ruleIdOf( options );
			const domain = domainOf( options );
			const rules = await readRules();
			const index = rules.findIndex( ( rule ) => rule.id === id );
			if ( index < 0 ) throw new Error( t( "declarativeNetRequest_service_unknown_rule", id ) );
			await suspendRule( api, { id, title: ruleTitle( rules[ index ], index ) }, Date.now(), domain );
			const suspension = normalizeSuspensions( await api.state.get( SUSPENDED_KEY, {} ), Date.now() )[ id ];
			return { until: ( domain === null ? suspension?.until : suspension?.domains?.[ domain ] ) || null };
		}

		// Reloads the page of the tab the overview listed ({ tabId }) — only the active tab of the window of the page that
		// asks (in the floating window the window of its tab), so a module cannot reload any tab.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.reloadTab} */
		async function reloadTab ( options, context )
		{
			const tabId = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ).tabId : undefined;
			if ( !Number.isInteger( tabId ) || context.windowId === null || typeof chrome.tabs?.query !== "function" ) {
				throw new Error( t( "declarativeNetRequest_service_reload_refused" ) );
			}
			const [ tab ] = await chrome.tabs.query( { active: true, windowId: context.windowId } );
			if ( !tab || tab.id !== tabId ) throw new Error( t( "declarativeNetRequest_service_reload_refused" ) );
			await chrome.tabs.reload( /** @type {number} */ ( tabId ) );
			return { reloaded: true };
		}

		// The own log of the applied rules for the overview (GET_LOG_SERVICE): the entries the newest first — also those still
		// waiting for the write —, how many it keeps at most, how many enabled rules write into it and the colors of the stored
		// rules by id (the line next to an entry in the listing — the current color, also for older entries).
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.logView} */
		async function logView ()
		{
			await flushLog();
			const [ stored, rules ] = await Promise.all( [ api.state.get( LOG_KEY, [] ), readRules() ] );
			/** @type {Record<string, string>} */
			const colors = {};
			for ( const rule of rules ) if ( rule.color ) colors[ rule.id ] = rule.color;
			return { entries: normalizeLog( stored ), max: MAX_LOG_ENTRIES, rules: rules.filter( ( rule ) => rule.enabled && rule.logMatched ).length, colors };
		}

		// Deletes the entry with { id } from the log, without an id all of them (CLEAR_LOG_SERVICE) — how many it deleted.
		/** @type {Functions.DeclarativeNetRequest.BackgroundScript.clearLog} */
		async function clearLog ( options )
		{
			const id = options && typeof options === "object" ? /** @type {Record<string, unknown>} */ ( options ).id : undefined;
			if ( id !== undefined && ( typeof id !== "string" || !id || id.length > MAX_RULE_ID_LENGTH ) ) {
				throw new Error( t( "declarativeNetRequest_service_unknown_log_entry", String( id ) ) );
			}
			const removed = await changeLog( ( entries ) => ( typeof id === "string" ? removeLogEntry( entries, id ) : [] ) );
			return { removed };
		}

		// Listeners synchronously in setup() (see registerBackgroundScript()) —
		// an event wakes the sleeping background part only for them.
		registerBookmarkListeners();
		registerRuleMatchedListener();
		registerRequestListeners();
		api.settings.onChange( ( settings ) =>
		{
			const json = JSON.stringify( settings[ settingsField ] );
			if ( json === lastSettingsJson ) return;
			lastSettingsJson = json;
			api.services.changed( CHANGES_SERVICE, "settings" );
			schedule();
		} );
		// The module list and the mode of the module (a service provider follows them through the listener, see above).
		api.activation.onChange( () => api.services.changed( CHANGES_SERVICE, "status" ) );
		if ( chrome.permissions && chrome.permissions.onAdded ) {
			chrome.permissions.onAdded.addListener( () =>
			{
				registerBookmarkListeners();
				registerRuleMatchedListener();
				registerRequestListeners();
				api.services.changed( CHANGES_SERVICE, "status" );
				schedule();
			} );
		}
		if ( chrome.permissions && chrome.permissions.onRemoved ) {
			chrome.permissions.onRemoved.addListener( () =>
			{
				api.services.changed( CHANGES_SERVICE, "status" );
				schedule();
			} );
		}
		api.state.onChange( SUSPENDED_KEY, () =>
		{
			api.services.changed( CHANGES_SERVICE, "suspensions" );
			schedule();
		} );
		api.state.onChange( LOG_KEY, () => api.services.changed( CHANGES_SERVICE, "log" ) );
		if ( chrome.alarms && chrome.alarms.onAlarm ) {
			chrome.alarms.onAlarm.addListener( ( alarm ) =>
			{
				if ( alarm.name === SUSPENSIONS_ALARM_NAME ) schedule();
			} );
		}
		// The background part woke up (Chrome without the "alarms" permission has no alarm) —
		// a suspension may have ended while it slept.
		api.state.get( SUSPENDED_KEY, {} ).then( ( stored ) =>
		{
			if ( stored && typeof stored === "object" && Object.keys( stored ).length > 0 ) schedule();
		} ).catch( () => { } );
		api.activation.onInstalled( schedule );
		if ( chrome.runtime && chrome.runtime.onStartup ) chrome.runtime.onStartup.addListener( schedule );
		api.messages.on( STATUS_MESSAGE, ( message, _sender, sendResponse ) =>
		{
			getStatus(/** @type {Types.Messages['DECLARATIVE_NET_REQUEST_STATUS']['request']} */( message ) ).then( sendResponse, ( err ) =>
				sendResponse( { error: /** @type {Error} */ ( err )?.message || String( err ) } )
			);
			return true;
		} );

		// The services of declarativeNetRequestSandbox — the functions of the catalog the overview and the editor of the rules
		// in the sandbox ask for; the core runs them here for a page of this extension. Their errors are texts for the user.
		api.services.provide( STATUS_SERVICE, async ( [ options ] ) => pageStatus( options ) );
		api.services.provide( GET_RULES_SERVICE, async () =>
		{
			// The names of the bookmark folders without a name are texts.
			await loadI18n();
			return rulesView();
		} );
		api.services.provide( FOLDER_URLS_SERVICE, async ( [ options ] ) =>
		{
			await loadI18n();
			return folderUrls( options );
		} );
		api.services.provide( SET_RULES_SERVICE, async ( [ rules ] ) =>
		{
			await loadI18n();
			return setRules( rules );
		} );
		api.services.provide( SUSPEND_SERVICE, async ( [ options ] ) =>
		{
			await loadI18n();
			return suspend( options );
		} );
		// Also the suspension of a rule removed since then (the overview of the suspensions lists it); with { domain } only
		// the suspension for the domain.
		api.services.provide( RESTORE_SERVICE, async ( [ options ] ) =>
		{
			await loadI18n();
			await cancelSuspension( api, ruleIdOf( options ), Date.now(), domainOf( options ) );
			return { restored: true };
		} );
		api.services.provide( RELOAD_SERVICE, async ( [ options ], context ) =>
		{
			await loadI18n();
			return reloadTab( options, context );
		} );
		api.services.provide( BLOCK_PAGE_SERVICE, async ( [ options ], context ) =>
		{
			await loadI18n();
			return blockPage( options, context );
		} );
		api.services.provide( EXCEPT_DOMAIN_SERVICE, async ( [ options ], context ) =>
		{
			await loadI18n();
			return exceptDomain( options, context );
		} );
		api.services.provide( GET_LOG_SERVICE, async () => logView() );
		api.services.provide( CLEAR_LOG_SERVICE, async ( [ options ] ) =>
		{
			await loadI18n();
			return clearLog( options );
		} );
		// The page where the permissions can be granted — Settings of this extension at the editor of the rules, its buttons ask for
		// them (whatever section was open last, the output of this module may be shown nowhere).
		api.services.provide( OPEN_PERMISSIONS_SERVICE, async () =>
		{
			await chrome.tabs.create( { url: chrome.runtime.getURL( `options.html#${ SETTINGS_EDITED_BY }` ) } );
			return { opened: true };
		} );
		// The listener of the overview and the editor for a service provider — fed by changed() above.
		api.services.provideListener( CHANGES_SERVICE );
		// The rule of the blocked images — for the core, not for a module (see BLOCK_IMAGE_SERVICE in module.mjs).
		api.services.provide( BLOCK_IMAGE_SERVICE, async ( [ url ] ) =>
		{
			if ( typeof url !== "string" ) throw new Error( "url" );
			return blockImage( url );
		} );
	},
} );
