//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/domains.mjs
// The domain lists of the rules ("Where" and "Except") — without DOM and without the SDK. The copy of rules.mjs takes them
// from here, the same as rules.mjs of declarativeNetRequest takes them from its domains.mjs, which passes on the functions of
// the core: the SDK of the sandbox does not have them, so these are the same functions as normalizeDomain(),
// parseDomainList() and isHostInDomains() in base.mjs (tests/sandbox.test.mjs compares them) — the editor marks as invalid
// exactly what the background part of declarativeNetRequest leaves out.

// One item of a list ("https://www.Example.com:8080/x", "*.example.com", "example.com.", "::1") → a host name in lower
// case, international names in punycode, without the scheme, port, path, a leading "*." and a trailing dot; an IPv6
// address in brackets in its shortest form ("[::1]" also from "::1" — declarativeNetRequest takes it only so);
// nonsense → null.
/** @type {Functions.DeclarativeNetRequestSandbox.Domains.normalizeDomain} */
export function normalizeDomain(raw) {
	const trimmed = String(raw).trim().replace(/^\*\./, "");
	if (!trimmed) return null;
	// A bare IPv6 address (two colons at least, hexadecimal digits, an IPv4 end) gets the brackets of an address.
	const value = /^[0-9a-f]*:[0-9a-f.:]*:[0-9a-f.:]*$/i.test(trimmed) ? `[${trimmed}]` : trimmed;
	try {
		const hostname = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`).hostname.replace(/\.$/, "");
		return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(hostname) || /^\[[0-9a-f:]+\]$/.test(hostname) ? hostname : null;
	} catch {
		return null;
	}
}

// The list of domains from a field (domains separated by lines, commas or spaces) or an array — invalid items are
// skipped, duplicates merged; the order stays.
/** @type {Functions.DeclarativeNetRequestSandbox.Domains.parseDomainList} */
export function parseDomainList(value) {
	/** @type {unknown[]} */
	const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
	/** @type {string[]} */
	const domains = [];
	for (const item of items) {
		const domain = typeof item === "string" ? normalizeDomain(item) : null;
		if (domain && !domains.includes(domain)) domains.push(domain);
	}
	return domains;
}

// Is the host in one of the domains of the list (the domain itself or its subdomain)?
/** @type {Functions.DeclarativeNetRequestSandbox.Domains.isHostInDomains} */
export function isHostInDomains(hostname, domains) {
	const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
	return !!host && domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
