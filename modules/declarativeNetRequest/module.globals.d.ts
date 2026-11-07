/**
 * @file modules/declarativeNetRequest/module.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/module.mjs — the module description without DOM,
 * the settings key, the messages of the element and of the core to the background part and the results of the services of the
 * background part for declarativeNetRequestSandbox.
 * Module: Edits and removes HTTP headers and GET parameters in the address and blocks requests of pages and their files through declarativeNetRequest.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** The module.mjs namespace — checked against Types.ModuleDescriptor (the full module description). */
			type Descriptor = Types.Satisfies<Types.ModuleDescriptor, typeof import( './module.mjs' )>;

			/** A rule state request (url: the page for which to list the rules that target it). */
			type StatusRequest = { url?: string | null };

			/** The rule state from the background part. */
			type StatusResponse = {

				/** The module is in the module list and is not turned off */
				active: boolean;

				/** How the rules turned out in the browser (api.networkRules.set()) */
				status: Types.NetworkRulesStatus;

				/** How many rules from Settings are converted into the browser (enabled, with a valid edit and target, not suspended) */
				rules: number;

				/** How many declarativeNetRequest rules each stored rule makes (rule id → count, 0 = none: turned off, suspended, without a valid edit or target) */
				counts: Record<string, number>;

				/** Of them with a regular expression (regexFilter) instead of urlFilter (rule id → count, only the rules that have some) */
				regexCounts: Record<string, number>;

				/** declarativeNetRequest rules left out because the browser cannot compile their regular expression (rule id → count, only the rules that have some) */
				unsupportedCounts: Record<string, number>;

				/** Ids of the rules suspended right now as a whole (not those suspended only for domains) */
				suspendedIds: string[];

				/** Rules that target the url address and apply (are not suspended, nor for a domain of the address) */
				matched: MatchedRule[];

				/** Rules that target the url address but are temporarily suspended — as a whole, or for a domain of the address */
				suspended: SuspendedRule[];
			};

			/**
			 * A temporarily suspended rule in the state: until when it is suspended; domain — it is suspended only for this domain
			 * (it covers the host of the address; missing — the whole rule is suspended).
			 */
			type SuspendedRule = MatchedRule & { until: number; domain?: string };

			/** An error while determining the state. */
			type StatusError = { error: string };

			/**
			 * Why the browser does not block the address of a blocked image (or of a page blocked from the overview, BLOCK_PAGE_SERVICE):
			 * the module lacks the permission (HEADERS_PERMISSIONS, or the browser does not provide the API), no applied rule blocks
			 * images (pages) at the address (the rule is turned off, temporarily suspended, changed), the module is turned off or not
			 * in the module list, the browser rejected the rules.
			 */
			type BlockImageProblem = 'permission' | 'rule' | 'module' | 'browser';

			/** The address of an image in the rule of the blocked images (BLOCK_IMAGE_SERVICE). */
			type BlockImageResponse = {

				/** The id and the title of the rule (the stored title, otherwise IMAGE_BLOCK_RULE_TITLE) */
				ruleId: string;
				title: string;

				/** false — the rule already had the address */
				added: boolean;

				/** Why the browser does not block the address now (null — it blocks it) */
				problem: BlockImageProblem | null;
			};

			/** The domain or the address of the page of the active tab in the rule of the pages blocked while browsing (BLOCK_PAGE_SERVICE). */
			type BlockPageResponse = {

				/** The id and the title of the rule (the stored title, otherwise PAGE_BLOCK_RULE_TITLE) */
				ruleId: string;
				title: string;
				scope: BlockPageScope;

				/** What went into the rule: the domain (without "www."), or the address (without "#…") */
				target: string;

				/** false — the rule already covered it */
				added: boolean;

				/** Why the browser does not block the page now (null — it blocks it) */
				problem: BlockImageProblem | null;
			};

			/** The domain of the page of the active tab in the "Except" domains of a rule (EXCEPT_DOMAIN_SERVICE). */
			type ExceptDomainResponse = {

				/** The id and the title of the rule (the stored title, otherwise "Rule N") */
				ruleId: string;
				title: string;

				/** The domain that went into the "Except" domains (the host of the page without "www.") */
				domain: string;

				/** false — the "Except" domains already covered it */
				added: boolean;
			};

			/** Why the module does not work (api.activation.reason()): not in the module list, turned off; null — it works. */
			type InactiveReason = 'notListed' | 'disabled';

			/** The state for the overview of a page (STATUS_SERVICE, the function declarativeNetRequest.getStatus). */
			type PageStatus = {
				reason: InactiveReason | null;

				/** The permission for the rules (HEADERS_PERMISSIONS) is granted */
				granted: boolean;

				/** The state of the rules for the address — only with the permission (the rules were converted), otherwise null */
				state: StatusResponse | null;
			};

			/** The granted permissions the editor of the rules tells about. */
			type RulesViewPermissions = {

				/** HEADERS_PERMISSIONS — the rules go into the browser */
				headers: boolean;

				/** BOOKMARKS_PERMISSIONS — the bookmark folders of the rules */
				bookmarks: boolean;

				/** "notifications" — notifications also when the page has denied them */
				notifications: boolean;

				/** "declarativeNetRequestFeedback" — the browser reports the applied rules */
				feedback: boolean;

				/** WEBREQUEST_PERMISSIONS — blocked requests without declarativeNetRequestFeedback */
				webRequest: boolean;
			};

			/** The rules with what their editor needs (GET_RULES_SERVICE, the function declarativeNetRequest.getRules). */
			type RulesView = {
				reason: InactiveReason | null;

				/** The stored rules, otherwise the defaults (DEFAULT_RULES) */
				rules: RuleSetting[];

				/** The rules are stored (false — the defaults, not saved yet) */
				stored: boolean;

				/** The folders of the bookmark tree — null without the permission */
				folders: BookmarkFolder[] | null;
				permissions: RulesViewPermissions;

				/** Notifications in this browser: the Notification API, its permission, the browser reports the applied rules (onRuleMatchedDebug) */
				notify: { supported: boolean; permission: NotificationPermission | null; feedback: boolean };

				/** How the rules turned out in the browser — only with HEADERS_PERMISSIONS (the conversion ran), otherwise null */
				browser: {
					status: Types.NetworkRulesStatus;
					counts: Record<string, number>;

					/** Of them with a regular expression (missing from an older background part) */
					regexCounts?: Record<string, number>;

					/** Rules left out because the browser cannot compile their regular expression (missing from an older background part) */
					unsupportedCounts?: Record<string, number>;
					suspendedIds: string[];
				} | null;

				/** The suspensions valid now — of whole rules and of rules for domains —, the soonest ending first */
				suspensions: SuspensionItem[];

				/** The request types (ResourceType) the browser knows — the editor converts a rule into JSON with them (availableResourceTypes()) */
				resourceTypes: string[];

				/** The host of this extension (the id, in Firefox the internal UUID) for the rules with "Except the requests of this extension" in the JSON of a rule (missing from an older background part) */
				extensionHost?: string | null;
			};

			/**
			 * The addresses of the bookmarks in a folder, also in its subfolders (FOLDER_URLS_SERVICE, the function
			 * declarativeNetRequest.getFolderUrls) — the same the conversion of a rule with the folder takes; null: the folder cannot
			 * be read (without the permission to bookmarks, deleted).
			 */
			type FolderUrls = { urls: string[] | null };

			/** The stored rules after SET_RULES_SERVICE (checked by normalizeRules()). */
			type SetRulesResult = { rules: RuleSetting[] };

			/** When the suspension of a rule ends — of the whole rule, or for the domain of { domain } (SUSPEND_SERVICE). */
			type SuspendResult = { until: number | null };

			/** The own log of the applied rules (GET_LOG_SERVICE, the function declarativeNetRequest.getLog). */
			type LogView = {

				/** The entries, the newest first */
				entries: LogEntry[];

				/** How many entries the log keeps at most (MAX_LOG_ENTRIES) */
				max: number;

				/** How many enabled stored rules write into the log */
				rules: number;

				/** The colors of the stored rules by their id ("#rrggbb"; a rule without a color is missing) */
				colors: Record<string, string>;
			};

			/** How many entries CLEAR_LOG_SERVICE deleted. */
			type ClearLogResult = { removed: number };

		}

		interface Messages {

			/** Element → background part: converts the stored rules into the browser and returns their state */
			DECLARATIVE_NET_REQUEST_STATUS: {
				request: DeclarativeNetRequest.StatusRequest;
				response: DeclarativeNetRequest.StatusResponse | DeclarativeNetRequest.StatusError;
			};

		}

	}

}

export { };
