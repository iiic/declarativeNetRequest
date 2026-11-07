/**
 * @file modules/declarativeNetRequest/background-script.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/background-script.mjs — the background
 * part: converting the rules from Settings into declarativeNetRequest rules and passing them to the core (api.networkRules),
 * the addresses of images into the rule of the blocked images (the button of imageInfoSandbox through the core), the
 * pages of the active tab into the rule of the pages blocked while browsing (the buttons of declarativeNetRequestSandbox), the
 * notifications and the own log of the applied rules and the services of declarativeNetRequestSandbox (declarativeNetRequest.*).
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** Loaded rules: prepared for matching and converted for the browser. */
			type LoadedRules = {
				compiled: CompiledRule[];

				/** The compiled rules without the suspended ones, those suspended for domains with them among their "Except" domains — they go into the browser */
				applied: CompiledRule[];

				/** The suspensions valid at the time of loading */
				suspensions: Suspensions;
				networkRules: Types.NetworkRule[];

				/** The rules with notifications or the log on by the signature of each of their declarativeNetRequest rules */
				watchedBySignature: Map<string, WatchedRule>;

				/** declarativeNetRequest rules of every stored rule (rule id → count, 0 = none in the browser) */
				counts: Record<string, number>;

				/** Of them with a regular expression (regexFilter) — only the rules that have some */
				regexCounts: Record<string, number>;

				/** declarativeNetRequest rules left out because the browser cannot compile their regular expression — only the rules that have some */
				unsupportedCounts: Record<string, number>;
			};

			/** The conversion result: the prepared rules and how they turned out in the browser. */
			type SyncResult = {
				compiled: CompiledRule[];
				applied: CompiledRule[];
				suspensions: Suspensions;
				counts: Record<string, number>;
				regexCounts: Record<string, number>;
				unsupportedCounts: Record<string, number>;
				status: Types.NetworkRulesStatus;
			};

			/** A rule with notifications (notify) or the log (log) on — what the events of the browser need of it. */
			type WatchedRule = { id: string; title: string; kind: RuleKind; notify: boolean; log: boolean };

			/** A watched rule with the signature of its declarativeNetRequest rule in the browser (onRuleMatchedDebug). */
			type MatchedRuleNotice = WatchedRule & { signature: string };

			/**
			 * A rule applied to a request for the notification: from onRuleMatchedDebug (signature of the rule in the browser,
			 * ruleId null) or a request webRequest reported as blocked or redirected to https (ruleId of the rule, signature null);
			 * source — how it was found out (the texts of the notification).
			 */
			type NoticeMatch = { title: string; url: string; signature: string | null; ruleId: string | null; source: LogSource };

			/** The summary notification being collected — mixed: its requests were found out in different ways (the general text) */
			type PendingNotice = { count: number; last: NoticeMatch; mixed: boolean };

			/** Details of a DNR debug event match (the request as the browser reports it: url, method, type, tabId, initiator, …). */
			type RuleMatchedInfo = { rule: { ruleId: number }; request: LogRequest };

			/** webRequest.onErrorOccurred details — Firefox has originUrl instead of initiator. */
			type RequestErrorDetails = chrome.webRequest.WebResponseErrorDetails & { originUrl?: string };

			/** webRequest.onBeforeRedirect details — Firefox has originUrl instead of initiator and ip null instead of none. */
			type RequestRedirectDetails = Omit<chrome.webRequest.OnBeforeRedirectDetails, "ip"> & { originUrl?: string; ip?: string | null };

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace BackgroundScript {

				/** Request types the browser knows (ResourceType), otherwise the types common to Chrome and Firefox */
				type availableResourceTypes = () => string[];

				/** The rules without those whose regular expression the browser cannot compile (dropped: the ones left out) */
				type supportedNetworkRules = ( rules: Types.NetworkRule[] ) => Promise<{ rules: Types.NetworkRule[]; dropped: Types.NetworkRule[] }>;

				/** Bookmark addresses of the folders of enabled rules (folder id → addresses) */
				type readBookmarkUrls = ( rules: Types.DeclarativeNetRequest.RuleSetting[] ) => Promise<Map<string, string[]>>;

				/** Bookmark addresses of one folder (also in subfolders); null — the folder cannot be read */
				type readFolderUrls = ( folderId: string ) => Promise<string[] | null>;

				/** Loads the rules from the settings and converts them */
				type load = () => Promise<Types.DeclarativeNetRequest.LoadedRules>;

				/** Sends the converted rules to the core (only changed ones; fresh: without a change the status the core stored) */
				type sync = ( fresh: boolean ) => Promise<Types.DeclarativeNetRequest.SyncResult>;

				/** A conversion a moment later (several changes = one conversion) */
				type schedule = () => void;

				/** A bookmark change — a conversion when rules target folders */
				type onBookmarksChanged = () => void;

				/** Bookmark change listeners (when the permission is there) */
				type registerBookmarkListeners = () => void;

				/** Rules status for the element and the editor */
				type getStatus = ( request: Types.DeclarativeNetRequest.StatusRequest ) => Promise<Types.DeclarativeNetRequest.StatusResponse>;

				/** The address of an image into the rule of the blocked images, the conversion and whether the browser now blocks it */
				type blockImage = ( url: string ) => Promise<Types.DeclarativeNetRequest.BlockImageResponse>;

				/** Why the browser does not block an address added to a blocking rule (blocked — an applied rule blocks it); null — it blocks it */
				type blockProblem = ( granted: boolean, status: Types.NetworkRulesStatus, blocked: boolean ) => Types.DeclarativeNetRequest.BlockImageProblem | null;

				/** A write of the stored rules after the previous ones */
				type enqueueWrite = <T>( work: () => Promise<T> ) => Promise<T>;

				/** The stored rules (unsaved = DEFAULT_RULES) */
				type readRules = () => Promise<Types.DeclarativeNetRequest.RuleSetting[]>;

				/** STATUS_SERVICE: whether the module works and has its permission, and the state for the address ({ url }) */
				type pageStatus = ( options: unknown ) => Promise<Types.DeclarativeNetRequest.PageStatus>;

				/** Bookmark folders for the editor (null without the permission) */
				type readFolders = ( granted: boolean ) => Promise<Types.DeclarativeNetRequest.BookmarkFolder[] | null>;

				/** GET_RULES_SERVICE: the rules with what their editor needs */
				type rulesView = () => Promise<Types.DeclarativeNetRequest.RulesView>;

				/** FOLDER_URLS_SERVICE: the bookmark addresses of the folder { folderId } (null without the permission or an unreadable folder) */
				type folderUrls = ( options: unknown ) => Promise<Types.DeclarativeNetRequest.FolderUrls>;

				/** SET_RULES_SERVICE: stores the rules from the editor (checked) */
				type setRules = ( value: unknown ) => Promise<Types.DeclarativeNetRequest.SetRulesResult>;

				/** The id of a rule from { id }, otherwise an error */
				type ruleIdOf = ( options: unknown ) => string;

				/** The domain of { domain } as a domain of a rule (null — missing: the whole rule), otherwise an error */
				type domainOf = ( options: unknown ) => string | null;

				/** SUSPEND_SERVICE: suspends a stored rule temporarily — the whole rule, or with { domain } only for the domain */
				type suspend = ( options: unknown ) => Promise<Types.DeclarativeNetRequest.SuspendResult>;

				/** RELOAD_SERVICE: reloads the active tab of the page's window ({ tabId }) */
				type reloadTab = ( options: unknown, context: Types.ModuleServiceContext ) => Promise<{ reloaded: true }>;

				/** BLOCK_PAGE_SERVICE: the domain or the address of the page of the active tab of the page's window ({ tabId, url, scope }) into the rule of the pages blocked while browsing */
				type blockPage = ( options: unknown, context: Types.ModuleServiceContext ) => Promise<Types.DeclarativeNetRequest.BlockPageResponse>;

				/** EXCEPT_DOMAIN_SERVICE: the domain of the page of the active tab of the page's window ({ id, tabId, url }) into the "Except" domains of the rule with the id */
				type exceptDomain = ( options: unknown, context: Types.ModuleServiceContext ) => Promise<Types.DeclarativeNetRequest.ExceptDomainResponse>;

				/** The host of this extension (the id, in Firefox the internal UUID of moz-extension://), null when the browser does not give it */
				type extensionHost = () => string | null;

				/** The suspensions valid now (expired ones are dropped from api.state) */
				type loadSuspensions = () => Promise<Types.DeclarativeNetRequest.Suspensions>;

				/** A conversion when the earliest suspension ends (an alarm and a timer; null = none) */
				type scheduleExpiry = ( at: number | null ) => void;

				/** The stable content of a rule without its global ID. */
				type ruleSignature = ( rule: Types.NetworkRule ) => string;

				type stableJson = ( value: unknown ) => string;

				/** Adds a rule match to the summary silent notification. */
				type queueMatchedNotice = ( match: Types.DeclarativeNetRequest.NoticeMatch ) => void;

				/** An entry of the log waits for the write with the others (more than the log keeps — written right away). */
				type queueLogEntry = ( entry: Types.DeclarativeNetRequest.LogEntry ) => void;

				/** Writes the waiting entries in front of the stored log — settles once they are stored */
				type flushLog = () => Promise<unknown>;

				/** A change of the stored log after the waiting entries are written — how many entries it removed */
				type changeLog = ( change: ( entries: Types.DeclarativeNetRequest.LogEntry[] ) => Types.DeclarativeNetRequest.LogEntry[] ) => Promise<number>;

				/** GET_LOG_SERVICE: the entries of the log (also the waiting ones), its limit and how many rules write into it */
				type logView = () => Promise<Types.DeclarativeNetRequest.LogView>;

				/** CLEAR_LOG_SERVICE: deletes the entry with { id }, without an id all of them */
				type clearLog = ( options: unknown ) => Promise<Types.DeclarativeNetRequest.ClearLogResult>;

				/** Can the extension show a notification now? (Notification.permission) */
				type notificationsAllowed = () => boolean;

				/** Shows the summary silent notification. */
				type showMatchedNotice = ( notice: Types.DeclarativeNetRequest.PendingNotice ) => Promise<void>;

				/** Is the rule of the notice still applied with notifications on? */
				type isCurrentNotice = ( last: Types.DeclarativeNetRequest.NoticeMatch ) => Promise<boolean>;

				/** The applied rules of the last conversion, otherwise loaded */
				type currentAppliedRules = () => Promise<Types.DeclarativeNetRequest.CompiledRule[]>;

				/** An event about a dynamic rule being applied. */
				type onRuleMatched = ( info: Types.DeclarativeNetRequest.RuleMatchedInfo ) => void;

				/** Registers the debug listener, if the browser provides it. */
				type registerRuleMatchedListener = () => void;

				/** A failed request — a notification or an entry of the log when an extension blocked it and a blocking rule with them targets it */
				type onRequestError = ( details: Types.DeclarativeNetRequest.RequestErrorDetails ) => void;

				/** A redirect — a notification or an entry of the log when the browser upgraded http:// to https:// and a rule redirecting to HTTPS with them targets it */
				type onRequestRedirect = ( details: Types.DeclarativeNetRequest.RequestRedirectDetails ) => void;

				/** A blocked or upgraded request webRequest reported — the rule of the kind that targets it gets a notification or an entry of the log */
				type inferRequest = (
					details: Types.DeclarativeNetRequest.RequestErrorDetails | Types.DeclarativeNetRequest.RequestRedirectDetails,
					source: Exclude<Types.DeclarativeNetRequest.LogSource, "feedback">
				) => void;

				/** Did the browser itself redirect http:// to the same address with https:// (not a redirect of the server)? */
				type isSchemeUpgrade = ( details: Pick<Types.DeclarativeNetRequest.RequestRedirectDetails, "url" | "redirectUrl" | "statusCode" | "statusLine" | "ip"> ) => boolean;

				/** Registers the webRequest.onErrorOccurred and onBeforeRedirect listeners, if the permission is granted. */
				type registerRequestListeners = () => void;

				/** Updates the map of the browser's dynamic rule IDs to the module's rules with notifications or the log on. */
				type refreshMatchedRules = ( watchedBySignature: Map<string, Types.DeclarativeNetRequest.WatchedRule> ) => Promise<boolean>;

				type extensionIconUrl = () => string | undefined;

				type shortUrl = ( url: string ) => string;

			}

		}

	}

}

export { };
