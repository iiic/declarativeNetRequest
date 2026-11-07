//@ts-check
"use strict";

// modules/declarativeNetRequest/suspensions.mjs
// Temporarily suspended rules — without DOM and without chrome.*, shared by the background
// part (background-script.mjs) and tests; the overview for the page and the overview of the
// suspensions in Settings in the sandbox (declarativeNetRequestSandbox) have a copy of it
// (tests/sandbox.test.mjs checks the two are the same).
//
// The overview's "Suspend temporarily" button suspends one rule for SUSPEND_DURATION_MS
// (everywhere it targets, not only on the current page); the button "Suspend temporarily for <domain>"
// next to it only for the domain of the page (the host without "www." — blockedPageDomain() of rules.mjs —,
// with its subdomains): the rule gets the domain among its "Except" domains (withSuspendedDomains()), so it
// targets neither requests to the domain nor files its pages load from elsewhere, and elsewhere it applies on.
// After that the permanent rule applies again by itself. The overview in Settings can cancel a suspension sooner.
// Both ask the background part (its services declarativeNetRequest.suspendRule and restoreRule, with
// { domain } for a domain).
// The suspensions are in api.state of this module (SUSPENDED_KEY, chrome.storage.local — they
// survive the background part going to sleep and a browser restart): { [rule id]: { until, title, domains } } —
// until: the end of the suspension of the whole rule (0 — the rule is suspended only for domains), domains: the
// domains it is suspended for (domain → the end of that suspension; missing when there is none, so the record of
// a rule suspended as a whole stays { until, title } — an older version of the extension reads it and drops the
// record of a rule suspended only for domains). The title is the rule's name at the moment of suspending, for the
// overview even when the rule was renamed or deleted in the meantime.
//
// The rules are applied by the browser itself, so the background part converts them again
// without the suspended ones after every change of the suspensions and when the earliest
// suspension ends (an alarm and a timer, see background-script.mjs); an expired suspension
// is ignored and the background part drops it from the state.
import { getUiLocale } from "../../sdk.mjs";
import { normalizeDomain, isHostInDomains } from "./domains.mjs";

// The key of the module's own state with the suspensions.
export const SUSPENDED_KEY = "suspendedRules";

// How long a rule is suspended for.
export const SUSPEND_DURATION_MS = 60 * 60 * 1000;

// The suspensions of a rule for domains still valid at the time now — only a domain of a rule (normalizeDomain(): the
// browser would reject all the rules of the module for another one in excludedRequestDomains).
/** @type {Functions.DeclarativeNetRequest.Suspensions.normalizeDomains} */
function normalizeDomains ( value, now )
{
	/** @type {Record<string, number>} */
	const domains = {};
	if ( !value || typeof value !== "object" || Array.isArray( value ) ) return domains;
	for ( const [ domain, until ] of Object.entries( /** @type {Record<string, unknown>} */( value ) ) ) {
		if ( typeof until !== "number" || !Number.isFinite( until ) || until <= now || normalizeDomain( domain ) !== domain ) continue;
		domains[ domain ] = until;
	}
	return domains;
}

// The stored value → suspensions still valid at the time now (items that are not
// a valid suspension drop out, the same as expired suspensions for domains).
/** @type {Functions.DeclarativeNetRequest.Suspensions.normalizeSuspensions} */
export function normalizeSuspensions ( value, now )
{
	/** @type {Types.DeclarativeNetRequest.Suspensions} */
	const suspensions = {};
	if ( !value || typeof value !== "object" || Array.isArray( value ) ) return suspensions;
	for ( const [ id, item ] of Object.entries( /** @type {Record<string, unknown>} */( value ) ) ) {
		if ( !id || !item || typeof item !== "object" ) continue;
		const row = /** @type {Record<string, unknown>} */ ( item );
		const until = typeof row.until === "number" && Number.isFinite( row.until ) && row.until > now ? row.until : 0;
		const domains = normalizeDomains( row.domains, now );
		const hasDomains = Object.keys( domains ).length > 0;
		if ( until === 0 && !hasDomains ) continue;
		suspensions[ id ] = { until, title: typeof row.title === "string" ? row.title : "", ...( hasDomains ? { domains } : {} ) };
	}
	return suspensions;
}

// Is the whole rule suspended at the time now? (not only for some domains)
/** @type {Functions.DeclarativeNetRequest.Suspensions.isSuspended} */
export function isSuspended ( suspensions, id, now )
{
	const suspension = Object.hasOwn( suspensions, id ) ? suspensions[ id ] : undefined;
	return !!suspension && suspension.until > now;
}

// The domains the rule is suspended for at the time now (in the order of suspending).
/** @type {Functions.DeclarativeNetRequest.Suspensions.suspendedDomains} */
export function suspendedDomains ( suspensions, id, now )
{
	const domains = Object.hasOwn( suspensions, id ) ? suspensions[ id ].domains : undefined;
	return domains ? Object.keys( domains ).filter( ( domain ) => domains[ domain ] > now ) : [];
}

// The suspension of the rule for a domain that covers the host (the domain itself or a domain above it) at the time
// now — of several the one that ends the latest (only then the rule applies to the host again); null — none.
/** @type {Functions.DeclarativeNetRequest.Suspensions.domainSuspensionFor} */
export function domainSuspensionFor ( suspensions, id, host, now )
{
	/** @type {Types.DeclarativeNetRequest.DomainSuspension | null} */
	let found = null;
	for ( const domain of suspendedDomains( suspensions, id, now ) ) {
		if ( !isHostInDomains( host, [ domain ] ) ) continue;
		const until = /** @type {Record<string, number>} */ ( suspensions[ id ].domains )[ domain ];
		if ( !found || until > found.until ) found = { domain, until };
	}
	return found;
}

// The rules not suspended at the time now (the order stays) — the rules suspended only for domains stay.
/** @type {Functions.DeclarativeNetRequest.Suspensions.withoutSuspended} */
export function withoutSuspended ( rules, suspensions, now )
{
	return rules.filter( ( rule ) => !isSuspended( suspensions, rule.id, now ) );
}

// The rules with the domains they are suspended for at the time now among their "Except" domains (exceptDomains of
// compileRules() in rules.mjs) — buildNetworkRules() then gives them to the browser as excludedRequestDomains and
// excludedInitiatorDomains, and matchUrl() does not list the rule for a page of the domain. The other rules stay the
// same objects.
/** @type {Functions.DeclarativeNetRequest.Suspensions.withSuspendedDomains} */
export function withSuspendedDomains ( rules, suspensions, now )
{
	return rules.map( ( rule ) =>
	{
		const domains = suspendedDomains( suspensions, rule.id, now ).filter( ( domain ) => !rule.exceptDomains.includes( domain ) );
		return domains.length > 0 ? { ...rule, exceptDomains: [ ...rule.exceptDomains, ...domains ] } : rule;
	} );
}

// When the earliest of the suspensions ends — of the whole rules and for domains (null = none).
/** @type {Functions.DeclarativeNetRequest.Suspensions.nextExpiry} */
export function nextExpiry ( suspensions )
{
	const times = Object.values( suspensions )
		.flatMap( ( suspension ) => [ suspension.until, ...Object.values( suspension.domains || {} ) ] )
		.filter( ( time ) => time > 0 );
	return times.length > 0 ? Math.min( ...times ) : null;
}

// The suspensions sorted by when they end (the soonest first) — for the listing: the suspension of a whole rule and
// each suspension of a rule for a domain (with domain) as an item of its own.
/** @type {Functions.DeclarativeNetRequest.Suspensions.listSuspensions} */
export function listSuspensions ( suspensions )
{
	return Object.entries( suspensions )
		.flatMap( ( [ id, { until, title, domains } ] ) => [
			...( until > 0 ? [ { id, until, title } ] : [] ),
			...Object.entries( domains || {} ).map( ( [ domain, end ] ) => ( { id, until: end, title, domain } ) ),
		] )
		.sort( ( a, b ) => a.until - b.until );
}

// The time a suspension ends (hours and minutes, the date too when it is not today).
/** @type {Functions.DeclarativeNetRequest.Suspensions.formatUntil} */
export function formatUntil ( ms )
{
	const date = new Date( ms );
	/** @type {Intl.DateTimeFormatOptions} */
	const options = date.toDateString() === new Date().toDateString() ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" };
	try {
		return date.toLocaleString( getUiLocale(), options );
	} catch {
		return date.toISOString();
	}
}

// Suspends the rule for SUSPEND_DURATION_MS from now — the whole rule, with domain only for the domain (a domain of a
// rule, normalizeDomain()); repeated suspending extends it. The other suspensions of the rule stay.
/** @type {Functions.DeclarativeNetRequest.Suspensions.suspendRule} */
export async function suspendRule ( api, rule, now = Date.now(), domain = null )
{
	const suspensions = normalizeSuspensions( await api.state.get( SUSPENDED_KEY, {} ), now );
	const current = Object.hasOwn( suspensions, rule.id ) ? suspensions[ rule.id ] : { until: 0, title: rule.title };
	const until = now + SUSPEND_DURATION_MS;
	suspensions[ rule.id ] = domain === null ? { ...current, until, title: rule.title } : { ...current, title: rule.title, domains: { ...current.domains, [ domain ]: until } };
	await api.state.set( SUSPENDED_KEY, suspensions );
}

// Cancels the rule's suspension — of the whole rule, with domain only the one for the domain; the permanent rule
// applies again there. The other suspensions of the rule stay.
/** @type {Functions.DeclarativeNetRequest.Suspensions.cancelSuspension} */
export async function cancelSuspension ( api, id, now = Date.now(), domain = null )
{
	const suspensions = normalizeSuspensions( await api.state.get( SUSPENDED_KEY, {} ), now );
	const current = Object.hasOwn( suspensions, id ) ? suspensions[ id ] : null;
	if ( current ) {
		const until = domain === null ? 0 : current.until;
		const domains = { ...current.domains };
		if ( domain !== null ) delete domains[ domain ];
		if ( until === 0 && Object.keys( domains ).length === 0 ) delete suspensions[ id ];
		else suspensions[ id ] = { until, title: current.title, ...( Object.keys( domains ).length > 0 ? { domains } : {} ) };
	}
	await api.state.set( SUSPENDED_KEY, suspensions );
}
