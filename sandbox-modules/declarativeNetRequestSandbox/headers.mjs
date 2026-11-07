//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/headers.mjs
// Headers in rules: common headers for suggestions (the editor's <datalist>)
// and checking how one edit is written — what the browser would reject. Without DOM and without
// chrome.*. The check rules match what Chrome 154 or
// Firefox 157 rejects (verified by a probe): one rejected rule would break the whole
// batch of the module's rules (api.networkRules), so an invalid edit is not sent to the
// browser at all.

// Edit directions: headers sent to the server (request) and received from it
// (response).
/** @type {readonly Types.DeclarativeNetRequest.Direction[]} */
export const DIRECTIONS = ["request", "response"];

// Operations: remove the header, set a value (overwrites), append a value
// (to the existing one, for a response also another header with the same name).
/** @type {readonly Types.DeclarativeNetRequest.Operation[]} */
export const OPERATIONS = ["remove", "set", "append"];

// Request headers to which a value can be appended (the "append" operation) — Chrome
// rejects others ("Only standard HTTP request headers that can specify multiple
// values for a single entry are supported"), Firefox accepts all.
// There is no restriction for response headers.
export const REQUEST_APPEND_HEADERS = [
	"accept",
	"accept-encoding",
	"accept-language",
	"access-control-request-headers",
	"cache-control",
	"connection",
	"content-language",
	"cookie",
	"forwarded",
	"if-match",
	"if-none-match",
	"keep-alive",
	"range",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"user-agent",
	"via",
	"want-digest",
	"x-forwarded-for",
];

// Common headers for suggestions — any can be entered.
export const COMMON_REQUEST_HEADERS = [
	"Accept",
	"Accept-Encoding",
	"Accept-Language",
	"Authorization",
	"Cache-Control",
	"Cookie",
	"DNT",
	"If-Modified-Since",
	"If-None-Match",
	"Origin",
	"Pragma",
	"Priority",
	"Range",
	"Referer",
	"Save-Data",
	"Sec-CH-UA",
	"Sec-CH-UA-Mobile",
	"Sec-CH-UA-Platform",
	"Sec-Fetch-Dest",
	"Sec-Fetch-Mode",
	"Sec-Fetch-Site",
	"Sec-Fetch-User",
	"Sec-GPC",
	"Upgrade-Insecure-Requests",
	"User-Agent",
	"X-Forwarded-For",
	"X-Requested-With",
];

export const COMMON_RESPONSE_HEADERS = [
	"Access-Control-Allow-Credentials",
	"Access-Control-Allow-Headers",
	"Access-Control-Allow-Methods",
	"Access-Control-Allow-Origin",
	"Access-Control-Expose-Headers",
	"Alt-Svc",
	"Cache-Control",
	"Clear-Site-Data",
	"Content-Disposition",
	"Content-Language",
	"Content-Security-Policy",
	"Content-Security-Policy-Report-Only",
	"Content-Type",
	"Cross-Origin-Embedder-Policy",
	"Cross-Origin-Opener-Policy",
	"Cross-Origin-Resource-Policy",
	"ETag",
	"Expires",
	"Last-Modified",
	"Link",
	"Location",
	"NEL",
	"Origin-Agent-Cluster",
	"Permissions-Policy",
	"Pragma",
	"Referrer-Policy",
	"Refresh",
	"Report-To",
	"Reporting-Endpoints",
	"Server",
	"Server-Timing",
	"Set-Cookie",
	"Strict-Transport-Security",
	"Timing-Allow-Origin",
	"Vary",
	"X-Content-Type-Options",
	"X-Frame-Options",
	"X-Powered-By",
	"X-XSS-Protection",
];

// A header name = a token per RFC 9110 (Chrome rejects others, Firefox would
// accept even a space or a colon).
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// A line break or NUL in the value is rejected by Chrome (not by Firefox).
const BAD_VALUE_CHARS = /[\r\n\0]/;

/** @type {Functions.DeclarativeNetRequest.Headers.emptyHeader} */
export function emptyHeader() {
	return { direction: "request", header: "", operation: "remove", value: "" };
}

// An edit row the user wrote nothing into — it does not count and is skipped
// when saving.
/** @type {Functions.DeclarativeNetRequest.Headers.isBlankHeader} */
export function isBlankHeader(edit) {
	return !edit.header.trim() && !edit.value.trim();
}

// What is wrong with the edit (null = nothing): the name is missing or invalid, the value
// is missing (the "set" and "append" operations — Firefox rejects an empty one), the value
// contains a line break, or the value cannot be appended to a request header.
/** @type {Functions.DeclarativeNetRequest.Headers.headerProblem} */
export function headerProblem(edit) {
	const name = edit.header.trim();
	if (!TOKEN.test(name)) return "name";
	if (edit.operation === "remove") return null;
	if (!edit.value.trim()) return "value";
	if (BAD_VALUE_CHARS.test(edit.value)) return "valueChars";
	if (edit.operation === "append" && edit.direction === "request" && !REQUEST_APPEND_HEADERS.includes(name.toLowerCase())) return "append";
	return null;
}

// The edit in the form for declarativeNetRequest (ModifyHeaderInfo): the name in
// lowercase, the value without surrounding whitespace, for removal without a value.
/** @type {Functions.DeclarativeNetRequest.Headers.toHeaderInfo} */
export function toHeaderInfo(edit) {
	const header = edit.header.trim().toLowerCase();
	return edit.operation === "remove" ? { header, operation: edit.operation } : { header, operation: edit.operation, value: edit.value.trim() };
}
