/**
 * @file modules/declarativeNetRequest/rules.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/rules.mjs — header and GET parameter edit rules:
 * the stored settings, parsing the fields, converting into declarativeNetRequest rules, matching against the page address and bookmark
 * folders for the editor.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** A group of requests the rule targets (page, frames, scripts, …). */
			type PartKey = 'page' | 'frames' | 'scripts' | 'styles' | 'images' | 'fonts' | 'xhr' | 'media' | 'websocket' | 'other';

			/** A request group and its declarativeNetRequest types (ResourceType; "other" = the remaining ones the browser knows). */
			type PartGroup = { key: PartKey; types: string[] };

			/** What the rule does: edits headers, edits GET parameters in the address, blocks requests, or loads them over HTTPS instead of HTTP */
			type RuleKind = 'headers' | 'params' | 'block' | 'upgrade';

			type Protocol = 'any' | 'http' | 'https';

			/** A header edit, GET parameter or blocking rule as it is stored (field texts as the user wrote them — with comments, withoutComments()). */
			type RuleSetting = {

				/** The permanent rule id */
				id: string;

				/** The title (empty = "Rule N") */
				title: string;
				enabled: boolean;

				/** Announce the requests the rule was applied to with a silent notification */
				notifyMatched: boolean;

				/** Write the requests the rule was applied to into the module's own event log (matchLog.mjs) */
				logMatched: boolean;

				/** "List the rule in the overview": "Closed" — the details of the rule start folded in the overview of the page */
				closedInOverview: boolean;

				/** The color chosen in the editor ("#rrggbb", empty = none) — a line next to the rule in the overview */
				color: string;
				protocol: Protocol;

				/** What the rule edits (headers without a stored kind) */
				kind: RuleKind;

				/** Header edits in the order the user entered them (only for the "headers" kind) */
				headers: HeaderEdit[];

				/** GET parameter edits in the order the user entered them (only for the "params" kind) */
				params: ParamEdit[];

				/** Which requests the rule targets */
				parts: PartKey[];

				/** Domains, one per line (including subdomains) */
				domains: string;

				/** Addresses of pages and files, one per line ("*" stands for anything) */
				pages: string;

				/** The bookmark folder (empty = none) */
				folderId: string;

				/** The folder name at the time of saving (when the bookmark tree does not have it) */
				folderTitle: string;

				/** Applies on the whole domain of every bookmark from the folder */
				wholeDomain: boolean;

				/** Domains on which the rule does not apply (including subdomains), one per line */
				exceptDomains: string;

				/** The rule does not apply to requests to private and local IP addresses (PRIVATE_RANGES; not a GET parameter rule) */
				exceptPrivate: boolean;

				/** The rule does not apply to the requests of this extension (its background part and pages — the host of the extension among excludedInitiatorDomains) */
				exceptExtension: boolean;
			};

			/** The text of a field without its comments (parseComments()). */
			type CommentedText = {

				/** The text without the comments */
				text: string;

				/** The last comment has no closing "*\/" (it runs to the end of the field) */
				unclosed: boolean;
			};

			/** Adresy z textu pole. */
			type PageList = {

				/** Exact addresses (without "#…", for parameter rules also without "?…") */
				exact: string[];

				/** Sources of whole-address regular expressions for patterns with "*" (case-insensitive) */
				patterns: string[];

				/** The same patterns for urlFilter, in the same order as patterns */
				patternFilters: PatternFilter[];
				invalid: string[];
			};

			/** A pattern with "*" for urlFilter (parsePageList()). */
			type PatternFilter = {

				/** The line of the field the pattern is from */
				line: string;

				/** The beginnings of its urlFilter conditions ("|https://cdn.test/*.js", without the end), null = only a regular expression ("|" or "^" in the line) */
				filters: string[] | null;
			};

			/** How many more browser rules the "the parameter is in the address" conditions of individual addresses may make (buildNetworkRules()). */
			type PageBudget = {

				/** As urlFilter (PAGE_FILTER_BUDGET) */
				filters: number;

				/** As a regular expression (PAGE_REGEX_BUDGET) */
				regex: number;
			};

			/** Why a rule needs regular expressions (regexFilter) in the browser (regexReasons()). */
			type RegexReasons = {

				/** Exact addresses with "|", "^" or "*" */
				addresses: string[];

				/** Lines of patterns with "|" or "^" */
				patterns: string[];

				/** Names of the parameters urlFilter cannot write (a rule that only removes parameters) */
				paramNames: string[];

				/** A rule that only removes parameters with a bookmark folder — its addresses get urlFilter only within PAGE_FILTER_BUDGET */
				folder: boolean;

				/** "Except private and local IP addresses" for all addresses or the files the pages of the domains load from elsewhere */
				privateAddresses: boolean;
			};

			/** A rule prepared for conversion and matching against addresses. */
			type CompiledRule = {
				id: string;

				/** The title for the output (the entered one, otherwise "Rule N") */
				title: string;
				notifyMatched: boolean;
				logMatched: boolean;

				/** The details of the rule start folded in the overview of the page */
				closedInOverview: boolean;

				/** The color chosen in the editor ("#rrggbb", empty = none) */
				color: string;
				protocol: Protocol;

				/** The declarativeNetRequest priority (the first rule in the list highest) */
				priority: number;
				kind: RuleKind;

				/** Valid header edits (empty for a parameter rule) */
				headers: HeaderEdit[];

				/** Valid GET parameter edits (empty for a header rule) */
				params: ParamEdit[];

				/** Groups the rule actually targets (ruleParts()) */
				parts: PartKey[];

				/** Domains (including subdomains) — from the list and from bookmark domains */
				domains: string[];

				/** Exact addresses — from the list and the folder's bookmarks (for parameter rules without the query) */
				exactPages: Set<string>;

				/** Sources of regular expressions of patterns with "*" (for parameter rules for an address with and without a query) */
				pagePatterns: string[];

				/** The same patterns for urlFilter, in the same order as pagePatterns */
				patternFilters: PatternFilter[];

				/** "Except" domains (including subdomains) — the rule does not target them nor the files of their pages */
				exceptDomains: string[];

				/** Initiators the rule skips besides the "Except" domains (not for the page): the host of this extension with exceptExtension */
				exceptInitiators: string[];

				/** The rule does not target requests to private and local IP addresses (exceptsPrivate()) */
				exceptPrivate: boolean;

				/** The patterns that still target a request to a private address (with exceptPrivate all of pagePatterns but all addresses) */
				privatePatterns: string[];
			};

			/** A rule that targets the page address (the output in the element). */
			type MatchedRule = {
				id: string;
				title: string;

				/** The color chosen in the editor ("#rrggbb", empty = none) */
				color: string;

				/** The details of the rule start folded in the overview of the page */
				closedInOverview: boolean;
				kind: RuleKind;
				headers: HeaderEdit[];
				params: ParamEdit[];
				parts: PartKey[];

				/** Through the domain (also files the page loads from elsewhere), or through the address */
				via: 'domain' | 'page';
			};

			/** A request an extension blocked (from webRequest.onErrorOccurred) for matchBlockedRequest(). */
			type BlockedRequest = {
				url: string;

				/** The request type (webRequest ResourceType — the same names as in declarativeNetRequest) */
				type: string;

				/** Where the request came from: Chrome "initiator" (an origin), Firefox "originUrl" */
				initiator?: string;
			};

			/** addBlockedImage(): the new list of the rules, the rule of the blocked images in it and whether the address is new there. */
			type BlockedImageResult = { rules: RuleSetting[]; rule: RuleSetting; added: boolean };

			/** What of the page the buttons of the overview block (addBlockedPage()): the whole domain, or the exact address. */
			type BlockPageScope = 'domain' | 'url';

			/**
			 * addBlockedPage(): the new list of the rules, the rule of the pages blocked while browsing in it, what goes into it (the
			 * domain, or the address) and whether it is new there (false — the rule already covers it).
			 */
			type BlockedPageResult = { rules: RuleSetting[]; rule: RuleSetting; target: string; added: boolean };

			/**
			 * addExceptDomain(): the new list of the rules, the rule with the domain among its "Except" domains, the domain (the host
			 * of the page without "www.") and whether it is new there (false — the "Except" domains already covered it).
			 */
			type ExceptDomainResult = { rules: RuleSetting[]; rule: RuleSetting; domain: string; added: boolean };

			/** A bookmark folder for the selection in the editor. */
			type BookmarkFolder = {
				id: string;

				/** The folder name */
				title: string;

				/** The path with the folder ("Bookmarks Bar › Work") */
				label: string;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Rules {

				/** A new permanent rule id */
				type newRuleId = () => string;

				/** A color of a rule as "#rrggbb" in lowercase, otherwise an empty string (no color) */
				type normalizeColor = ( value: unknown ) => string;

				/** The request groups a rule of the kind can target (a GET parameter rule and the upgrade to HTTPS without WebSocket) */
				type kindPartKeys = ( kind: Types.DeclarativeNetRequest.RuleKind ) => readonly Types.DeclarativeNetRequest.PartKey[];

				/** The rule of the kind with the highest priority that targets a request webRequest reported, null = none */
				type matchRequestOfKind = (
					compiled: Types.DeclarativeNetRequest.CompiledRule[],
					request: Types.DeclarativeNetRequest.BlockedRequest,
					available: string[],
					kind: Types.DeclarativeNetRequest.RuleKind
				) => Types.DeclarativeNetRequest.CompiledRule | null;

				/** The rule redirecting to HTTPS that in all likelihood redirected the request (null = none targets it) */
				type matchUpgradedRequest = (
					compiled: Types.DeclarativeNetRequest.CompiledRule[],
					request: Types.DeclarativeNetRequest.BlockedRequest,
					available: string[]
				) => Types.DeclarativeNetRequest.CompiledRule | null;

				/** The protocol the rule actually targets (the upgrade to HTTPS only http) */
				type ruleProtocol = ( rule: Pick<Types.DeclarativeNetRequest.RuleSetting, "kind" | "protocol"> ) => Types.DeclarativeNetRequest.Protocol;

				/** Is the host (as URL writes it) in PRIVATE_RANGES? */
				type isPrivateHost = ( host: string | null | undefined ) => boolean;

				/** A regular expression: not the text, or the text followed by the tail (null: the whole text is private) */
				type chain = ( text: string, tail: string | null ) => string;

				/** The host a pattern (the source of its regular expression) writes out whole, null when it does not fix it */
				type patternHost = ( pattern: string ) => string | null;

				/** Does the rule except private and local IP addresses (exceptPrivate, not a GET parameter rule)? */
				type exceptsPrivate = ( rule: Pick<Types.DeclarativeNetRequest.RuleSetting, "exceptPrivate" | "kind"> ) => boolean;

				/** The condition without requests to private addresses — a condition per part of NOT_PRIVATE_HOST_PARTS */
				type privateExcluded = ( condition: chrome.declarativeNetRequest.RuleCondition ) => chrome.declarativeNetRequest.RuleCondition[];

				/** Lines of the patterns "Except private and local IP addresses" does not apply to */
				type privateGaps = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => string[];

				/** An empty (enabled) rule for all requests */
				type emptyRule = ( id: string ) => Types.DeclarativeNetRequest.RuleSetting;

				/** Stored settings → an array of rules with unique ids */
				type normalizeRules = ( value: unknown ) => Types.DeclarativeNetRequest.RuleSetting[];

				namespace normalizeRules {

					/** The text value of a field, otherwise an empty string */
					type text = ( item: unknown ) => string;

				}

				/** The text of a field without its comments (separated: "/*" opens one only at the beginning, after whitespace or right after another comment) */
				type parseComments = ( value: unknown, separated?: boolean ) => Types.DeclarativeNetRequest.CommentedText;

				namespace parseComments {

					/** Copies the text up to end into the output — with a space or a line break for the comments before it, where it goes on a line */
					type copy = ( end: number ) => void;

				}

				/** The text of a field without its comments (parseComments()) */
				type stripComments = ( value: unknown, separated?: boolean ) => string;

				/** The rule as it applies — its text fields without the comments */
				type withoutComments = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.RuleSetting;

				/** The text of a field with one more line at its end (a comment without "*\/" at its end closed first) */
				type appendLine = ( text: string, line: string, separated: boolean ) => string;

				/** The rule title for the output */
				type ruleTitle = ( rule: Types.DeclarativeNetRequest.RuleSetting, index: number ) => string;

				/** Filled-in header edits without an error */
				type validEdits = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.HeaderEdit[];

				/** Filled-in GET parameter edits without an error */
				type validParams = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.ParamEdit[];

				/** Does the rule have valid edits of its kind (blocking and the upgrade to HTTPS always)? */
				type hasValidEdits = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => boolean;

				/** "Which requests" groups the rule actually targets */
				type ruleParts = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.PartKey[];

				/** Non-empty trimmed lines without repetition */
				type parseLines = ( value: unknown ) => string[];

				/** An http(s) address without "#…" (withoutQuery: also without "?…") in a uniform form, otherwise null */
				type pageKey = ( url: string | null | undefined, withoutQuery?: boolean ) => string | null;

				/** The host of an http(s) address without "www.", otherwise null */
				type siteOf = ( url: string | null | undefined ) => string | null;

				/** Addresses from the field text (withoutQuery: parameter rules, addresses without a query) */
				type parsePageList = ( value: unknown, withoutQuery?: boolean ) => Types.DeclarativeNetRequest.PageList;

				/** The beginnings of the urlFilter conditions of a pattern with "*" (text with non-ASCII characters encoded), null = urlFilter cannot write it */
				type patternUrlFilters = ( text: string, hasScheme: boolean ) => string[] | null;

				/** The address of an image into the rule of the blocked images (a new one first in the list); null for an address that is not http(s) */
				type addBlockedImage = ( rules: Types.DeclarativeNetRequest.RuleSetting[], url: string ) => Types.DeclarativeNetRequest.BlockedImageResult | null;

				/** The domain the block of the whole domain of a page adds (the host without "www."), otherwise null */
				type blockedPageDomain = ( url: string | null | undefined ) => string | null;

				/** The domain or the address of a page into the rule of the pages blocked while browsing (a new one first in the list); null for an address that is not http(s) (for "domain" also without a domain) */
				type addBlockedPage = ( rules: Types.DeclarativeNetRequest.RuleSetting[], url: string, scope: Types.DeclarativeNetRequest.BlockPageScope ) => Types.DeclarativeNetRequest.BlockedPageResult | null;

				namespace addBlockedPage {

					/** The new list with the changed (or new, first) rule, what went into it — added */
					type result = ( rule: Types.DeclarativeNetRequest.RuleSetting, target: string ) => Types.DeclarativeNetRequest.BlockedPageResult;

				}

				/** The domain of the page (the host without "www.") into the "Except" domains of the rule with the id; null without the rule or a domain of the address */
				type addExceptDomain = ( rules: Types.DeclarativeNetRequest.RuleSetting[], id: string, url: string ) => Types.DeclarativeNetRequest.ExceptDomainResult | null;

				/** Does the rule have somewhere to apply? */
				type ruleHasTargets = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => boolean;

				/** Enabled rules that edit something and have somewhere to apply, prepared for conversion */
				type compileRules = ( rules: Types.DeclarativeNetRequest.RuleSetting[], bookmarkUrls: Map<string, string[]>, extensionHost?: string | null ) => Types.DeclarativeNetRequest.CompiledRule[];

				/** Request types for the selected groups (only those the browser knows) */
				type resourceTypesFor = ( parts: Types.DeclarativeNetRequest.PartKey[], available: string[] ) => string[];

				/** The condition's domain list extended with others (without repetition) */
				type mergeDomains = ( current: string[] | undefined, extra: string[] ) => string[];

				/** A condition for an exact address */
				type exactCondition = ( url: string ) => chrome.declarativeNetRequest.RuleCondition;

				/** A condition for an exact address followed by a part after "#" (a document of a blocking rule) */
				type fragmentCondition = ( url: string ) => chrome.declarativeNetRequest.RuleCondition;

				/**
				 * Conditions for the address of a parameter rule (presences, filters: ends of the "the parameter is in the query" regular
				 * expressions and urlFilter conditions; budget goes down by cost browser rules per condition; paired: an edit with a
				 * related parameter — over the budget no condition)
				 */
				type paramsPageConditions = (
					url: string,
					presences: string[] | null,
					filters: string[] | null,
					budget: Types.DeclarativeNetRequest.PageBudget,
					cost: number,
					paired: boolean
				) => chrome.declarativeNetRequest.RuleCondition[];

				/** urlFilter conditions of a beginning of an address followed by the end of the address (withQuery: also by a query) */
				type wholeAddressFilters = ( base: string, withQuery: boolean ) => string[];

				/** The declarativeNetRequest rule action (modifyHeaders, redirect with queryTransform, or block) */
				type ruleAction = ( rule: Types.DeclarativeNetRequest.CompiledRule, redirect: Types.DeclarativeNetRequest.ParamRedirect | null ) => chrome.declarativeNetRequest.RuleAction;

				type protocolCondition = ( condition: chrome.declarativeNetRequest.RuleCondition, protocol: Types.DeclarativeNetRequest.Protocol ) => chrome.declarativeNetRequest.RuleCondition | null;

				/** The condition for the ws(s):// address of a WebSocket connection in Chrome (null: no other condition needed) */
				type webSocketCondition = ( condition: chrome.declarativeNetRequest.RuleCondition ) => chrome.declarativeNetRequest.RuleCondition | null;

				/** declarativeNetRequest rules (without ids) */
				type buildNetworkRules = ( compiled: Types.DeclarativeNetRequest.CompiledRule[], available: string[] ) => Types.NetworkRule[];

				namespace buildNetworkRules {

					/** Adds a rule with a condition and request types (nothing without types; add() additionally with the "Except" domains; anyHost: the condition does not fix the request host — with exceptPrivate per part of NOT_PRIVATE_HOST_PARTS) */
					type add = ( condition: chrome.declarativeNetRequest.RuleCondition, resourceTypes: string[], anyHost?: boolean ) => void;

				}

				/** How many declarativeNetRequest rules were made of each prepared rule (rule id → count, without the ones that made none) */
				type countNetworkRules = ( compiled: Types.DeclarativeNetRequest.CompiledRule[], networkRules: Types.NetworkRule[] ) => Map<string, number>;

				/** Why the rule needs regular expressions instead of urlFilter in the browser */
				type regexReasons = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.RegexReasons;

				/** Rules that target the page address */
				type matchUrl = ( compiled: Types.DeclarativeNetRequest.CompiledRule[], url: string | null | undefined ) => Types.DeclarativeNetRequest.MatchedRule[];

				/** The host of an http(s) or ws(s) address, otherwise null */
				type requestHost = ( url: string | null | undefined ) => string | null;

				/** The host of an initiator of any scheme (also chrome-extension://, moz-extension://), otherwise null */
				type initiatorHost = ( url: string | null | undefined ) => string | null;

				/** The blocking rule with the highest priority that targets a blocked request (available: the request types the browser knows), null = none */
				type matchBlockedRequest = ( compiled: Types.DeclarativeNetRequest.CompiledRule[], request: Types.DeclarativeNetRequest.BlockedRequest, available: string[] ) => Types.DeclarativeNetRequest.CompiledRule | null;

				/** Bookmark addresses in the nodes (also in subfolders) */
				type collectBookmarkUrls = ( nodes: chrome.bookmarks.BookmarkTreeNode[] ) => string[];

				namespace collectBookmarkUrls {

					/** Walks the node and its descendants */
					type walk = ( node: chrome.bookmarks.BookmarkTreeNode ) => void;

				}

				/** Folders of the bookmark tree with their path */
				type listBookmarkFolders = ( tree: chrome.bookmarks.BookmarkTreeNode[] ) => Types.DeclarativeNetRequest.BookmarkFolder[];

				namespace listBookmarkFolders {

					/** Adds a folder and its subfolders */
					type add = ( node: chrome.bookmarks.BookmarkTreeNode, title: string, path: string[] ) => void;

				}

			}

		}

	}

}

export { };
