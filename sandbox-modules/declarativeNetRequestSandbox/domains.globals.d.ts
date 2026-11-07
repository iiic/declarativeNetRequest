/**
 * @file sandbox-modules/declarativeNetRequestSandbox/domains.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/domains.mjs — the domain lists of
 * the rules in the sandbox, the same functions as normalizeDomain(), parseDomainList() and isHostInDomains() of the core.
 */

declare global {

	namespace Functions {

		namespace DeclarativeNetRequestSandbox {

			namespace Domains {

				/** One item of a domain list → a host name, or null */
				type normalizeDomain = Functions.Base.normalizeDomain;

				/** The domains of a field or an array (invalid items skipped, without duplicates) */
				type parseDomainList = Functions.Base.parseDomainList;

				/** Is the host one of the domains or their subdomain? */
				type isHostInDomains = Functions.Base.isHostInDomains;

			}

		}

	}

}

export { };
