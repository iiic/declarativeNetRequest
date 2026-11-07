/**
 * @file modules/declarativeNetRequest/matchLog.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/matchLog.mjs — the module's own log of the
 * requests the rules with "Into the own event log" were applied to (api.state): the entries, merging a batch, the limit,
 * searching and the rule filter of the overview.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** How the background part learned about the applied rule: the browser reported it, or it inferred it from a blocked request */
			type LogSource = 'feedback' | 'blocked' | 'upgraded';

			/** One entry of the log — a request a rule was applied to (the same request repeated within a moment: count). */
			type LogEntry = {

				/** Unique in the log */
				id: string;

				/** When the (last) request came (ms since the epoch) */
				at: number;

				/** How many times the same request came within one batch */
				count: number;

				/** The id of the rule in Settings */
				ruleId: string;

				/** The title of the rule at the moment of the request (the entered one, otherwise "Rule N") */
				title: string;
				kind: RuleKind;

				/** The address of the request */
				url: string;

				/** The request type (ResourceType; "" — unknown) */
				type: string;

				/** The HTTP method ("" — unknown) */
				method: string;

				/** The tab of the request (null — none, or unknown) */
				tabId: number | null;

				/** Where the request came from (Chrome "initiator", Firefox "originUrl"; "" — unknown) */
				initiator: string;
				source: LogSource;
			};

			/** The rule the entry is about, as the background part knows it. */
			type LogRule = { id: string; title: string; count: number };

			/** The request of an entry (from onRuleMatchedDebug or webRequest.onErrorOccurred). */
			type LogRequest = { url: string; type?: string; method?: string; tabId?: number; initiator?: string };

			/** The search and the rule filter of the overview (ruleId "" — all rules). */
			type LogCriteria = { query: string; ruleId: string };

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace MatchLog {

				/** A text shortened to max characters (ending with "…"); not a text — "" */
				type clip = ( value: unknown, max: number ) => string;

				/** The id of an entry (the time and a random part) */
				type newLogId = ( at: number ) => string;

				/** An entry about one request a rule was applied to */
				type createLogEntry = ( rule: Pick<Types.DeclarativeNetRequest.CompiledRule, 'id' | 'title' | 'kind'>, request: Types.DeclarativeNetRequest.LogRequest, source: Types.DeclarativeNetRequest.LogSource, at?: number ) => Types.DeclarativeNetRequest.LogEntry;

				/** A stored value → an entry, or null */
				type normalizeLogEntry = ( value: unknown ) => Types.DeclarativeNetRequest.LogEntry | null;

				/** The stored log → valid entries (the newest first), at most MAX_LOG_ENTRIES */
				type normalizeLog = ( value: unknown ) => Types.DeclarativeNetRequest.LogEntry[];

				/** What makes two entries the same request */
				type logEntryKey = ( entry: Types.DeclarativeNetRequest.LogEntry ) => string;

				/** The waiting entries (merged) in front of the stored log, at most MAX_LOG_ENTRIES */
				type appendLog = ( stored: unknown, batch: Types.DeclarativeNetRequest.LogEntry[] ) => Types.DeclarativeNetRequest.LogEntry[];

				/** The log without the entry with the id */
				type removeLogEntry = ( stored: unknown, id: string ) => Types.DeclarativeNetRequest.LogEntry[];

				/** Text for searching regardless of letter case and diacritics */
				type foldText = ( text: string ) => string;

				/** Does the entry match the searched text? */
				type matchesLogQuery = ( entry: Types.DeclarativeNetRequest.LogEntry, query: string ) => boolean;

				/** The entries by the search and the rule */
				type filterLog = ( entries: Types.DeclarativeNetRequest.LogEntry[], criteria: Types.DeclarativeNetRequest.LogCriteria ) => Types.DeclarativeNetRequest.LogEntry[];

				/** The rules of the entries for the filter, by title */
				type listLogRules = ( entries: Types.DeclarativeNetRequest.LogEntry[] ) => Types.DeclarativeNetRequest.LogRule[];

				/** The time of an entry (the date too when it is not today) */
				type formatLogTime = ( ms: number, now?: number ) => string;

			}

		}

	}

}

export { };
