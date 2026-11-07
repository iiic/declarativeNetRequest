/**
 * @file modules/declarativeNetRequest/params.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/params.mjs — common GET parameters for
 * suggestions, checking how a parameter edit is written and converting to declarativeNetRequest queryTransform.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** Remove the parameter, set a value (overwrites, or adds) */
			type ParamOperation = 'remove' | 'set';

			/** One GET parameter edit as it is stored (texts as the user wrote them). */
			type ParamEdit = {

				/** The parameter name */
				param: string;
				operation: ParamOperation;

				/** The value (not used for removal) */
				value: string;

				/**
				 * The related parameter ("and at the same time"): the operation (and the value) applies to both names, and only to an
				 * address whose query contains both; missing = an edit without one, "" = not filled in yet
				 */
				andParam?: string;
			};

			/** What is wrong with a parameter edit: the name is missing, the related parameter is missing, or it has the same name. */
			type ParamProblem = 'name' | 'andName' | 'sameName';

			/** One redirect of a parameter rule (paramRedirects()). */
			type ParamRedirect = {

				/** The action: the edits without a related parameter, for an edit with one also its two names */
				transform: chrome.declarativeNetRequest.QueryTransform;

				/** The edits whose parameters the condition looks for in the address */
				condition: ParamEdit[];

				/** Ends of the "the parameters are in the query" regular expressions, null = the redirect targets every address */
				presences: string[] | null;

				/** The same condition as urlFilter ends, null = every address, or urlFilter cannot write some name */
				filters: string[] | null;

				/** An edit with a related parameter: the condition must hold for every address (over the budget none, not any query) */
				paired: boolean;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Params {

				/** An empty edit (remove a parameter; paired: with an empty related parameter) */
				type emptyParam = ( paired?: boolean ) => Types.DeclarativeNetRequest.ParamEdit;

				/** Does the edit have a related parameter ("and at the same time")? */
				type isPairedParam = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => boolean;

				/** The names of the edit without surrounding whitespace (with a related parameter both) */
				type paramKeys = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => string[];

				/** An edit without names and a value (does not count) */
				type isBlankParam = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => boolean;

				/** What is wrong with the edit, null = nothing */
				type paramProblem = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => Types.DeclarativeNetRequest.ParamProblem | null;

				/** The edits for declarativeNetRequest (QueryTransform) */
				type toQueryTransform = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => chrome.declarativeNetRequest.QueryTransform;

				/** Text as a regular expression that matches only it */
				type escapeRegex = ( text: string ) => string;

				/** A character of a parameter name as %XX of UTF-8 */
				type percentEncoded = ( char: string ) => string;

				/** A parameter name as a regular expression for its form in the address */
				type keyPattern = ( key: string ) => string;

				/** A parameter name for urlFilter in its form in the address, null = urlFilter cannot write it (* ! ~ ' ( )) */
				type keyFilter = ( key: string ) => string | null;

				/** Ends of the "the parameter is in the query" regular expressions (by parameter groups), null = the rule targets every address */
				type presenceSources = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => string[] | null;

				/** Ends of the "the parameter is in the query" urlFilter conditions (two per parameter), null = the rule targets every address, or urlFilter cannot write some name */
				type presenceFilters = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => string[] | null;

				/** Names of the parameters urlFilter cannot write (without repetition) */
				type regexParamNames = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => string[];

				/** The ends of the "the query contains both parameters of the edit" regular expressions (one per order of the names) */
				type pairSources = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => string[];

				/** The same condition as urlFilter ends (four), null = urlFilter cannot write one of the names */
				type pairFilters = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => string[] | null;

				/** The redirects of a parameter rule: the edits without a related parameter together, every edit with one on its own */
				type paramRedirects = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => Types.DeclarativeNetRequest.ParamRedirect[];

				/** Can a redirect of the rule that sets a value and changes nothing stop another one of it? */
				type paramsShadowed = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => boolean;

			}

		}

	}

}

export { };
