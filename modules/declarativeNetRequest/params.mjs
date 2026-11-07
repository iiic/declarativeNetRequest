//@ts-check
"use strict";

// modules/declarativeNetRequest/params.mjs
// GET parameters in rules (parameters after "?" in the request address): common
// parameters for suggestions (the editor's <datalist>), checking how one edit is written
// and converting to declarativeNetRequest — the "redirect" action with queryTransform
// (the browser redirects the request to the address with the edited parameters). Without DOM
// and without chrome.*.
//
// Verified by a probe (Chrome 154, Firefox 157), both behave the same:
// - the parameter name is case-sensitive, every occurrence is removed
//   (also "?utm_source" without "="); an empty query after removal = an address without "?",
//   the part after "#" stays, a POST stays a POST including the body.
// - the browser encodes the name and the value in the address like a form (space = "+",
//   "ž" = "%C5%BE", "&" = "%26") and compares with the address in that form — "a b"
//   finds "a+b", not "a%20b". A difference: the characters ! ~ ' ( ) are left by Chrome, Firefox
//   encodes them (%21, %7E, …).
// - setting overwrites the first occurrence of the parameter, otherwise adds it at the end;
//   an empty value = "x=".
// - only one redirect is applied to one request (the rule with the highest
//   priority) — even if it changes nothing: then the address does not change and parameter rules
//   with a lower priority are not applied. Firefox additionally does not apply header edits
//   to a request a redirect targets (Chrome does). Rules
//   that only remove parameters therefore target only addresses in which
//   one of their parameters is (presenceFilters() by urlFilter, presenceSources() by a regular expression).
// - a WebSocket connection cannot be redirected: Chrome does not apply the rule, Firefox
//   drops the connection (PARAM_PART_KEYS in rules.mjs).
// - a redirected request goes through the rules again — a rule that removes parameters and a rule
//   with the same priority that removes others both apply, one after the other.
//
// An edit with a related parameter ("and at the same time", andParam): its operation (and value) applies to both names,
// and only to an address whose query contains both — its own redirect (paramRedirects()), the condition by urlFilter
// (pairFilters()), or by regular expressions (pairSources()). The redirects of one rule share its priority, so the browser
// takes them in any order; a redirect that sets a value changes nothing once the value is there and then stops the others
// (paramsShadowed() — the editor warns about it).

// Operations: remove the parameter, set a value (overwrites, or adds).
/** @type {readonly Types.DeclarativeNetRequest.ParamOperation[]} */
export const PARAM_OPERATIONS = [ "remove", "set" ];

// Common parameters for suggestions — mostly tracking ones (campaign measurement,
// click-throughs from ads and social networks); any can be entered.
export const COMMON_PARAMS = [
	"__hsfp",
	"__hssc",
	"__hstc",
	"__s",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"utm_id",
	"fbclid",
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"msclkid",
	"yclid",
	"twclid",
	"ttclid",
	"li_fat_id",
	"igshid",
	"mc_cid",
	"mc_eid",
	"_ga",
	"_gl",
	"_hsenc",
	"_openstat",
	"hsCtaTracking",
	"_hsmi",
	"mkt_tok",
	"ml_subscriber",
	"ml_subscriber_hash",
	"oly_anon_id",
	"oly_enc_id",
	"rb_clickid",
	"vero_conv",
	"vero_id",
	"wickedid",
	"srsltid",
	"spm",
	"si",
	"ref",
	"ref_src",
];

// paired: an edit with a related parameter ("and at the same time") — the second name is not filled in yet.
/** @type {Functions.DeclarativeNetRequest.Params.emptyParam} */
export function emptyParam ( paired = false )
{
	return { param: "", operation: "remove", value: "", ...( paired ? { andParam: "" } : {} ) };
}

// Does the edit have a related parameter ("and at the same time")? Also one whose second name is empty.
/** @type {Functions.DeclarativeNetRequest.Params.isPairedParam} */
export function isPairedParam ( edit )
{
	return typeof edit.andParam === "string";
}

// The names of the edit without surrounding whitespace — with a related parameter both.
/** @type {Functions.DeclarativeNetRequest.Params.paramKeys} */
export function paramKeys ( edit )
{
	return isPairedParam( edit ) ? [ edit.param.trim(), String( edit.andParam ).trim() ] : [ edit.param.trim() ];
}

// An edit row the user wrote nothing into — it does not count and is skipped
// when saving.
/** @type {Functions.DeclarativeNetRequest.Params.isBlankParam} */
export function isBlankParam ( edit )
{
	return !edit.param.trim() && !( edit.andParam ?? "" ).trim() && !edit.value.trim();
}

// What is wrong with the edit (null = nothing): the name is missing, the related parameter is missing, or it has the
// same name (the condition "both are in the address" would be only one). Browsers have no other
// restriction — they encode the name and the value themselves, they accept an empty value.
/** @type {Functions.DeclarativeNetRequest.Params.paramProblem} */
export function paramProblem ( edit )
{
	if ( !edit.param.trim() ) return "name";
	if ( !isPairedParam( edit ) ) return null;
	const [ key, andKey ] = paramKeys( edit );
	if ( !andKey ) return "andName";
	return andKey === key ? "sameName" : null;
}

// The edits in the form for declarativeNetRequest (QueryTransform): the name and the value
// without surrounding whitespace, removed names without repetition; an edit with a related parameter both names
// (setting both to the same value).
/** @type {Functions.DeclarativeNetRequest.Params.toQueryTransform} */
export function toQueryTransform ( edits )
{
	/** @type {string[]} */
	const removeParams = [];
	/** @type {chrome.declarativeNetRequest.QueryKeyValue[]} */
	const addOrReplaceParams = [];
	for ( const edit of edits ) {
		for ( const key of paramKeys( edit ) ) {
			if ( edit.operation === "remove" ) {
				if ( !removeParams.includes( key ) ) removeParams.push( key );
			} else {
				addOrReplaceParams.push( { key, value: edit.value.trim() } );
			}
		}
	}
	return {
		...( removeParams.length > 0 ? { removeParams } : {} ),
		...( addOrReplaceParams.length > 0 ? { addOrReplaceParams } : {} ),
	};
}

// Text as a regular expression that matches only it (the browser's RE2
// and RegExp in JS) — rules.mjs shares it too.
/** @type {Functions.DeclarativeNetRequest.Params.escapeRegex} */
export function escapeRegex ( text )
{
	return text.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" );
}

// Characters Chrome leaves in a parameter name and Firefox encodes.
const BROWSER_DEPENDENT = "!~'()";

// Characters of a parameter name urlFilter cannot write: "*" stands for anything there, and ! ~ ' ( ) have two forms in the
// address (BROWSER_DEPENDENT) — urlFilter has no alternative.
const NOT_IN_URL_FILTER = `*${ BROWSER_DEPENDENT }`;

// A character of a parameter name as %XX of UTF-8 (the way the browser encodes it in the address).
/** @type {Functions.DeclarativeNetRequest.Params.percentEncoded} */
function percentEncoded ( char )
{
	return Array.from( new TextEncoder().encode( char ), ( byte ) => `%${ byte.toString( 16 ).toUpperCase().padStart( 2, "0" ) }` ).join( "" );
}

// A parameter name as a regular expression for its form in the address — encoded
// as the browser compares it (space "+", other characters except letters,
// digits and - _ . * as %XX of UTF-8); for ! ~ ' ( ) both forms.
/** @type {Functions.DeclarativeNetRequest.Params.keyPattern} */
export function keyPattern ( key )
{
	let out = "";
	for ( const char of key ) {
		if ( /^[A-Za-z0-9_.*-]$/.test( char ) ) {
			out += escapeRegex( char );
			continue;
		}
		if ( char === " " ) {
			out += "\\+";
			continue;
		}
		const encoded = percentEncoded( char );
		out += BROWSER_DEPENDENT.includes( char ) ? `(?:${ escapeRegex( char ) }|${ encoded })` : encoded;
	}
	return out;
}

// A parameter name for urlFilter in the same form as keyPattern() (space "+", other characters except letters, digits and
// - _ . as %XX of UTF-8) — written as it is; null when urlFilter cannot write it (* ! ~ ' ( ), NOT_IN_URL_FILTER).
/** @type {Functions.DeclarativeNetRequest.Params.keyFilter} */
export function keyFilter ( key )
{
	let out = "";
	for ( const char of key ) {
		if ( NOT_IN_URL_FILTER.includes( char ) ) return null;
		if ( /^[A-Za-z0-9_.-]$/.test( char ) ) out += char;
		else out += char === " " ? "+" : percentEncoded( char );
	}
	return out;
}

// How many characters of parameter names (as a regular expression) one condition
// "the parameter is in the query" may have — Chrome rejects an expression over 2 KB of memory and with it the whole
// batch of the module's rules; 12 parameters from the PrivacyTests.org list
// (~95 characters) passed, 23 (~200) did not. The memory grows with the number of distinct names,
// the length of the address before them hardly matters (verified by a probe in Chrome 154).
export const PRESENCE_CHUNK_LENGTH = 80;

// Ends of the address regular expressions "the query contains one of the parameters the
// rule removes" (after it "=", "&" or the end of the address), the parameters
// split into groups of PRESENCE_CHUNK_LENGTH characters — each group =
// its own condition with the same action (an address with parameters from several groups matches
// several rules, but the browser applies one and removes all the parameters).
// Only when the rule only removes parameters; with setting a value null
// (the rule targets every address: a missing parameter is added). The edits without a related parameter
// (paramRedirects() — an edit with one has the condition of pairSources()).
/** @type {Functions.DeclarativeNetRequest.Params.presenceSources} */
export function presenceSources ( edits )
{
	if ( edits.length === 0 || edits.some( ( edit ) => edit.operation !== "remove" ) ) return null;
	const keys = [ ...new Set( edits.map( ( edit ) => keyPattern( edit.param.trim() ) ) ) ];
	/** @type {string[][]} */
	const chunks = [];
	let length = Infinity;
	for ( const key of keys ) {
		if ( length + key.length + 1 > PRESENCE_CHUNK_LENGTH ) {
			chunks.push( [] );
			length = 0;
		}
		chunks[ chunks.length - 1 ].push( key );
		length += key.length + 1;
	}
	return chunks.map( ( chunk ) => `\\?(?:.*&)?(?:${ chunk.join( "|" ) })(?:[=&]|$)` );
}

// The same condition as presenceSources() without a regular expression — the ends of urlFilter conditions, two per
// parameter: "?name^" (the first parameter of the query) and "?*&name^" (a later one). The separator "^" of urlFilter
// stands for "=", "&" and the end of the address, but also for any other character except a letter, a digit and _ - . % —
// a name followed by such a character ("?locale/x") is not in a query in practice; at worst the browser redirects to the same
// address. The browser looks for urlFilter by its fixed parts in an index, a regular expression it has to evaluate (and an
// extension may have only 1000 of them). null like presenceSources() (the rule also sets a value), and also when urlFilter
// cannot write some of the names (keyFilter(), regexParamNames()) — then the regular expressions of presenceSources().
/** @type {Functions.DeclarativeNetRequest.Params.presenceFilters} */
export function presenceFilters ( edits )
{
	if ( presenceSources( edits ) === null ) return null;
	/** @type {string[]} */
	const keys = [];
	for ( const edit of edits ) {
		const key = keyFilter( edit.param.trim() );
		if ( key === null ) return null;
		if ( !keys.includes( key ) ) keys.push( key );
	}
	return keys.flatMap( ( key ) => [ `?${ key }^`, `?*&${ key }^` ] );
}

// Names of the parameters urlFilter cannot write (keyFilter()) — why the condition of presenceFilters() (pairFilters()) is
// not possible.
/** @type {Functions.DeclarativeNetRequest.Params.regexParamNames} */
export function regexParamNames ( edits )
{
	return [ ...new Set( edits.flatMap( paramKeys ).filter( ( key ) => keyFilter( key ) === null ) ) ];
}

// The ends of the address regular expressions "the query contains both parameters of the edit" (with a related
// parameter), one per order of the names: one name at the beginning of the query or after "&", right after it "=" or "&"
// (then anything), later "&" and the other name (after it "=", "&" or the end of the address). Two expressions with each
// name once instead of one with both orders: Chrome compiles an expression into at most 2 KB (RE2) — one with both
// orders did not fit already with two names of 20 characters, one per order still fits with two of 40 (not 50) for a
// domain, and with utm_source and utm_medium after a 63-character address (verified in Chrome 156 by isRegexSupported()).
// What still does not fit (long names after a long address, a pattern with many "*") the background part leaves out
// (supportedNetworkRules() of background-script.mjs).
/** @type {Functions.DeclarativeNetRequest.Params.pairSources} */
export function pairSources ( edit )
{
	const [ first, second ] = paramKeys( edit ).map( keyPattern );
	return [ [ first, second ], [ second, first ] ].map( ( [ one, other ] ) => `\\?(?:.*&)?${ one }(?:[=&].*)?&${ other }(?:[=&]|$)` );
}

// The same condition as pairSources() without a regular expression — the ends of urlFilter conditions, four per edit: for
// each order of the two names the earlier one as the first parameter of the query ("?a^*&b^") and as a later one
// ("?*&a^*&b^") — urlFilter has no alternative, so one condition per case. The difference from the regular expression:
// a name without a value right before the other one ("?a&b=1") — "^" after the first name takes the "&" the second
// one needs (tracking parameters always have a value; verified in Chrome 156 and Firefox 159). null when urlFilter cannot
// write one of the names (keyFilter()) — then the regular expressions of pairSources().
/** @type {Functions.DeclarativeNetRequest.Params.pairFilters} */
export function pairFilters ( edit )
{
	const [ first, second ] = paramKeys( edit ).map( keyFilter );
	if ( first === null || second === null ) return null;
	return [ [ first, second ], [ second, first ] ].flatMap( ( [ one, other ] ) => [ `?${ one }^*&${ other }^`, `?*&${ one }^*&${ other }^` ] );
}

// The redirects of a parameter rule (valid edits — validParams() of rules.mjs): the edits without a related parameter
// together — with presenceSources() and presenceFilters() of them —, and every edit with one (the same one only once,
// in either order of the names) on its own with the condition "both are in the query" (pairSources(), pairFilters());
// its action also carries the edits without a related parameter — the browser applies one redirect to a request at a
// time, so whichever comes first leaves the least for the next one. paired: the condition must hold for every address
// (over the budget of conditions an address gets none, not the address with any query — rules.mjs).
/** @type {Functions.DeclarativeNetRequest.Params.paramRedirects} */
export function paramRedirects ( edits )
{
	const singles = edits.filter( ( edit ) => !isPairedParam( edit ) );
	/** @type {Types.DeclarativeNetRequest.ParamRedirect[]} */
	const redirects = singles.length > 0
		? [ { transform: toQueryTransform( singles ), condition: singles, presences: presenceSources( singles ), filters: presenceFilters( singles ), paired: false } ]
		: [];
	/** @type {Set<string>} */
	const seen = new Set();
	for ( const edit of edits.filter( isPairedParam ) ) {
		const key = JSON.stringify( [ ...paramKeys( edit ).sort(), edit.operation, edit.operation === "set" ? edit.value.trim() : "" ] );
		if ( seen.has( key ) ) continue;
		seen.add( key );
		redirects.push( { transform: toQueryTransform( [ ...singles, edit ] ), condition: [ edit ], presences: pairSources( edit ), filters: pairFilters( edit ), paired: true } );
	}
	return redirects;
}

// Can a redirect of the rule stop another one of it (valid edits)? A redirect that sets a value changes nothing once the
// value is in the address, but the browser still applies it (see above) — with the same priority it may take it instead
// of another one that would change something: the edits without a related parameter set a value and the rule has an edit
// with one, or of several (different) edits with a related parameter one sets a value. Removing only is safe (every
// redirect removes something in the address it targets), and so is a single edit with a related parameter that sets a
// value next to edits without one that only remove — its action carries them, and once they are removed their redirect
// no longer targets the address.
/** @type {Functions.DeclarativeNetRequest.Params.paramsShadowed} */
export function paramsShadowed ( edits )
{
	const pairs = paramRedirects( edits ).filter( ( redirect ) => redirect.paired );
	const singlesSet = edits.some( ( edit ) => !isPairedParam( edit ) && edit.operation === "set" );
	return ( pairs.length > 0 && singlesSet ) || ( pairs.length > 1 && pairs.some( ( redirect ) => redirect.condition[ 0 ].operation === "set" ) );
}
