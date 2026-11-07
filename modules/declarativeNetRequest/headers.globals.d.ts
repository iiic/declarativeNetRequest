/**
 * @file modules/declarativeNetRequest/headers.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/headers.mjs — common headers for
 * suggestions and checking how a header edit is written.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequest {

			/** Request headers (sent to the server), or response headers (received from it) */
			type Direction = 'request' | 'response';

			/** Remove, set a value, append a value */
			type Operation = 'remove' | 'set' | 'append';

			/** One header edit as it is stored (texts as the user wrote them). */
			type HeaderEdit = {
				direction: Direction;

				/** The header name */
				header: string;
				operation: Operation;

				/** The value (not used for removal) */
				value: string;
			};

			/**
			 * What is wrong with the edit: an invalid or missing name, a missing value, a line break in the value, the value
			 * cannot be appended to a request header.
			 */
			type HeaderProblem = 'name' | 'value' | 'valueChars' | 'append';

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Headers {

				/** An empty edit (remove a request header) */
				type emptyHeader = () => Types.DeclarativeNetRequest.HeaderEdit;

				/** An edit without both a name and a value (does not count) */
				type isBlankHeader = ( edit: Types.DeclarativeNetRequest.HeaderEdit ) => boolean;

				/** What is wrong with the edit, null = nothing */
				type headerProblem = ( edit: Types.DeclarativeNetRequest.HeaderEdit ) => Types.DeclarativeNetRequest.HeaderProblem | null;

				/** The edit for declarativeNetRequest (ModifyHeaderInfo) */
				type toHeaderInfo = ( edit: Types.DeclarativeNetRequest.HeaderEdit ) => chrome.declarativeNetRequest.ModifyHeaderInfo;

			}

		}

	}

}

export { };
