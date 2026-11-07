/**
 * @file modules/declarativeNetRequest/suspensions.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/suspensions.mjs — temporarily suspended
 * rules (api.state) — whole rules and rules for domains —, checking them against the current time, suspending and cancelling.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** Temporary suspensions of one rule — of the whole rule and for domains. */
			type Suspension = {

				/** When the suspension of the whole rule ends (ms since the epoch) — then the permanent rule applies again; 0 — the rule is suspended only for domains */
				until: number;

				/** The rule's name at the moment of suspending */
				title: string;

				/** The domains the rule is suspended for (a domain of a rule → when that suspension ends); missing — none */
				domains?: Record<string, number>;
			};

			/** Suspended rules by rule id (api.state, SUSPENDED_KEY). */
			type Suspensions = Record<string, Suspension>;

			/** The suspension of a rule for a domain that covers a host. */
			type DomainSuspension = { domain: string; until: number };

			/** An item of the listing: the suspension of a whole rule, or (domain) of a rule for one domain. */
			type SuspensionItem = {
				id: string;
				until: number;
				title: string;

				/** The domain the rule is suspended for — missing for the suspension of the whole rule */
				domain?: string;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Suspensions {

				/** The suspensions of a rule for domains still valid at the time now (only domains of a rule) */
				type normalizeDomains = ( value: unknown, now: number ) => Record<string, number>;

				/** The stored value → suspensions still valid at the time now */
				type normalizeSuspensions = ( value: unknown, now: number ) => Types.DeclarativeNetRequest.Suspensions;

				/** Is the whole rule suspended at the time now? */
				type isSuspended = ( suspensions: Types.DeclarativeNetRequest.Suspensions, id: string, now: number ) => boolean;

				/** The domains the rule is suspended for at the time now */
				type suspendedDomains = ( suspensions: Types.DeclarativeNetRequest.Suspensions, id: string, now: number ) => string[];

				/** The suspension of the rule for a domain that covers the host (the one that ends the latest), or null */
				type domainSuspensionFor = ( suspensions: Types.DeclarativeNetRequest.Suspensions, id: string, host: string, now: number ) => Types.DeclarativeNetRequest.DomainSuspension | null;

				/** The rules whose whole rule is not suspended at the time now */
				type withoutSuspended = <T extends { id: string }>( rules: T[], suspensions: Types.DeclarativeNetRequest.Suspensions, now: number ) => T[];

				/** The rules with the domains they are suspended for among their "Except" domains */
				type withSuspendedDomains = <T extends { id: string; exceptDomains: string[] }>( rules: T[], suspensions: Types.DeclarativeNetRequest.Suspensions, now: number ) => T[];

				/** When the earliest suspension ends (of a whole rule or for a domain), or null */
				type nextExpiry = ( suspensions: Types.DeclarativeNetRequest.Suspensions ) => number | null;

				/** The suspensions sorted by when they end (each suspension for a domain as an item of its own) */
				type listSuspensions = ( suspensions: Types.DeclarativeNetRequest.Suspensions ) => Types.DeclarativeNetRequest.SuspensionItem[];

				/** The time a suspension ends (the date too when it is not today) */
				type formatUntil = ( ms: number ) => string;

				/** Suspends the rule for SUSPEND_DURATION_MS — the whole rule, with domain only for the domain */
				type suspendRule = ( api: Pick<Types.ModuleApi, 'state'>, rule: { id: string; title: string }, now?: number, domain?: string | null ) => Promise<void>;

				/** Cancels the rule's suspension — of the whole rule, with domain only the one for the domain */
				type cancelSuspension = ( api: Pick<Types.ModuleApi, 'state'>, id: string, now?: number, domain?: string | null ) => Promise<void>;

			}

		}

	}

}

export { };
