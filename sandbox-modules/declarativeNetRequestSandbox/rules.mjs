//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/rules.mjs
// Header edit, GET parameter, blocking and HTTPS upgrade rules — without DOM and without chrome.*,
// shared by the background part (background-script.mjs), the element (declarativeNetRequest.mjs) and tests;
// the editor of the rules and the overview for the page in the sandbox (declarativeNetRequestSandbox) have a copy
// of it (a package in the sandbox cannot import from modules/ — tests/sandbox.test.mjs checks the two are the
// same), so it imports from the SDK only what the SDK of the sandbox has too (the domains from domains.mjs).
//
// A rule = a settings row (RULES_KEY in module.mjs): WHAT to do (by the
// rule kind edits of request or response headers, headers.mjs, of GET
// parameters in the request address, params.mjs, blocking the request, or loading it over HTTPS instead of HTTP),
// WHICH requests (page, frames, scripts, images, … — PART_GROUPS), WHERE (domains,
// addresses, a bookmark folder) and EXCEPT (domains on which the rule does not apply).
// It goes into the browser as declarativeNetRequest "modifyHeaders" rules,
// for parameters "redirect" with queryTransform, for blocking "block", for the upgrade to HTTPS "upgradeScheme"
// (buildNetworkRules()):
// - a domain: requests TO the domain and its subdomains (the page and files
//   from there, requestDomains) and files the domain's pages load
//   from elsewhere (initiatorDomains) — including <iframe> frames the page embeds.
//   Not files loaded only by a frame from another domain: for them the browser knows
//   the frame's domain as the initiator (verified in Chrome 154 and Firefox 157).
// - an address: a request exactly to this address (without the part after "#") — a page
//   or a single file; "*" stands for anything, an address without a scheme applies to
//   http and https. A blocking rule catches a page or a frame at the address also with a part after "#" —
//   Chrome compares the address of a document with it (fragmentCondition()).
//   Files the page at the address loads from elsewhere are not caught by the address:
//   for them the browser knows only the page's domain, not the whole address.
//   For parameters the address is also compared without the part after "?" — it applies to the address
//   with any parameters (the parameters are what the rule changes).
// - a bookmark folder: addresses of bookmarks in the folder (also in subfolders) as addresses,
//   with the "whole domain" option the bookmarks' domains (the host without "www.") as domains.
// - except domains: the rule does not target requests to the domain (including subdomains) nor files
//   the domain's pages load from elsewhere
//   (excludedRequestDomains, excludedInitiatorDomains) — a page (main_frame)
//   only by its own domain: a link from an excluded domain elsewhere is caught by the rule.
//   declarativeNetRequest does not allow expressing an exception for an address in one rule
//   (only with an "allow" rule, which would cancel the rules of the other
//   modules too).
// - except the requests of this extension (exceptExtension): the browser applies the rules of an extension also to its
//   own requests — fetch() and XMLHttpRequest of its background part and of its pages (verified in Chrome 156 and Firefox
//   159: a block of "fetch/XHR" on all addresses stopped them; the DoH of DNSInfo, the RDAP of domainInfo, the downloads of
//   the filter lists would stop too). With the option the host of the extension (the id in Chrome, the internal UUID of
//   moz-extension:// in Firefox — compileRules() gets it from the background part) goes among excludedInitiatorDomains of
//   every condition but the page (main_frame) — its requests then pass, the same as files of an "Except" domain.
// Blocking takes precedence over edits with the same priority; a blocked
// page (main_frame) ends with the browser's error page. The upgrade to HTTPS targets only http:// requests (ruleProtocol())
// and the browser then sends the https:// request through the rules again — a blocking rule or a GET parameter rule
// lower in the list applies to it (verified in Chrome 154 and Firefox 159).
// Several header rules on one request add up; when two rules change
// the same header, the one higher in the list applies (higher priority). Parameter
// rules that only remove parameters add up too; a rule
// that sets a value targets every request in its target and parameter
// rules lower in the list no longer change anything there (see params.mjs). An edit with a related parameter ("and at the
// same time") makes its own redirect for the addresses with both parameters (paramRedirects() of params.mjs) — with the
// priority of its rule.
//
// The text fields of a rule (the name, the names and the values of the edits, the domains, the addresses, the "Except"
// domains) may hold the user's own notes between "/*" and "*/" — they stay stored as the user wrote them, the conversion
// and the checks take the rule without them (withoutComments(), parseComments()).
import { t } from "../../sdk.mjs";
import { parseDomainList, isHostInDomains } from "./domains.mjs";
import { DIRECTIONS, OPERATIONS, isBlankHeader, headerProblem, toHeaderInfo } from "./headers.mjs";
import { PARAM_OPERATIONS, isBlankParam, paramProblem, paramRedirects, regexParamNames, escapeRegex } from "./params.mjs";

// Rule kinds: header edits, GET parameter edits, blocking, the upgrade from HTTP to HTTPS.
/** @type {readonly Types.DeclarativeNetRequest.RuleKind[]} */
export const RULE_KINDS = [ "headers", "params", "block", "upgrade" ];

/** @type {readonly Types.DeclarativeNetRequest.Protocol[]} */
export const PROTOCOLS = [ "any", "http", "https" ];

// Which requests the rule targets — groups of declarativeNetRequest types
// (ResourceType). Types the browser does not know are skipped (imageset is only in
// Firefox, webtransport only in Chrome); "other" = everything else the browser
// knows (Chrome: object, ping, csp_report, webbundle, other; Firefox additionally
// beacon, xslt, web_manifest, …).
/** @type {readonly Types.DeclarativeNetRequest.PartGroup[]} */
export const PART_GROUPS = [
	{ key: "page", types: [ "main_frame" ] },
	{ key: "frames", types: [ "sub_frame" ] },
	{ key: "scripts", types: [ "script" ] },
	{ key: "styles", types: [ "stylesheet" ] },
	{ key: "images", types: [ "image", "imageset" ] },
	{ key: "fonts", types: [ "font" ] },
	{ key: "xhr", types: [ "xmlhttprequest" ] },
	{ key: "media", types: [ "media" ] },
	{ key: "websocket", types: [ "websocket", "webtransport" ] },
	{ key: "other", types: [] },
];

/** @type {readonly Types.DeclarativeNetRequest.PartKey[]} */
export const PART_KEYS = PART_GROUPS.map( ( group ) => group.key );

// Groups parameter rules and the upgrade to HTTPS target — without WebSocket: a WebSocket
// (or WebTransport) connection cannot be redirected, Chrome does not apply the rule,
// Firefox drops the connection (verified by a probe). The upgrade Chrome does not do for ws:// at all (only for http://),
// Firefox would turn ws:// into wss:// (its declarativeNetRequest sees the http:// address — verified in Chrome 154 and
// Firefox 159) — the rule leaves WebSocket out in both browsers, so it does the same in both.
/** @type {readonly Types.DeclarativeNetRequest.PartKey[]} */
export const PARAM_PART_KEYS = PART_KEYS.filter( ( key ) => key !== "websocket" );

// The groups a rule of the kind can target (the others it leaves out, ruleParts()).
/** @type {Functions.DeclarativeNetRequest.Rules.kindPartKeys} */
export function kindPartKeys ( kind )
{
	return kind === "params" || kind === "upgrade" ? PARAM_PART_KEYS : PART_KEYS;
}

// The protocol a rule actually targets: the upgrade to HTTPS always only http:// (the selection of the rule stays as it is,
// the editor does not show it for this kind). Chrome and Firefox apply an upgradeScheme rule to an https:// request too —
// it changes nothing there, but the rules lower in the list no longer apply to the request (verified in Chrome 154 and
// Firefox 159).
/** @type {Functions.DeclarativeNetRequest.Rules.ruleProtocol} */
export function ruleProtocol ( rule )
{
	return rule.kind === "upgrade" ? "http" : rule.protocol;
}

// The end of the address pattern regular expression for parameter rules: the address
// with any query or without one.
const ANY_QUERY = "(?:\\?.*)?$";

// How many browser rules with the urlFilter condition "the parameter is in the address" (presenceFilters() — two per
// parameter) may be created from the individual addresses of parameter rules — a bookmark folder can bring thousands of
// them. The dynamic rules of the whole extension are limited (Firefox 5000 in total, Chrome 5000 "unsafe", redirects
// among them) and the bulk layer of the filter lists gets only what the regular rules leave. Addresses over the budget get
// the condition as a regular expression (one per parameter group — fewer rules) within PAGE_REGEX_BUDGET.
export const PAGE_FILTER_BUDGET = 1000;

// How many browser rules with a regular expression may be created from the addresses
// of parameter rules (the "the parameter is in the address" condition for an individual address).
// The whole extension may have at most 1000 of them (MAX_NUMBER_OF_REGEX_RULES, Chrome
// and Firefox; shared with customSearch) — over the limit the browser would reject the whole
// batch of the module. Addresses over the budget get a urlFilter without the condition.
export const PAGE_REGEX_BUDGET = 500;

// Characters of an exact address with a special meaning in urlFilter (exactCondition()) — an address with them gets a
// regular expression; in a pattern "*" stands for anything in urlFilter too (patternUrlFilters()).
const URL_FILTER_SPECIAL = /[|^*]/;

// Types both Chrome and Firefox know — when the browser does not provide the list
// (chrome.declarativeNetRequest.ResourceType is missing, without the permission).
export const COMMON_RESOURCE_TYPES = [
	"main_frame",
	"sub_frame",
	"stylesheet",
	"script",
	"image",
	"font",
	"object",
	"xmlhttprequest",
	"ping",
	"csp_report",
	"media",
	"websocket",
	"other",
];

// Private and local IP addresses — "Except private and local IP addresses" of a rule (exceptPrivate): IPv4 private
// networks (RFC 1918), loopback and link-local, IPv6 loopback, unique local (the private networks of IPv6) and link-local.
// The domain lists of declarativeNetRequest cannot write a range (a domain applies only by the end of the host — verified in
// Chrome 154 and Firefox 159), so the rule excludes them by a regular expression of the request address (NOT_PRIVATE_HOST,
// privateAddressCondition()) — only the address of the request, not that of the page that loads it.
export const PRIVATE_RANGES = [ "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "::1", "fc00::/7", "fe80::/10" ];

const PRIVATE_IPV4 = /^(?:(?:10|127)\.\d+|172\.(?:1[6-9]|2\d|3[01])|192\.168|169\.254)\.\d+\.\d+$/;
const PRIVATE_IPV6 = /^\[(?:::1|f[cd][0-9a-f]{2}:[0-9a-f:]*|fe[89ab][0-9a-f]:[0-9a-f:]*)\]$/;

// Is the host (the hostname of an address as URL gives it: an IPv4 address in four decimal numbers, IPv6 in brackets in
// its shortest form) in PRIVATE_RANGES? A domain name never is.
/** @type {Functions.DeclarativeNetRequest.Rules.isPrivateHost} */
export function isPrivateHost ( host )
{
	const name = String( host || "" ).toLowerCase();
	return PRIVATE_IPV4.test( name ) || PRIVATE_IPV6.test( name );
}

// The beginning of a host that is NOT in PRIVATE_RANGES, as a regular expression without lookahead (Chrome's RE2 has none):
// the host goes character by character along the private addresses and the expression matches as soon as it leaves them —
// a character no private address has there ("[^…]"), or a host that goes on after the numbers of a whole address
// ("10.0.0.1.example"). A private host followed by its end (":" of the port, "/" of the path — the browser compares
// addresses with a path) does not match. The parts: chain() — a fixed text, then the tail; notNumbers() — the rest of an
// IPv4 address (count numbers separated by dots).
/** @type {Functions.DeclarativeNetRequest.Rules.chain} */
function chain ( text, tail )
{
	const first = text[ 0 ];
	const other = `[^${ first.replace( /[\]\\^-]/g, "\\$&" ) }]`;
	if ( text.length === 1 && tail === null ) return other;
	return `(?:${ other }|${ escapeRegex( first ) }${ text.length === 1 ? tail : chain( text.slice( 1 ), tail ) })`;
}
// The rest of an IPv4 address after the beginning of a private range: the hostname of an address has only digits and dots
// only when it is a whole IPv4 address (URL writes "10.1" as "10.0.0.1"), so the host goes on as something else — a
// domain name ("10.0.0.1.example") — exactly when a character other than a digit and a dot comes before its end.
const NOT_IPV4_REST = "[0-9.]*[^0-9.:/]";
const NOT_HEX_COLON_1 = "(?:[^0-9a-f]|[0-9a-f][^:])";
const NOT_HEX_COLON_2 = `(?:[^0-9a-f]|[0-9a-f]${ NOT_HEX_COLON_1 })`;
const DOT_REST = chain( ".", NOT_IPV4_REST );
// The parts of the expression by the beginning of the host — they never match the same host (each begins differently).
// Chrome compiles a regular expression of a rule into at most 2 KB (RE2) — the whole expression is more, so the rules of
// privateAddressCondition() take it in these parts, each with room left for the rest of the address of the condition
// (verified in Chrome 154 by isRegexSupported()).
export const NOT_PRIVATE_HOST_PARTS = [
	// Not 1…, not an IPv6 address; 10.0.0.0/8, 127.0.0.0/8
	`(?:[^1\\[]|1[^02679]|10${ DOT_REST }|12${ chain( "7.", NOT_IPV4_REST ) })`,
	// 169.254.0.0/16
	`16${ chain( "9.254.", NOT_IPV4_REST ) }`,
	// 192.168.0.0/16
	`19${ chain( "2.168.", NOT_IPV4_REST ) }`,
	// 172.16.0.0/12: 172.16.–172.19., 172.20.–172.29., 172.30.–172.31.
	`17${ chain( "2.", `(?:[^123]|1(?:[^6-9]|[6-9]${ DOT_REST }))` ) }`,
	`172\\.2(?:[^0-9]|[0-9]${ DOT_REST })`,
	`172\\.3(?:[^01]|[01]${ DOT_REST })`,
	// [::1]; [fc00::/7], [fe80::/10] — hextets of fc00::/7 and fe80::/10 always have four digits
	`\\[(?:[^f:]|:${ chain( ":1]", null ) })`,
	`\\[f(?:[^cde]|[cd]${ NOT_HEX_COLON_2 })`,
	`\\[fe(?:[^89ab]|[89ab]${ NOT_HEX_COLON_1 })`,
];
export const NOT_PRIVATE_HOST = `(?:${ NOT_PRIVATE_HOST_PARTS.join( "|" ) })`;

// The pattern of all addresses ("*", "http://*", "https://*" — parsePageList()).
const ALL_ADDRESSES_PATTERN = /^\^[a-z?]+:\/\/\.\*\$$/;

// The host a pattern writes out whole (the source of its regular expression, parsePageList()): the text after the scheme up
// to "/" or ":" of the port, without "*" — as URL writes it ("[::1]", "10.0.0.1"); null when the pattern does not fix the
// host ("*.example.com/*", "*/admin/*", "10.0.*").
/** @type {Functions.DeclarativeNetRequest.Rules.patternHost} */
function patternHost ( pattern )
{
	const match = /^\^[^:]+:\/\/(\\\[[0-9a-f:]*\\\]|(?:\\.|[^\\.*/:[])+)(?=[/:]|\$)/i.exec( pattern );
	if ( !match ) return null;
	try {
		return new URL( `http://${ match[ 1 ].replace( /\\(.)/g, "$1" ) }/` ).hostname;
	} catch {
		return null;
	}
}

// Does the rule except private and local IP addresses (exceptPrivate)? Not a GET parameter rule — the conditions "the
// parameter is in the address" would each need the whole NOT_PRIVATE_HOST_PARTS.
/** @type {Functions.DeclarativeNetRequest.Rules.exceptsPrivate} */
export function exceptsPrivate ( rule )
{
	return rule.exceptPrivate && rule.kind !== "params";
}

// A condition whose request host is not fixed (all addresses, files the pages of the domains load from elsewhere) without
// requests to private and local IP addresses: one condition with the regular expression "the scheme, then a host that is
// not private" per part of NOT_PRIVATE_HOST_PARTS — the scheme from its urlFilter ("|http" → http and https, "|https://"),
// without urlFilter any. Another urlFilter (the host is in it) stays as it is.
/** @type {Functions.DeclarativeNetRequest.Rules.privateExcluded} */
function privateExcluded ( condition )
{
	const { urlFilter, ...rest } = condition;
	if ( condition.regexFilter ) return [ condition ];
	const scheme = urlFilter === undefined ? [ "[^:]+", "://" ] : /^\|([a-z][a-z0-9+.-]*)(:\/\/)?$/i.exec( urlFilter )?.slice( 1 );
	if ( !scheme ) return [ condition ];
	const prefix = scheme[ 1 ] === undefined && scheme[ 0 ].toLowerCase() === "http" ? "https?" : scheme[ 0 ].toLowerCase();
	return NOT_PRIVATE_HOST_PARTS.map( ( part ) => ( { ...rest, regexFilter: `^${ prefix }://${ part }` } ) );
}

// The color of a rule the user chose in the editor (the line next to the rule in the overview of declarativeNetRequestSandbox):
// "#rrggbb" in lowercase as <input type="color"> gives it, anything else = no color ("").
/** @type {Functions.DeclarativeNetRequest.Rules.normalizeColor} */
export function normalizeColor ( value )
{
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test( value.trim() ) ? value.trim().toLowerCase() : "";
}

// The module's default rules (the background part uses them and the editor shows them until the user
// saves the rules): removing
// tracking and measurement GET parameters from all addresses — the parameter list
// according to PrivacyTests.org and more, each name with a note in a comment (parseComments()) —, and blocking
// dangerous CDN servers.
/** @type {readonly Types.DeclarativeNetRequest.RuleSetting[]} */
export const DEFAULT_RULES = [
	{
		id: "privacytests-tracking-params",
		title: "Remove tracking and measurement GET parameters from all URLs. ( list from PrivacyTests.org + added more params )",
		enabled: true,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#2172a1",
		protocol: "any",
		kind: "params",
		headers: [],
		params: [
			"__hsfp /* (HubSpot Fingerprint) - CRM tracking system */",
			"__hssc /* (HubSpot session) - CRM tracking system */",
			"__hstc /* (HubSpot cookie) - CRM tracking system */",
			"__s /* Drip subscriber ID - email sender tracking */",
			"_hsenc /* HubSpot tracking parameter */",
			"_openstat /* Yandex tracking parameter */",
			"dclid /* DoubleClick Click ID (Google) */",
			"fbclid /* Facebook Click Identifier */",
			"gclid /* Google Click Identifier */",
			"hsCtaTracking /* HubSpot tracking parameter */",
			"mc_eid /* Mailchimp Email ID (email recipient's address) */",
			"mkt_tok /* Adobe Marketo tracking parameter */",
			"ml_subscriber /* MailerLite email tracking */",
			"ml_subscriber_hash /* MailerLite email tracking */",
			"msclkid /* Microsoft Click ID */",
			"oly_anon_id /* Omeda marketing 'anonymous' customer id */",
			"oly_enc_id /* Omeda marketing 'known' customer id */",
			"rb_clickid /* Unknown high-entropy tracking parameter */",
			"s_cid /* Adobe Site Catalyst tracking parameter */",
			"vero_conv /* Vero tracking parameter */",
			"vero_id /* Vero tracking parameter */",
			"wickedid /* Wicked Reports e-commerce tracking */",
			"yclid /* Yandex Click ID */",
			"wbraid /* (Web Browser Click Identifier) - Google tracking parameter */",
			"gbraid /* (Google Browser Click Identifier) - Google tracking parameter */",
			"ttclid /* (TikTok Click ID) - TikTok tracking parameter */",
			"_cclid /* (ClickCease Click Identifier) - ClickCease tracking parameter */",
			"utm_source /* Urchin Tracking Module (renamed to Google Analytics, but the letter u remained) */",
			"utm_medium /* Urchin Tracking Module (renamed to Google Analytics, but the letter u remained) */",
			"utm_campaign /* Urchin Tracking Module (renamed to Google Analytics, but the letter u remained) */",
			"utm_term /* Urchin Tracking Module (renamed to Google Analytics, but the letter u remained) */",
			"utm_content /* Urchin Tracking Module (renamed to Google Analytics, but the letter u remained) */",
		].map( ( param ) => ( { param, operation: /** @type {const} */ ( "remove" ), value: "" } ) ),
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	// Blocking all requests to CDN servers known for serving malicious code (from any
	// page — requestDomains), and files the pages of these domains load. Only domains, no
	// addresses: the "*" address of a blocking rule would block every request.
	{
		id: "dangerous-cdn-block",
		title: "Block dangerous CDN servers",
		enabled: true,
		notifyMatched: true,
		logMatched: false,
		closedInOverview: true,
		color: "#4b2da4",
		protocol: "any",
		kind: "block",
		headers: [],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: [
			"polyfill.io",
			"bootcss.com",
			"bootcdn.net",
			"staticfile.org",
			"staticfile.net",
			"yandex.cloud",
			"yandexcloud.net",
			"yccdn.ru",
			"integritytech.com.cn",
		].join( "\n" ),
		pages: "",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	// Removing GET parameters Facebook adds to its own addresses without need.
	{
		id: "facebook-unnecessary-params",
		title: "Facebook - remove unnecessary GET parameters",
		enabled: true,
		notifyMatched: false,
		logMatched: true,
		closedInOverview: true,
		color: "#65ce2c",
		protocol: "https",
		kind: "params",
		headers: [],
		params: [ "locale", "set", "type" ].map( ( param ) => ( { param, operation: /** @type {const} */ ( "remove" ), value: "" } ) ),
		parts: [ "page" ],
		domains: "www.facebook.com",
		pages: "",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	// Redirecting all unencrypted (http) requests on the internet to encrypted ones (https) — every address ("*"), the upgrade
	// targets only http:// (ruleProtocol()); the same exceptions as the blocking below it: local servers (localhost and its
	// subdomains, 127.0.0.1, .local names) and private and local IP addresses (PRIVATE_RANGES). Above the blocking — with both
	// on the redirect gets the http:// requests first (the higher priority) and the blocking catches only what it leaves:
	// WebSocket (ws://), which it does not redirect. Written into the own event log — without onRuleMatchedDebug from the
	// requests the browser redirected to https (webRequest.onBeforeRedirect, matchUpgradedRequest()).
	{
		id: "redirect-unencrypted-http",
		title: "Redirect unencrypted communication (http) to encrypted (https)",
		enabled: false,
		notifyMatched: false,
		logMatched: true,
		closedInOverview: true,
		color: "#df602a",
		protocol: "http",
		kind: "upgrade",
		headers: [],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: [ "localhost", "127.0.0.1", "*.local", "*.localhost" ].join( "\n" ),
		exceptPrivate: true,
		exceptExtension: false,
	},
	// Blocking all unencrypted (http) requests on the internet — every address ("*") limited to the http protocol;
	// local servers (localhost and its subdomains, 127.0.0.1, .local names) and private and local IP addresses
	// (PRIVATE_RANGES) are an exception. "HTTP only" covers unencrypted WebSocket (ws://) too.
	{
		id: "block-unencrypted-http",
		title: "Block unencrypted communication (http), use only https",
		enabled: false,
		notifyMatched: true,
		logMatched: false,
		closedInOverview: true,
		color: "#28a47f",
		protocol: "http",
		kind: "block",
		headers: [],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: [ "localhost", "127.0.0.1", "*.local", "*.localhost" ].join( "\n" ),
		exceptPrivate: true,
		exceptExtension: false,
	},
	// Privacy and preference signals sent with every request (a request header set on all addresses, "*"). Each one is
	// uncommon — the title warns it could make the browser easier to identify; the last three are off by default.
	{
		id: "sec-gpc-header",
		title: "Disagreement with the sale or sharing of their personal data and tracking across websites (but be careful - could also serve to identify you, as this declaration is not common)",
		enabled: true,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#1f5cad",
		protocol: "any",
		kind: "headers",
		headers: [ { direction: "request", header: "Sec-GPC", operation: "set", value: "1" } ],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	{
		id: "cookie-preference-functional",
		title: "Pre-emptive consent for cookies set to 'functional only' (but be careful - could also serve to identify you, as this declaration is not common)",
		enabled: true,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#86d327",
		protocol: "any",
		kind: "headers",
		headers: [ { direction: "request", header: "Cookie-Preference", operation: "set", value: "functional" } ],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	{
		id: "prefers-color-scheme-dark",
		title: "Forwarded dark mode request (but be careful - could also serve to identify you, as this declaration is not common)",
		enabled: false,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#cc1e4d",
		protocol: "any",
		kind: "headers",
		headers: [ { direction: "request", header: "Sec-CH-Prefers-Color-Scheme", operation: "set", value: "dark" } ],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	{
		id: "save-data-header",
		title: "Forward request for data savings (but be careful - could also serve to identify you, as this declaration is not common)",
		enabled: false,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#35cb1a",
		protocol: "any",
		kind: "headers",
		headers: [ { direction: "request", header: "Save-Data", operation: "set", value: "on" } ],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	{
		id: "prefer-minimal-safe",
		title: "The Prefer header: an example requesting minimal data and safe (age-appropriate) content. (but be careful - could also serve to identify you, as this declaration is not common)",
		enabled: false,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "#a836dd",
		protocol: "any",
		kind: "headers",
		headers: [ { direction: "request", header: "Prefer", operation: "set", value: "return=minimal, safe=on" } ],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	},
	// Blocking scripts and fetch/XHR on all pages as the default — the user lets a site through by adding it to the "Except"
	// domains (also the button "Add <domain> to the exceptions list" of the overview): on its pages then all scripts and
	// fetch/XHR pass (also from elsewhere — excludedInitiatorDomains), and the scripts from it pass on all pages
	// (excludedRequestDomains). The last in the list — the lowest priority; no rule of the module lets a blocked request
	// through (there is no "allow" kind), the rules above it do their work and the request is blocked after it. Except the
	// requests of this extension (exceptExtension) — the blocking would stop its own fetch() (DNSInfo, domainInfo, the filter
	// lists); local servers the same as the HTTP rules above. Off by default: on it stops the scripts of every page that is
	// not an exception.
	{
		id: "default-block-scripts-xhr",
		title: "Default blocking of scripts and fetch/XHR on all pages - allow a site by adding it to Except domains",
		enabled: false,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: false,
		color: "#d2b532",
		protocol: "any",
		kind: "block",
		headers: [],
		params: [],
		parts: [ "scripts", "xhr" ],
		domains: "",
		pages: "*",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: [ "localhost", "127.0.0.1", "*.local", "*.localhost" ].join( "\n" ),
		exceptPrivate: false,
		exceptExtension: true,
	},
];

// The rule the button "Block the image permanently" of imageInfoSandbox adds the addresses of images to (through the core —
// the function imageInfo.blockImage outside the sandbox, BLOCK_IMAGE_SERVICE of module.mjs, addBlockedImage()): blocking,
// images only, exact addresses — one rule for all of them, so the user turns them off or removes them at once in the
// editor. It is found by its id: the title, the place in the list and the rest of the rule are the user's to change.
export const IMAGE_BLOCK_RULE_ID = "image-info-sandbox-blocked-images";
export const IMAGE_BLOCK_RULE_TITLE = "Image info sandbox - blocked images";

/** @type {Functions.DeclarativeNetRequest.Rules.newRuleId} */
export function newRuleId ()
{
	return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
		? crypto.randomUUID().slice( 0, 8 )
		: Math.random().toString( 36 ).slice( 2, 10 );
}

/** @type {Functions.DeclarativeNetRequest.Rules.emptyRule} */
export function emptyRule ( id )
{
	return {
		id,
		title: "",
		enabled: true,
		notifyMatched: false,
		logMatched: false,
		closedInOverview: true,
		color: "",
		protocol: "any",
		kind: "headers",
		headers: [],
		params: [],
		parts: [ ...PART_KEYS ],
		domains: "",
		pages: "",
		folderId: "",
		folderTitle: "",
		wholeDomain: false,
		exceptDomains: "",
		exceptPrivate: false,
		exceptExtension: false,
	};
}

// Stored settings → an always usable array of rules. Items that are not
// an object drop out; a missing or repeated id gets a replacement. Without
// stored parts (parts) the rule applies to everything, without a kind (rules
// from the time before GET parameters) it edits headers.
/** @type {Functions.DeclarativeNetRequest.Rules.normalizeRules} */
export function normalizeRules ( value )
{
	/** @type {Types.DeclarativeNetRequest.RuleSetting[]} */
	const rules = [];
	/** @type {Set<string>} */
	const ids = new Set();
	/** @type {Functions.DeclarativeNetRequest.Rules.normalizeRules.text} */
	const text = ( item ) => ( typeof item === "string" ? item : "" );
	const items = Array.isArray( value ) ? value : [];
	items.forEach( ( item, index ) =>
	{
		if ( !item || typeof item !== "object" ) return;
		const row = /** @type {Record<string, unknown>} */ ( item );
		let id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `auto-${ index }`;
		for ( let n = 2; ids.has( id ); n++ ) id = `${ id }-${ n }`;
		ids.add( id );
		/** @type {Types.DeclarativeNetRequest.HeaderEdit[]} */
		const headers = [];
		for ( const entry of Array.isArray( row.headers ) ? row.headers : [] ) {
			if ( !entry || typeof entry !== "object" ) continue;
			const edit = /** @type {Record<string, unknown>} */ ( entry );
			headers.push( {
				direction: DIRECTIONS.find( ( direction ) => direction === edit.direction ) || "request",
				header: text( edit.header ).trim(),
				operation: OPERATIONS.find( ( operation ) => operation === edit.operation ) || "remove",
				value: text( edit.value ),
			} );
		}
		/** @type {Types.DeclarativeNetRequest.ParamEdit[]} */
		const params = [];
		for ( const entry of Array.isArray( row.params ) ? row.params : [] ) {
			if ( !entry || typeof entry !== "object" ) continue;
			const edit = /** @type {Record<string, unknown>} */ ( entry );
			params.push( {
				param: text( edit.param ).trim(),
				operation: PARAM_OPERATIONS.find( ( operation ) => operation === edit.operation ) || "remove",
				value: text( edit.value ),
				// The related parameter ("and at the same time") only when the edit has one — also an empty one (not filled in yet).
				...( typeof edit.andParam === "string" ? { andParam: edit.andParam.trim() } : {} ),
			} );
		}
		const parts = Array.isArray( row.parts ) ? PART_KEYS.filter( ( key ) => /** @type {unknown[]} */ ( row.parts ).includes( key ) ) : [ ...PART_KEYS ];
		rules.push( {
			id,
			title: text( row.title ).trim(),
			enabled: row.enabled !== false,
			notifyMatched: row.notifyMatched === true,
			logMatched: row.logMatched === true,
			// A rule stored before this setting existed stays folded, as the overview always listed it.
			closedInOverview: row.closedInOverview !== false,
			color: normalizeColor( row.color ),
			protocol: PROTOCOLS.find( ( protocol ) => protocol === row.protocol ) || "any",
			kind: RULE_KINDS.find( ( kind ) => kind === row.kind ) || "headers",
			headers,
			params,
			parts,
			domains: text( row.domains ),
			pages: text( row.pages ),
			folderId: text( row.folderId ),
			folderTitle: text( row.folderTitle ),
			wholeDomain: row.wholeDomain === true,
			exceptDomains: text( row.exceptDomains ),
			exceptPrivate: row.exceptPrivate === true,
			exceptExtension: row.exceptExtension === true,
		} );
	} );
	return rules;
}

// Comments in the text of a field: "/*" opens one, the first "*/" after it closes it; one without "*/" runs to the end of the
// field (unclosed). separated (the addresses, the values of headers and parameters): "/*" opens a comment only at the
// beginning of the field, after whitespace (also at the beginning of a line) or right after another comment — "/*" right
// after other text is a part of it there (the pattern "https://example.com/*", the value "*/*" of Accept). The spaces and
// tabs around a comment go with it: between two texts on one line it leaves one space (a comment with a line break one line
// break), at the beginning or the end of a line nothing — "a.test /* note */ b.test" → "a.test b.test".
/** @type {Functions.DeclarativeNetRequest.Rules.parseComments} */
export function parseComments ( value, separated = false )
{
	const text = typeof value === "string" ? value : "";
	if ( !text.includes( "/*" ) ) return { text, unclosed: false };
	/** @type {string[]} */
	const out = [];
	// The beginning of the text not copied yet, where the next "/*" is looked for, the end of the last comment.
	let position = 0;
	let search = 0;
	let lastEnd = -1;
	// The comments since the last copied text: null — none, otherwise whether one of them has a line break.
	/** @type {boolean | null} */
	let gap = null;
	// The output so far ends at the beginning of a line (it is empty, or its last character is a line break).
	let lineStart = true;
	let unclosed = false;
	/** @type {Functions.DeclarativeNetRequest.Rules.parseComments.copy} */
	const copy = ( end ) =>
	{
		const lineEnd = text[ position ] === "\n" || text[ position ] === "\r";
		if ( gap !== null && !lineStart && !lineEnd ) out.push( gap ? "\n" : " " );
		out.push( text.slice( position, end ) );
		lineStart = text[ end - 1 ] === "\n";
		gap = null;
	};
	for ( ;; ) {
		const start = text.indexOf( "/*", search );
		if ( start < 0 ) break;
		search = start + 1;
		if ( separated && start > 0 && start !== lastEnd && !/\s/.test( text[ start - 1 ] ) ) continue;
		let cut = start;
		while ( cut > position && ( text[ cut - 1 ] === " " || text[ cut - 1 ] === "\t" ) ) cut--;
		if ( cut > position ) copy( cut );
		const close = text.indexOf( "*/", start + 2 );
		const end = close < 0 ? text.length : close + 2;
		gap = gap === true || text.slice( start, end ).includes( "\n" );
		lastEnd = end;
		position = end;
		while ( position < text.length && ( text[ position ] === " " || text[ position ] === "\t" ) ) position++;
		if ( close < 0 ) {
			unclosed = true;
			break;
		}
		search = end;
	}
	if ( position < text.length ) copy( text.length );
	return { text: out.join( "" ), unclosed };
}

// The text of a field without its comments (parseComments()).
/** @type {Functions.DeclarativeNetRequest.Rules.stripComments} */
export function stripComments ( value, separated = false )
{
	return parseComments( value, separated ).text;
}

// The rule as it applies — its text fields without the comments (parseComments()): the name, the names of headers and
// parameters and the domains with "/*" anywhere, the addresses and the values only separated. What converts or checks a rule
// (compileRules(), regexReasons(), privateGaps(), the checks of the editor) takes it like this; validEdits(),
// validParams(), hasValidEdits() and ruleHasTargets() expect it already without them.
/** @type {Functions.DeclarativeNetRequest.Rules.withoutComments} */
export function withoutComments ( rule )
{
	return {
		...rule,
		title: stripComments( rule.title ).trim(),
		headers: rule.headers.map( ( edit ) => ( { ...edit, header: stripComments( edit.header ).trim(), value: stripComments( edit.value, true ) } ) ),
		params: rule.params.map( ( edit ) => ( {
			...edit,
			param: stripComments( edit.param ).trim(),
			value: stripComments( edit.value, true ),
			...( typeof edit.andParam === "string" ? { andParam: stripComments( edit.andParam ).trim() } : {} ),
		} ) ),
		domains: stripComments( rule.domains ),
		pages: stripComments( rule.pages, true ),
		exceptDomains: stripComments( rule.exceptDomains ),
	};
}

// The text of a field with one more line at its end; a comment without "*/" at its end gets "*/" first — otherwise the line
// would be in it.
/** @type {Functions.DeclarativeNetRequest.Rules.appendLine} */
function appendLine ( text, line, separated )
{
	const trimmed = text.trimEnd();
	if ( !trimmed ) return line;
	return `${ trimmed }${ parseComments( text, separated ).unclosed ? " */" : "" }\n${ line }`;
}

// The rule title for the output: the entered one (without comments), otherwise "Rule N" by order.
/** @type {Functions.DeclarativeNetRequest.Rules.ruleTitle} */
export function ruleTitle ( rule, index )
{
	return stripComments( rule.title ).trim() || t( "declarativeNetRequest_rule_untitled", String( index + 1 ) );
}

// The rule's header edits that go into the browser (filled in and without an error) — of a rule without comments
// (withoutComments()), the same as validParams(), hasValidEdits() and ruleHasTargets().
/** @type {Functions.DeclarativeNetRequest.Rules.validEdits} */
export function validEdits ( rule )
{
	return rule.headers.filter( ( edit ) => !isBlankHeader( edit ) && headerProblem( edit ) === null );
}

// The rule's GET parameter edits that go into the browser.
/** @type {Functions.DeclarativeNetRequest.Rules.validParams} */
export function validParams ( rule )
{
	return rule.params.filter( ( edit ) => !isBlankParam( edit ) && paramProblem( edit ) === null );
}

// Does the rule do anything? (valid edits of its kind; blocking and the upgrade to HTTPS always)
/** @type {Functions.DeclarativeNetRequest.Rules.hasValidEdits} */
export function hasValidEdits ( rule )
{
	if ( rule.kind === "block" || rule.kind === "upgrade" ) return true;
	return ( rule.kind === "params" ? validParams( rule ) : validEdits( rule ) ).length > 0;
}

// "Which requests" groups the rule actually targets (a parameter rule and the upgrade to HTTPS without
// WebSocket — kindPartKeys(); blocking also WebSocket).
/** @type {Functions.DeclarativeNetRequest.Rules.ruleParts} */
export function ruleParts ( rule )
{
	const keys = kindPartKeys( rule.kind );
	return rule.parts.filter( ( key ) => keys.includes( key ) );
}

// Non-empty lines of text (trimmed), without repetition.
/** @type {Functions.DeclarativeNetRequest.Rules.parseLines} */
export function parseLines ( value )
{
	/** @type {string[]} */
	const lines = [];
	for ( const line of typeof value === "string" ? value.split( /\r?\n/ ) : [] ) {
		const trimmed = line.trim();
		if ( trimmed && !lines.includes( trimmed ) ) lines.push( trimmed );
	}
	return lines;
}

// The address without the part after "#" in a uniform form (lowercase host, without
// the default port, non-ASCII characters encoded); only http(s), otherwise null.
// withoutQuery: also without the part after "?" (the address of parameter rules).
/** @type {Functions.DeclarativeNetRequest.Rules.pageKey} */
export function pageKey ( url, withoutQuery = false )
{
	if ( typeof url !== "string" || !url ) return null;
	try {
		const parsed = new URL( url );
		if ( parsed.protocol !== "http:" && parsed.protocol !== "https:" ) return null;
		parsed.hash = "";
		if ( withoutQuery ) parsed.search = "";
		return parsed.href;
	} catch {
		return null;
	}
}

// The bookmark domain for the "whole domain" option: the host of an http(s) address without the trailing
// dot and without "www." at the beginning; otherwise null.
/** @type {Functions.DeclarativeNetRequest.Rules.siteOf} */
export function siteOf ( url )
{
	if ( typeof url !== "string" || !url ) return null;
	try {
		const { protocol, hostname } = new URL( url );
		if ( protocol !== "http:" && protocol !== "https:" ) return null;
		return hostname.replace( /\.$/, "" ).replace( /^www\./, "" ) || null;
	} catch {
		return null;
	}
}

// The address list from the field text: exact addresses (pageKey) and patterns with "*" (the source
// of a whole-address regular expression — the browser compares it case-insensitively —, and the same pattern for urlFilter
// in patternFilters, patternUrlFilters()). A line without a scheme applies to http and https; non-ASCII
// characters in a pattern are encoded as in the address the browser sends
// (%C5%BE). What cannot be read as an address is in invalid. withoutQuery
// (parameter rules): the line applies without the part after "?" and "#" to the address
// with any query.
/** @type {Functions.DeclarativeNetRequest.Rules.parsePageList} */
export function parsePageList ( value, withoutQuery = false )
{
	/** @type {string[]} */
	const exact = [];
	/** @type {string[]} */
	const patterns = [];
	/** @type {Types.DeclarativeNetRequest.PatternFilter[]} */
	const patternFilters = [];
	/** @type {string[]} */
	const invalid = [];
	for ( const fullLine of parseLines( value ) ) {
		const line = withoutQuery ? fullLine.replace( /[?#].*$/s, "" ) : fullLine;
		const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test( line );
		if ( line.includes( "*" ) ) {
			// eslint-disable-next-line no-control-regex -- [^\x00-\x7f] = znaky mimo ASCII
			const parts = line.split( "*" ).map( ( part ) => part.replace( /[^\x00-\x7f]+/g, ( chars ) => encodeURIComponent( chars ) ) );
			const pattern = `^${ hasScheme ? "" : "https?://" }${ parts.map( escapeRegex ).join( ".*" ) }${ withoutQuery ? ANY_QUERY : "$" }`;
			if ( !patterns.includes( pattern ) ) {
				patterns.push( pattern );
				patternFilters.push( { line: fullLine, filters: patternUrlFilters( parts.join( "*" ), hasScheme ) } );
			}
			continue;
		}
		const keys = ( hasScheme ? [ line ] : [ `http://${ line }`, `https://${ line }` ] ).map( ( url ) => pageKey( url, withoutQuery ) );
		if ( keys.some( ( key ) => key === null ) ) {
			invalid.push( fullLine );
			continue;
		}
		for ( const key of /** @type {string[]} */ ( keys ) ) if ( !exact.includes( key ) ) exact.push( key );
	}
	return { exact, patterns, patternFilters, invalid };
}

// The beginnings of the urlFilter conditions of a pattern with "*" (text: the line with the characters outside ASCII
// encoded) — the same addresses as its regular expression, "*" stands for anything in urlFilter too; the end (of the
// address, the query) adds buildNetworkRules(). A line with a scheme "|" + the line; without one for http and https — a
// line that starts with "*" as one "|http*…" (every address the browser compares starts with its scheme, of them only
// http and https with "http"), otherwise two. null: the line has "|" or "^" (an anchor and a separator in urlFilter —
// it cannot write them as characters), the pattern then goes as a regular expression.
/** @type {Functions.DeclarativeNetRequest.Rules.patternUrlFilters} */
function patternUrlFilters ( text, hasScheme )
{
	if ( /[|^]/.test( text ) ) return null;
	if ( hasScheme ) return [ `|${ text }` ];
	if ( text.startsWith( "*" ) ) return [ `|http${ text }` ];
	return [ `|http://${ text }`, `|https://${ text }` ];
}

// The address of an image (http, https) into the rule of the blocked images (IMAGE_BLOCK_RULE_ID) — a new list of the rules,
// the given one stays unchanged; null for another address. The address goes in without the part after "#" (pageKey()) as a
// new line of the addresses — the lines the user wrote stay as they are; added: false when the rule already has it. Without
// the rule a new one goes first in the list — the highest priority: a redirect of a rule lower in the list (GET parameters)
// does not get ahead of the blocking. A "*" in the address is a pattern there (parsePageList()) — it still covers the address.
// The comments of the addresses do not count, they stay as they are (appendLine()).
/** @type {Functions.DeclarativeNetRequest.Rules.addBlockedImage} */
export function addBlockedImage ( rules, url )
{
	const key = pageKey( url );
	if ( key === null ) return null;
	const index = rules.findIndex( ( rule ) => rule.id === IMAGE_BLOCK_RULE_ID );
	/** @type {Types.DeclarativeNetRequest.RuleSetting} */
	const current = index >= 0 ? rules[ index ] : { ...emptyRule( IMAGE_BLOCK_RULE_ID ), title: IMAGE_BLOCK_RULE_TITLE, kind: "block", parts: [ "images" ] };
	const pages = stripComments( current.pages, true );
	if ( parseLines( pages ).includes( key ) || parsePageList( pages ).exact.includes( key ) ) return { rules, rule: current, added: false };
	const rule = { ...current, pages: appendLine( current.pages, key, true ) };
	return { rules: index >= 0 ? rules.map( ( item, position ) => ( position === index ? rule : item ) ) : [ rule, ...rules ], rule, added: true };
}

// The rule the buttons "Block the domain …" and "Block this address" of the overview of declarativeNetRequestSandbox add the
// page of the active tab to (the service declarativeNetRequest.blockPage, BLOCK_PAGE_SERVICE of module.mjs, addBlockedPage()):
// blocking all requests — one rule for all the pages blocked while browsing, so the user turns them off or removes them at
// once in the editor. Found by its id, the same as the rule of the blocked images.
export const PAGE_BLOCK_RULE_ID = "direct-blocking-list-created-by-browsing";
export const PAGE_BLOCK_RULE_TITLE = "Direct blocking list created by browsing";

// What of the page the buttons block: the whole domain, or the exact address.
/** @type {readonly Types.DeclarativeNetRequest.BlockPageScope[]} */
export const BLOCK_PAGE_SCOPES = [ "domain", "url" ];

// The domain the block of the whole domain of a page adds (addBlockedPage(), the label of the button): the host of an http(s)
// address without "www." (siteOf(), the same as the "whole domain" of a bookmark folder) as a domain of a rule; null when there
// is none (not http(s), a host with "_"); an IPv6 address in brackets ("[::1]").
/** @type {Functions.DeclarativeNetRequest.Rules.blockedPageDomain} */
export function blockedPageDomain ( url )
{
	return parseDomainList( [ siteOf( url ) ?? "" ] )[ 0 ] ?? null;
}

// The page of an http(s) address into the rule of the pages blocked while browsing (PAGE_BLOCK_RULE_ID) — a new list of the
// rules, the given one stays unchanged; null for another address (or, for "domain", a host that cannot be a domain of a rule —
// one with "_"). scope "domain": blockedPageDomain() as a new line of the domains — requests to it and its subdomains and files its
// pages load from elsewhere; "url": the address without the part after "#" (pageKey()) as a new line of the addresses — only
// requests to exactly that address. target: what goes into the rule; added: false when the rule already covers it (its
// domains cover the domain, for "url" the host — or its addresses or patterns the address). The lines the user wrote stay as
// they are; without the rule a new one goes first in the list — the highest priority, the same as addBlockedImage() (a "*"
// in the address is a pattern there too — it still covers the address). The comments of the fields do not count either.
/** @type {Functions.DeclarativeNetRequest.Rules.addBlockedPage} */
export function addBlockedPage ( rules, url, scope )
{
	const key = pageKey( url );
	if ( key === null || !BLOCK_PAGE_SCOPES.includes( scope ) ) return null;
	const index = rules.findIndex( ( rule ) => rule.id === PAGE_BLOCK_RULE_ID );
	/** @type {Types.DeclarativeNetRequest.RuleSetting} */
	const current = index >= 0 ? rules[ index ] : { ...emptyRule( PAGE_BLOCK_RULE_ID ), title: PAGE_BLOCK_RULE_TITLE, kind: "block" };
	const domains = parseDomainList( stripComments( current.domains ) );
	/** @type {Functions.DeclarativeNetRequest.Rules.addBlockedPage.result} */
	const result = ( rule, target ) => ( {
		rules: index >= 0 ? rules.map( ( item, position ) => ( position === index ? rule : item ) ) : [ rule, ...rules ],
		rule,
		target,
		added: true,
	} );
	if ( scope === "domain" ) {
		const domain = blockedPageDomain( url );
		if ( domain === null ) return null;
		if ( isHostInDomains( domain, domains ) ) return { rules, rule: current, target: domain, added: false };
		return result( { ...current, domains: appendLine( current.domains, domain, false ) }, domain );
	}
	const pages = parsePageList( stripComments( current.pages, true ) );
	if ( isHostInDomains( new URL( key ).hostname, domains ) || pages.exact.includes( key ) || pages.patterns.some( ( pattern ) => new RegExp( pattern, "i" ).test( key ) ) ) {
		return { rules, rule: current, target: key, added: false };
	}
	return result( { ...current, pages: appendLine( current.pages, key, true ) }, key );
}

// The domain of the page of an http(s) address into the "Except" domains of the rule with the id (the button "Add <domain>
// to the exceptions list" of the overview of declarativeNetRequestSandbox — the service declarativeNetRequest.addExceptDomain,
// EXCEPT_DOMAIN_SERVICE of module.mjs): blockedPageDomain() — the host without "www.", the same domain the buttons
// "Suspend temporarily for <domain>" and "Block the domain …" take — as a new line of the "Except" domains; the rule then
// targets neither requests to the domain and its subdomains nor files its pages load from elsewhere. A new list of the
// rules, the given one stays unchanged, the rule keeps its place (its priority); the lines the user wrote stay as they are
// (their comments do not count, appendLine()). added: false when the "Except" domains already cover the domain (it or
// a domain above it). null: no rule with the id, or an address without a domain of a rule (not http(s), a host with "_").
/** @type {Functions.DeclarativeNetRequest.Rules.addExceptDomain} */
export function addExceptDomain ( rules, id, url )
{
	const domain = blockedPageDomain( url );
	const index = rules.findIndex( ( rule ) => rule.id === id );
	if ( domain === null || index < 0 ) return null;
	const current = rules[ index ];
	if ( isHostInDomains( domain, parseDomainList( stripComments( current.exceptDomains ) ) ) ) return { rules, rule: current, domain, added: false };
	const rule = { ...current, exceptDomains: appendLine( current.exceptDomains, domain, false ) };
	return { rules: rules.map( ( item, position ) => ( position === index ? rule : item ) ), rule, domain, added: true };
}

// Does the rule have somewhere to apply? (domains, addresses, or a bookmark folder; a rule without comments)
/** @type {Functions.DeclarativeNetRequest.Rules.ruleHasTargets} */
export function ruleHasTargets ( rule )
{
	return parseDomainList( rule.domains ).length > 0 || parseLines( rule.pages ).length > 0 || !!rule.folderId;
}

// Rules prepared for conversion and matching — only enabled ones that
// do something, target something and have somewhere to apply. bookmarkUrls: bookmark addresses of the
// rules' folders (folder id → addresses, see collectBookmarkUrls()); a folder
// missing from it (the bookmarks cannot be read) does not count. Priority: the first
// rule in the list highest. The comments of the fields do not count (withoutComments()). extensionHost: the host of this
// extension (chrome-extension://<id>/, moz-extension://<uuid>/ — the background part, the editor from its answer) for the
// rules with "Except the requests of this extension"; without it (null — tests, an older background part) they get nothing.
/** @type {Functions.DeclarativeNetRequest.Rules.compileRules} */
export function compileRules ( rules, bookmarkUrls, extensionHost = null )
{
	// The host as a domain of a rule — the browser would reject all the rules of the module for an invalid one.
	const ownHosts = parseDomainList( extensionHost ? [ extensionHost ] : [] );
	/** @type {Types.DeclarativeNetRequest.CompiledRule[]} */
	const compiled = [];
	rules.forEach( ( stored, index ) =>
	{
		const rule = withoutComments( stored );
		const parts = ruleParts( rule );
		if ( !rule.enabled || parts.length === 0 || !hasValidEdits( rule ) ) return;
		const params = rule.kind === "params";
		const pages = parsePageList( rule.pages, params );
		const folderUrls = ( rule.folderId && bookmarkUrls.get( rule.folderId ) ) || [];
		/** @type {Set<string>} */
		const exactPages = new Set( pages.exact );
		/** @type {string[]} */
		const domains = parseDomainList( rule.domains );
		for ( const url of folderUrls ) {
			const key = pageKey( url, params );
			if ( key !== null ) exactPages.add( key );
			const site = rule.wholeDomain ? siteOf( url ) : null;
			if ( site !== null && !domains.includes( site ) ) domains.push( site );
		}
		// "Except private and local IP addresses": domains, addresses and patterns with such a host drop out.
		const exceptPrivate = exceptsPrivate( rule );
		let { patterns: pagePatterns, patternFilters } = pages;
		if ( exceptPrivate ) {
			for ( const page of exactPages ) if ( isPrivateHost( new URL( page ).hostname ) ) exactPages.delete( page );
			domains.splice( 0, domains.length, ...domains.filter( ( domain ) => !isPrivateHost( domain ) ) );
			const kept = pagePatterns.map( ( pattern ) => !isPrivateHost( patternHost( pattern ) ) );
			pagePatterns = pagePatterns.filter( ( _, index ) => kept[ index ] );
			patternFilters = patternFilters.filter( ( _, index ) => kept[ index ] );
		}
		if ( domains.length === 0 && exactPages.size === 0 && pagePatterns.length === 0 ) return;
		compiled.push( {
			id: rule.id,
			title: ruleTitle( rule, index ),
			priority: rules.length - index,
			notifyMatched: rule.notifyMatched,
			logMatched: rule.logMatched,
			closedInOverview: rule.closedInOverview,
			color: rule.color,
			protocol: ruleProtocol( rule ),
			kind: rule.kind,
			headers: rule.kind === "headers" ? validEdits( rule ) : [],
			params: params ? validParams( rule ) : [],
			parts,
			domains,
			exactPages,
			pagePatterns,
			patternFilters,
			exceptDomains: parseDomainList( rule.exceptDomains ),
			exceptInitiators: rule.exceptExtension ? ownHosts : [],
			exceptPrivate,
			// A request to a private address: only the patterns that do not fix the host apart from all addresses still
			// target it (the browser cannot add the private exception to them, buildNetworkRules()).
			privatePatterns: exceptPrivate ? pagePatterns.filter( ( pattern ) => !ALL_ADDRESSES_PATTERN.test( pattern ) ) : pagePatterns,
		} );
	} );
	return compiled;
}

// Request types (ResourceType) for the selected groups — only those the
// browser knows (available).
/** @type {Functions.DeclarativeNetRequest.Rules.resourceTypesFor} */
export function resourceTypesFor ( parts, available )
{
	const named = new Set( PART_GROUPS.flatMap( ( group ) => group.types ) );
	/** @type {string[]} */
	const types = [];
	for ( const group of PART_GROUPS ) {
		if ( !parts.includes( group.key ) ) continue;
		const groupTypes = group.key === "other" ? available.filter( ( type ) => !named.has( type ) ) : group.types.filter( ( type ) => available.includes( type ) );
		for ( const type of groupTypes ) if ( !types.includes( type ) ) types.push( type );
	}
	return types;
}

// The condition's domain list extended with others (without repetition).
/** @type {Functions.DeclarativeNetRequest.Rules.mergeDomains} */
function mergeDomains ( current, extra )
{
	return [ ...new Set( [ ...( current || [] ), ...extra ] ) ];
}

// A condition for an exact address: urlFilter anchored at both ends (case-
// sensitive). Characters with a special meaning in urlFilter (| ^ *)
// may be in the address — then a regular expression.
/** @type {Functions.DeclarativeNetRequest.Rules.exactCondition} */
function exactCondition ( url )
{
	return URL_FILTER_SPECIAL.test( url ) ? { regexFilter: `^${ escapeRegex( url ) }$`, isUrlFilterCaseSensitive: true } : { urlFilter: `|${ url }|`, isUrlFilterCaseSensitive: true };
}

// A condition for an exact address followed by a part after "#" ("url#…"): urlFilter anchored only at the start, with
// the special characters of urlFilter in the address a regular expression. Chrome compares the address of a document
// (main_frame, sub_frame) with its part after "#" — "|url|" did not block "url#x" (verified in Chrome 156); Firefox
// too — "|url|" did not upgrade the page "url#x" to HTTPS, "|url#" did (verified in Firefox 159 and Chrome 154).
/** @type {Functions.DeclarativeNetRequest.Rules.fragmentCondition} */
function fragmentCondition ( url )
{
	return URL_FILTER_SPECIAL.test( url ) ? { regexFilter: `^${ escapeRegex( url ) }#`, isUrlFilterCaseSensitive: true } : { urlFilter: `|${ url }#`, isUrlFilterCaseSensitive: true };
}

// Conditions for the address of a parameter rule (the address without the query). With presences (the rule only removes
// parameters) only an address whose query contains one of the parameters: urlFilter (filters — presenceFilters(), two per
// parameter; null when urlFilter cannot write some name) while budget.filters allows it, then regular expressions (one per
// parameter group) while budget.regex allows it, otherwise the address with any query (urlFilter). When setting a value
// the address with any query and without one. Special urlFilter characters (| ^ *) in the address = always a regular
// expression. cost: how many browser rules one condition makes (with a domain of the rule the page and files separately) —
// the budget goes down by it. paired (the redirect of an edit with a related parameter — presences "both are in the
// query"): over the budget no condition — the address with any query would remove (or set) the parameters also where only
// one of them is.
/** @type {Functions.DeclarativeNetRequest.Rules.paramsPageConditions} */
function paramsPageConditions ( url, presences, filters, budget, cost, paired )
{
	if ( URL_FILTER_SPECIAL.test( url ) ) {
		const ends = presences ?? [ ANY_QUERY ];
		budget.regex -= ends.length * cost;
		return ends.map( ( end ) => ( { regexFilter: `^${ escapeRegex( url ) }${ end }`, isUrlFilterCaseSensitive: true } ) );
	}
	if ( presences === null ) return [ { urlFilter: `|${ url }|`, isUrlFilterCaseSensitive: true }, { urlFilter: `|${ url }?`, isUrlFilterCaseSensitive: true } ];
	if ( filters !== null && budget.filters >= filters.length * cost ) {
		budget.filters -= filters.length * cost;
		return filters.map( ( end ) => ( { urlFilter: `|${ url }${ end }`, isUrlFilterCaseSensitive: true } ) );
	}
	if ( budget.regex >= presences.length * cost ) {
		budget.regex -= presences.length * cost;
		return presences.map( ( presence ) => ( { regexFilter: `^${ escapeRegex( url ) }${ presence }`, isUrlFilterCaseSensitive: true } ) );
	}
	return paired ? [] : [ { urlFilter: `|${ url }?`, isUrlFilterCaseSensitive: true } ];
}

// The urlFilter conditions of a beginning of an address (base — of a pattern, patternUrlFilters()) followed by the end
// of the address, for a parameter rule (withQuery) also by a query. A base that ends with "*" covers both as it is
// (without the "*" — urlFilter goes on with anything after its end).
/** @type {Functions.DeclarativeNetRequest.Rules.wholeAddressFilters} */
function wholeAddressFilters ( base, withQuery )
{
	if ( base.endsWith( "*" ) ) return [ base.replace( /\*+$/, "" ) ];
	return withQuery ? [ `${ base }|`, `${ base }?` ] : [ `${ base }|` ];
}

// The rule action: header edits, a redirect to the address with edited GET
// parameters (of one redirect of the rule — paramRedirects()), blocking the request, or loading it over HTTPS (http:// →
// https://, the rest of the address stays).
/** @type {Functions.DeclarativeNetRequest.Rules.ruleAction} */
function ruleAction ( rule, redirect )
{
	if ( rule.kind === "block" ) return { type: "block" };
	if ( rule.kind === "upgrade" ) return { type: "upgradeScheme" };
	if ( redirect ) return { type: "redirect", redirect: { transform: { queryTransform: redirect.transform } } };
	const requestHeaders = rule.headers.filter( ( edit ) => edit.direction === "request" ).map( toHeaderInfo );
	const responseHeaders = rule.headers.filter( ( edit ) => edit.direction === "response" ).map( toHeaderInfo );
	return {
		type: "modifyHeaders",
		...( requestHeaders.length > 0 ? { requestHeaders } : {} ),
		...( responseHeaders.length > 0 ? { responseHeaders } : {} ),
	};
}

// The condition limited to the protocol of the rule (null — it targets another scheme only). urlFilter: with a scheme it
// stays or drops out, "|http*…" and "|http" (a pattern without a scheme for http and https) get the scheme, one without
// the anchor at the beginning ("?name^" of a domain) "|scheme://*" before it; without an address condition "|scheme://".
/** @type {Functions.DeclarativeNetRequest.Rules.protocolCondition} */
function protocolCondition ( condition, protocol )
{
	if ( protocol === "any" ) return condition;
	if ( condition.urlFilter ) {
		const filter = condition.urlFilter;
		const explicit = /^\|([a-z][a-z0-9+.-]*):\/\//i.exec( filter );
		if ( explicit ) return explicit[ 1 ].toLowerCase() === protocol ? condition : null;
		if ( /^\|http(?:\*|$)/.test( filter ) ) return { ...condition, urlFilter: `|${ protocol }://${ filter.slice( "|http".length ) }` };
		return { ...condition, urlFilter: `|${ protocol }://*${ filter.replace( /^\|/, "" ) }` };
	}
	if ( condition.regexFilter ) {
		if ( condition.regexFilter.startsWith( "^https?://" ) ) {
			return { ...condition, regexFilter: condition.regexFilter.replace( "^https?://", `^${ protocol }://` ) };
		}
		const explicit = /^\^(https?):\/\//i.exec( condition.regexFilter );
		if ( explicit ) return explicit[ 1 ].toLowerCase() === protocol ? condition : null;
		const regexFilter = condition.regexFilter.startsWith( "^" )
			? `^${ protocol }://${ condition.regexFilter.slice( 1 ) }`
			: `^${ protocol }://${ condition.regexFilter }`;
		return { ...condition, regexFilter };
	}
	return { ...condition, urlFilter: `|${ protocol }://` };
}

// The same condition for the address of a WebSocket connection in Chrome: Chrome compares ws:// and wss:// addresses with
// it, Firefox the http:// and https:// address of the same connection (verified in Chrome 154 and Firefox 159 — "|http://"
// blocked ws:// only in Firefox, "|ws://" only in Chrome). An address condition beginning with the http(s) scheme gets the
// ws(s) scheme instead ("|http://" → "|ws://", "|https://" → "|wss://", "|http*…" → "|ws*…", "^https?://" → "^wss?://");
// null — the condition needs no other one (no address condition, it does not begin with a scheme) or targets another
// scheme only. So "HTTP only" covers ws:// and "HTTPS only" wss:// in both browsers.
/** @type {Functions.DeclarativeNetRequest.Rules.webSocketCondition} */
function webSocketCondition ( condition )
{
	if ( condition.urlFilter ) {
		const match = /^\|http(s?)(?=:\/\/|\*|$)/i.exec( condition.urlFilter );
		return match ? { ...condition, urlFilter: `|ws${ match[ 1 ] }${ condition.urlFilter.slice( match[ 0 ].length ) }` } : null;
	}
	if ( condition.regexFilter ) {
		const match = /^\^http(s\??)?:\/\//i.exec( condition.regexFilter );
		return match ? { ...condition, regexFilter: `^ws${ match[ 1 ] ?? "" }://${ condition.regexFilter.slice( match[ 0 ].length ) }` } : null;
	}
	return null;
}

// declarativeNetRequest rules (without ids — the core assigns them, api.networkRules)
// for the prepared rules. available: request types the browser knows.
//
// Rules created from one Settings rule do not overlap, so that
// "Append value" is not applied twice to one request:
// - files from elsewhere (initiatorDomains) skip requests to the domain,
// - an exact address on the rule's domain is skipped (the domain covers it), the same
//   as an address a pattern of the same rule matches,
// - patterns skip requests to the domain,
// - addresses and patterns skip files the domain's pages load
//   (the files-from-elsewhere rule covers them); not the page (main_frame) — the
//   files rule does not have it.
// Thus only two patterns of one rule can overlap.
//
// A parameter rule that only removes parameters targets only addresses
// whose query contains one of its parameters — otherwise a redirect that changes nothing would
// shadow parameter rules lower in the list and in Firefox header edits too. An edit with a related parameter ("and at the
// same time") has its own redirect (paramRedirects() of params.mjs) with all the conditions of the rule, each only for an
// address whose query contains both parameters (pairFilters() — four urlFilter per edit, pairSources() — two regular
// expressions).
//
// Address conditions go as urlFilter wherever it can write them — the browser finds urlFilter rules by their fixed parts
// in an index, a regular expression (regexFilter) it has to evaluate, and an extension may have only 1000 of them: the
// condition "the parameter is in the query" two urlFilter per parameter (presenceFilters() in params.mjs), a pattern with
// "*" a urlFilter with "*" (patternUrlFilters()). A regular expression only where urlFilter cannot: an address or a
// pattern with "|" or "^", a parameter name with * ! ~ ' ( ) (presenceSources()), individual addresses of parameter rules
// over PAGE_FILTER_BUDGET (regexReasons() says why for the editor).
//
// An exact address of a blocking rule and of the upgrade to HTTPS also with a part after "#" for a page and a frame
// (fragmentCondition()) — only these: block and upgradeScheme rules are "safe" (Chrome allows 30,000 dynamic ones), header
// edits and redirects share the budget of 5,000 "unsafe" dynamic rules with the other modules.
//
// Every condition gets the "Except" domains: the page (main_frame) as
// excludedRequestDomains, other requests additionally as
// excludedInitiatorDomains (files the excluded pages load) —
// so a condition that targets both the page and files is split in two.
// In declarativeNetRequest the exclusion takes precedence over the rule's domains. "Except the requests of this extension"
// adds the host of the extension (exceptInitiators of compileRules()) to excludedInitiatorDomains of the other requests —
// not to the page, the same split.
//
// A condition with an http(s) address that targets WebSocket connections has one more rule with the ws(s) address,
// for WebSocket connections only — Chrome compares their ws(s):// address, Firefox the http(s):// one (webSocketCondition()).
/** @type {Functions.DeclarativeNetRequest.Rules.buildNetworkRules} */
export function buildNetworkRules ( compiled, available )
{
	/** @type {Types.NetworkRule[]} */
	const out = [];
	/** @type {Types.DeclarativeNetRequest.PageBudget} */
	const budget = { filters: PAGE_FILTER_BUDGET, regex: PAGE_REGEX_BUDGET };
	// A parameter rule once per redirect (paramRedirects()), the others once.
	const entries = compiled.flatMap( ( rule ) => ( rule.kind === "params" ? paramRedirects( rule.params ) : [ null ] ).map( ( redirect ) => ( { rule, redirect } ) ) );
	for ( const { rule, redirect } of entries ) {
		const types = resourceTypesFor( rule.parts, available );
		if ( types.length === 0 ) continue;
		const params = rule.kind === "params";
		const action = ruleAction( rule, redirect );
		const presences = redirect ? redirect.presences : null;
		// The same condition as urlFilter (null: no condition, or urlFilter cannot write some name).
		const filters = redirect ? redirect.filters : null;
		const paired = !!redirect && redirect.paired;
		const except = rule.exceptDomains;
		// Initiators the rule skips besides the "Except" domains — the host of this extension (exceptExtension).
		const exceptInitiators = mergeDomains( except, rule.exceptInitiators );
		/** @type {Functions.DeclarativeNetRequest.Rules.buildNetworkRules.add} */
		const push = ( condition, resourceTypes, anyHost = false ) =>
		{
			if ( resourceTypes.length === 0 ) return;
			const filteredCondition = protocolCondition( condition, rule.protocol );
			if ( !filteredCondition ) return;
			// A condition that does not fix the request host, with "Except private and local IP addresses": a rule per part of
			// NOT_PRIVATE_HOST_PARTS (privateExcluded()).
			for ( const scoped of rule.exceptPrivate && anyHost ? privateExcluded( filteredCondition ) : [ filteredCondition ] ) {
				out.push( {
					priority: rule.priority,
					action,
					condition: { ...scoped, resourceTypes: /** @type {chrome.declarativeNetRequest.RuleCondition['resourceTypes']} */ ( resourceTypes ) },
				} );
				// WebSocket connections in Chrome by their ws(s):// address (webSocketCondition()).
				const webSocket = resourceTypes.includes( "websocket" ) ? webSocketCondition( scoped ) : null;
				if ( webSocket ) out.push( { priority: rule.priority, action, condition: { ...webSocket, resourceTypes: [ "websocket" ] } } );
			}
		};
		/** @type {Functions.DeclarativeNetRequest.Rules.buildNetworkRules.add} */
		const add = ( condition, resourceTypes, anyHost = false ) =>
		{
			if ( exceptInitiators.length === 0 ) {
				push( condition, resourceTypes, anyHost );
				return;
			}
			// Only the "Except" domains for the page — the extension's own host only as an initiator (not main_frame).
			const requestPart = except.length > 0 ? { excludedRequestDomains: mergeDomains( condition.excludedRequestDomains, except ) } : {};
			push( { ...condition, ...requestPart }, resourceTypes.filter( ( type ) => type === "main_frame" ), anyHost );
			push(
				{ ...condition, ...requestPart, excludedInitiatorDomains: mergeDomains( condition.excludedInitiatorDomains, exceptInitiators ) },
				resourceTypes.filter( ( type ) => type !== "main_frame" ),
				anyHost
			);
		};
		const { domains } = rule;
		const pageTypes = types.filter( ( type ) => type === "main_frame" );
		const partTypes = types.filter( ( type ) => type !== "main_frame" );
		// Documents a blocking rule and the upgrade to HTTPS catch also with a part after "#".
		const documentTypes = rule.kind === "block" || rule.kind === "upgrade" ? types.filter( ( type ) => type === "main_frame" || type === "sub_frame" ) : [];
		if ( domains.length > 0 ) {
			/** @type {chrome.declarativeNetRequest.RuleCondition[]} */
			const queries =
				presences === null
					? [ {} ]
					: filters !== null
						? filters.map( ( urlFilter ) => ( { urlFilter, isUrlFilterCaseSensitive: true } ) )
						: presences.map( ( presence ) => ( { regexFilter: `^[^?]*${ presence }`, isUrlFilterCaseSensitive: true } ) );
			for ( const query of queries ) add( { ...query, requestDomains: domains }, types );
			// Files from elsewhere — any host (the private exception by a regular expression).
			for ( const query of queries ) add( { ...query, initiatorDomains: domains, excludedRequestDomains: domains }, partTypes, true );
		}
		const patterns = rule.pagePatterns.map( ( pattern ) => new RegExp( pattern, "i" ) );
		// How many browser rules are created from one address condition (with a domain
		// the page and files separately, see below).
		const perCondition = domains.length === 0 ? 1 : Number( pageTypes.length > 0 ) + Number( partTypes.length > 0 );
		/** @type {chrome.declarativeNetRequest.RuleCondition[]} */
		const pageConditions = [];
		/** @type {chrome.declarativeNetRequest.RuleCondition[]} */
		const fragmentConditions = [];
		// Conditions of all addresses ("*") — the private exception by a regular expression (privateExcluded()); the other
		// patterns fix the host or cannot get it (Chrome would not compile the expression with the rest of the address).
		/** @type {Set<chrome.declarativeNetRequest.RuleCondition>} */
		const anyHost = new Set();
		for ( const page of rule.exactPages ) {
			if ( isHostInDomains( new URL( page ).hostname, domains ) || patterns.some( ( pattern ) => pattern.test( page ) ) ) continue;
			if ( !params ) {
				pageConditions.push( exactCondition( page ) );
				if ( documentTypes.length > 0 ) fragmentConditions.push( fragmentCondition( page ) );
				continue;
			}
			pageConditions.push( ...paramsPageConditions( page, presences, filters, budget, perCondition, paired ) );
		}
		rule.pagePatterns.forEach( ( pattern, index ) =>
		{
			const extra = { isUrlFilterCaseSensitive: false, ...( domains.length > 0 ? { excludedRequestDomains: domains } : {} ) };
			// urlFilter: the beginnings of the pattern followed by the end of the address (for parameters also by a query),
			// for removal by the "the parameter is in the query" condition instead.
			const bases = rule.patternFilters[ index ].filters;
			/** @type {string[] | null} */
			let urlFilters = null;
			if ( bases !== null && presences === null ) urlFilters = bases.flatMap( ( base ) => wholeAddressFilters( base, params ) );
			else if ( bases !== null && filters !== null ) urlFilters = bases.flatMap( ( base ) => filters.map( ( end ) => base + end ) );
			if ( urlFilters !== null ) {
				for ( const urlFilter of urlFilters ) {
					const condition = { urlFilter, ...extra };
					pageConditions.push( condition );
					if ( ALL_ADDRESSES_PATTERN.test( pattern ) ) anyHost.add( condition );
				}
				return;
			}
			// A parameter rule pattern ends with ANY_QUERY — for removal instead of it
			// the "the parameter is in the query" condition (an expression per parameter group).
			const sources = presences !== null ? presences.map( ( presence ) => pattern.slice( 0, -ANY_QUERY.length ) + presence ) : [ pattern ];
			for ( const regexFilter of sources ) pageConditions.push( { regexFilter, ...extra } );
		} );
		for ( const condition of pageConditions ) {
			if ( domains.length === 0 ) {
				add( condition, types, anyHost.has( condition ) );
				continue;
			}
			add( condition, pageTypes, anyHost.has( condition ) );
			add( { ...condition, excludedInitiatorDomains: domains }, partTypes, anyHost.has( condition ) );
		}
		for ( const condition of fragmentConditions ) {
			if ( domains.length === 0 ) {
				add( condition, documentTypes );
				continue;
			}
			add( condition, documentTypes.filter( ( type ) => type === "main_frame" ) );
			add( { ...condition, excludedInitiatorDomains: domains }, documentTypes.filter( ( type ) => type !== "main_frame" ) );
		}
	}
	return out;
}

// How many declarativeNetRequest rules buildNetworkRules() made of each prepared rule — by the priority, which is
// different for every rule of the list (rule id → count; a rule that made none is missing).
/** @type {Functions.DeclarativeNetRequest.Rules.countNetworkRules} */
export function countNetworkRules ( compiled, networkRules )
{
	/** @type {Map<number | undefined, number>} */
	const byPriority = new Map();
	for ( const rule of networkRules ) byPriority.set( rule.priority, ( byPriority.get( rule.priority ) || 0 ) + 1 );
	/** @type {Map<string, number>} */
	const counts = new Map();
	for ( const rule of compiled ) {
		const count = byPriority.get( rule.priority ) || 0;
		if ( count > 0 ) counts.set( rule.id, count );
	}
	return counts;
}

// Why buildNetworkRules() writes conditions of a rule as a regular expression (regexFilter) instead of urlFilter — for the
// warning of the editor, which counts them in its conversion without the bookmarks: exact addresses with "|", "^" or "*"
// (without those on a domain of the rule or under its pattern — buildNetworkRules() skips them), lines of patterns with
// "|" or "^", names of parameters urlFilter cannot write (only a redirect that looks for them in the address — of edits
// without a related parameter that only remove, of an edit with one always), and folder — the addresses of the bookmarks
// of such a rule get urlFilter only while PAGE_FILTER_BUDGET allows it (only when the names do not need a regular
// expression anyway). It does not say whether the rule makes anything at all. The comments of the fields do not count.
/** @type {Functions.DeclarativeNetRequest.Rules.regexReasons} */
export function regexReasons ( stored )
{
	const rule = withoutComments( stored );
	const params = rule.kind === "params";
	const conditioned = params ? paramRedirects( validParams( rule ) ).filter( ( redirect ) => redirect.presences !== null ) : [];
	const paramNames = [ ...new Set( conditioned.flatMap( ( redirect ) => regexParamNames( redirect.condition ) ) ) ];
	const pages = parsePageList( rule.pages, params );
	const domains = parseDomainList( rule.domains );
	const patterns = pages.patterns.map( ( pattern ) => new RegExp( pattern, "i" ) );
	return {
		addresses: pages.exact.filter(
			( page ) => URL_FILTER_SPECIAL.test( page ) && !isHostInDomains( new URL( page ).hostname, domains ) && !patterns.some( ( pattern ) => pattern.test( page ) )
		),
		patterns: pages.patternFilters.filter( ( item ) => item.filters === null ).map( ( item ) => item.line ),
		paramNames,
		folder: conditioned.length > 0 && !!rule.folderId && paramNames.length === 0,
		// "Except private and local IP addresses" for all addresses and the files the pages of the domains load from elsewhere.
		privateAddresses: exceptsPrivate( rule ) && ( pages.patterns.some( ( pattern ) => ALL_ADDRESSES_PATTERN.test( pattern ) ) || domains.length > 0 || ( !!rule.folderId && rule.wholeDomain ) ),
	};
}

// Lines of the patterns "Except private and local IP addresses" does not apply to — they do not fix the host and may target
// an IP address ("*/admin/*", "10.0.*": only digits, dots, hexadecimal letters, ":" and "[ ]" before the first "/"; not
// "*.example.com/*"), for the warning of the editor. The browser could only except them by a regular expression with the
// rest of the address, which Chrome does not compile (privatePatterns of compileRules()). Without the comments of the addresses.
/** @type {Functions.DeclarativeNetRequest.Rules.privateGaps} */
export function privateGaps ( rule )
{
	if ( !exceptsPrivate( rule ) ) return [];
	const pages = parsePageList( stripComments( rule.pages, true ), false );
	return pages.patternFilters
		.filter( ( _, index ) =>
		{
			const pattern = pages.patterns[ index ];
			if ( ALL_ADDRESSES_PATTERN.test( pattern ) || patternHost( pattern ) !== null ) return false;
			const host = pattern.replace( /^\^[^:]+:\/\//, "" ).replace( /\$$/, "" ).split( "/" )[ 0 ].replace( /\.\*/g, "" ).replace( /\\/g, "" );
			return /^[0-9a-f.:[\]]*$/i.test( host );
		} )
		.map( ( item ) => item.line );
}

// Rules that target the page (document) address — for the output in the element.
// via: through the domain (edits also files the page loads from elsewhere), or
// through the address (only requests to that address; for parameters the address without the query).
// A rule whose "Except" excludes the page does not target it.
/** @type {Functions.DeclarativeNetRequest.Rules.matchUrl} */
export function matchUrl ( compiled, url )
{
	const key = pageKey( url );
	if ( key === null ) return [];
	const withoutQuery = /** @type {string} */ ( pageKey( url, true ) );
	const host = new URL( key ).hostname;
	const protocol = new URL( key ).protocol.slice( 0, -1 );
	/** @type {Types.DeclarativeNetRequest.MatchedRule[]} */
	const matched = [];
	for ( const rule of compiled ) {
		if ( rule.protocol !== "any" && rule.protocol !== protocol ) continue;
		if ( isHostInDomains( host, rule.exceptDomains ) ) continue;
		const byDomain = isHostInDomains( host, rule.domains );
		// A private address: the rule has no such domains and addresses, of the patterns only privatePatterns.
		const patterns = rule.exceptPrivate && isPrivateHost( host ) ? rule.privatePatterns : rule.pagePatterns;
		const byPage = rule.exactPages.has( rule.kind === "params" ? withoutQuery : key ) || patterns.some( ( pattern ) => new RegExp( pattern, "i" ).test( key ) );
		if ( !byDomain && !byPage ) continue;
		matched.push( { id: rule.id, title: rule.title, color: rule.color, closedInOverview: rule.closedInOverview, kind: rule.kind, headers: rule.headers, params: rule.params, parts: rule.parts, via: byDomain ? "domain" : "page" } );
	}
	return matched;
}

// The host of an http(s) or ws(s) address, otherwise null (Chrome gives the initiator "null" for an opaque origin).
/** @type {Functions.DeclarativeNetRequest.Rules.requestHost} */
function requestHost ( url )
{
	if ( typeof url !== "string" || !url ) return null;
	try {
		const { protocol, hostname } = new URL( url );
		return /^(?:https?|wss?):$/.test( protocol ) && hostname ? hostname : null;
	} catch {
		return null;
	}
}

// The host of an initiator of any scheme — also of the extension's own pages and background part
// (chrome-extension://<id>, moz-extension://<uuid>/…), otherwise null.
/** @type {Functions.DeclarativeNetRequest.Rules.initiatorHost} */
function initiatorHost ( url )
{
	if ( typeof url !== "string" || !url ) return null;
	try {
		return new URL( url ).hostname.toLowerCase() || null;
	} catch {
		return null;
	}
}

// The rule of the kind that in all likelihood was applied to a request webRequest reported — when the browser does not say
// which rule was applied (see background-script.mjs): the first one in the list (the highest priority — it wins in the
// browser) of the rules of the kind that target the request, by the same conditions as in buildNetworkRules():
// the request type (available: the types the browser knows), the protocol, requests to the domains,
// files their pages load from elsewhere (by the initiator — Chrome webRequest "initiator", Firefox
// "originUrl", which its declarativeNetRequest uses), the addresses and patterns; "Except" domains of the
// request and of the initiator (not for the page) exclude the rule, the same as the extension's own host as the initiator
// with "Except the requests of this extension". null = no rule of the kind targets it.
/** @type {Functions.DeclarativeNetRequest.Rules.matchRequestOfKind} */
function matchRequestOfKind ( compiled, request, available, kind )
{
	const host = requestHost( request.url );
	if ( host === null ) return null;
	// A WebSocket connection as its http(s) address — "HTTP only" covers ws://, "HTTPS only" wss:// (webSocketCondition()).
	const url = request.url.replace( /^ws(s?):/i, "http$1:" );
	const protocol = new URL( url ).protocol.slice( 0, -1 );
	const key = pageKey( url );
	const initiator = request.type === "main_frame" ? null : requestHost( request.initiator );
	const anyInitiator = request.type === "main_frame" ? null : initiatorHost( request.initiator );
	for ( const rule of compiled ) {
		if ( rule.kind !== kind ) continue;
		if ( rule.protocol !== "any" && rule.protocol !== protocol ) continue;
		if ( !resourceTypesFor( rule.parts, available ).includes( request.type ) ) continue;
		if ( isHostInDomains( host, rule.exceptDomains ) || ( initiator !== null && isHostInDomains( initiator, rule.exceptDomains ) ) ) continue;
		if ( anyInitiator !== null && rule.exceptInitiators.includes( anyInitiator ) ) continue;
		// A request to a private address: not by the initiator nor all addresses (the regular expression of the private
		// exception), the rule has no such domains and addresses — only privatePatterns.
		const privateHost = rule.exceptPrivate && isPrivateHost( host );
		const byDomain = isHostInDomains( host, rule.domains ) || ( !privateHost && initiator !== null && isHostInDomains( initiator, rule.domains ) );
		const patterns = privateHost ? rule.privatePatterns : rule.pagePatterns;
		const byPage = key !== null && ( rule.exactPages.has( key ) || patterns.some( ( pattern ) => new RegExp( pattern, "i" ).test( key ) ) );
		if ( byDomain || byPage ) return rule;
	}
	return null;
}

// The blocking rule that in all likelihood blocked a request an extension blocked (the error of
// webRequest.onErrorOccurred) — matchRequestOfKind().
/** @type {Functions.DeclarativeNetRequest.Rules.matchBlockedRequest} */
export function matchBlockedRequest ( compiled, request, available )
{
	return matchRequestOfKind( compiled, request, available, "block" );
}

// The rule redirecting to HTTPS that in all likelihood redirected an http:// request to the same address with https://
// (webRequest.onBeforeRedirect, isSchemeUpgrade() of background-script.mjs) — matchRequestOfKind(); a rule higher in the list
// that would block the request or redirect it elsewhere does not let it get to the redirect to https at all.
/** @type {Functions.DeclarativeNetRequest.Rules.matchUpgradedRequest} */
export function matchUpgradedRequest ( compiled, request, available )
{
	return matchRequestOfKind( compiled, request, available, "upgrade" );
}

// Addresses of all bookmarks in the bookmark tree nodes (also in subfolders) —
// from chrome.bookmarks.getSubTree(folder).
/** @type {Functions.DeclarativeNetRequest.Rules.collectBookmarkUrls} */
export function collectBookmarkUrls ( nodes )
{
	/** @type {string[]} */
	const urls = [];
	/** @type {Functions.DeclarativeNetRequest.Rules.collectBookmarkUrls.walk} */
	const walk = ( node ) =>
	{
		if ( node.url ) urls.push( node.url );
		for ( const child of node.children || [] ) walk( child );
	};
	nodes.forEach( walk );
	return urls;
}

// Bookmark folders for the selection in the editor: every folder of the tree (without the invisible
// root) with its path, in tree order — a folder, right after it its subfolders.
// Chrome with bookmarks in the account has the root folders twice with the same name —
// syncing tells them apart (the same as in tabGroups).
/** @type {Functions.DeclarativeNetRequest.Rules.listBookmarkFolders} */
export function listBookmarkFolders ( tree )
{
	/** @type {Types.DeclarativeNetRequest.BookmarkFolder[]} */
	const folders = [];
	/** @type {Functions.DeclarativeNetRequest.Rules.listBookmarkFolders.add} */
	const add = ( node, title, path ) =>
	{
		folders.push( { id: node.id, title, label: [ ...path, title ].join( " › " ) } );
		for ( const child of node.children || [] ) {
			if ( !child.url && child.children ) add( child, child.title || t( "declarativeNetRequest_folder_untitled" ), [ ...path, title ] );
		}
	};
	const topLevel = tree.flatMap( ( root ) => ( root.children || [] ).filter( ( node ) => !node.url && node.children ) );
	/** @type {Map<string, number>} */
	const counts = new Map();
	for ( const node of topLevel ) counts.set( node.title, ( counts.get( node.title ) || 0 ) + 1 );
	for ( const node of topLevel ) {
		let title = node.title || t( "declarativeNetRequest_folder_untitled" );
		if (/** @type {number} */ ( counts.get( node.title ) ) > 1 && typeof node.syncing === "boolean" ) {
			title = t( node.syncing ? "declarativeNetRequest_folder_in_account" : "declarativeNetRequest_folder_device_only", title );
		}
		add( node, title, [] );
	}
	return folders;
}
