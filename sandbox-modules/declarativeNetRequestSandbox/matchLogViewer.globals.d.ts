/**
 * @file sandbox-modules/declarativeNetRequestSandbox/matchLogViewer.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/matchLogViewer.mjs — the
 * listing of the own event log of declarativeNetRequest at the bottom of the overview: the entries with their details,
 * the search, the rule filter, deleting an entry and the whole log.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequestSandbox {

			/** What the listing of the log does with the background part of declarativeNetRequest and with its own state. */
			type MatchLogViewerOptions = {

				/** The log (declarativeNetRequest.getLog) */
				load: () => Promise<Types.DeclarativeNetRequest.LogView>;

				/** Deletes one entry (declarativeNetRequest.clearLog with { id }); null — the function is denied */
				remove: ( ( id: string ) => Promise<void> ) | null;

				/** Deletes the whole log (declarativeNetRequest.clearLog); null — the function is denied */
				clear: ( () => Promise<void> ) | null;

				/** The listener declarativeNetRequest.onChange is allowed (false — the listing has a "Refresh" button) */
				listening: boolean;

				/** Unfolded at first */
				open: boolean;

				/** The user unfolded or folded the listing */
				onToggle: ( open: boolean ) => void;
			};

			/** The listing of the log: its element, a load now, a load a moment later and cancelling its timers. */
			type MatchLogViewer = {
				root: HTMLDetailsElement;
				refresh(): Promise<void>;
				schedule(): void;
				dispose(): void;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequestSandbox {

			namespace MatchLogViewer {

				/** What the rule of an entry did (blocked the request, edited its headers or GET parameters) */
				type kindText = ( kind: Types.DeclarativeNetRequest.RuleKind ) => string;

				/** The date and the time of an entry with seconds */
				type formatFullTime = ( ms: number ) => string;

				/** A span with a class and a text */
				type span = ( className: string, text: string ) => HTMLSpanElement;

				/** A time element (datetime in ISO) with the text */
				type timeElement = ( ms: number, text: string ) => HTMLTimeElement;

				/** A button with a class and a text */
				type button = ( className: string, text: string ) => HTMLButtonElement;

				/** The listing of the own event log of declarativeNetRequest */
				type createMatchLogViewer = ( options: Types.DeclarativeNetRequestSandbox.MatchLogViewerOptions ) => Types.DeclarativeNetRequestSandbox.MatchLogViewer;

				namespace createMatchLogViewer {

					/** "Clear log" back to its first state (without the confirmation) */
					type resetClear = () => void;

					/** The rules of the entries in the filter */
					type fillRules = ( entries: Types.DeclarativeNetRequest.LogEntry[] ) => void;

					/** One entry of the listing */
					type createItem = ( entry: Types.DeclarativeNetRequest.LogEntry ) => HTMLLIElement;

					/** All an entry knows, with the button that deletes it */
					type createDetails = ( entry: Types.DeclarativeNetRequest.LogEntry ) => HTMLDivElement;

					/** The listing from the last load by the search, the filter and the pages */
					type render = () => void;

					/** Loads the log and renders it */
					type refresh = () => Promise<void>;

					/** A load a moment later (several changes = one) */
					type schedule = () => void;

					/** Cancels the timers */
					type dispose = () => void;

				}

			}

		}

	}

}

export { };
