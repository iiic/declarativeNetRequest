/**
 * @file sandbox-modules/declarativeNetRequestSandbox/suspensionsViewer.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/suspensionsViewer.mjs — the
 * overview of temporarily suspended rules in Settings with cancelling the suspensions.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequestSandbox {

			/** What the overview of the suspensions does with the user's click and when a suspension ends. */
			type SuspensionsViewerOptions = {

				/** Cancels the suspension of a rule — of the whole rule, with domain the one for the domain (declarativeNetRequest.restoreRule); null — the function is denied */
				restore: ( ( id: string, domain: string | null ) => Promise<void> ) | null;

				/** Has the editor load again (it gives the overview the suspensions) */
				reload: () => void;
			};

			/** The overview of the suspensions: its element and rendering the suspensions the editor loaded. */
			type SuspensionsViewer = {
				root: HTMLDivElement;
				render( items: Types.DeclarativeNetRequest.SuspensionItem[] ): void;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequestSandbox {

			namespace SuspensionsViewer {

				/** The overview of suspended rules (below the editor of the rules) */
				type createSuspensionsViewer = ( options: Types.DeclarativeNetRequestSandbox.SuspensionsViewerOptions ) => Types.DeclarativeNetRequestSandbox.SuspensionsViewer;

				namespace createSuspensionsViewer {

					/** Renders the suspensions and schedules a load when the earliest one ends */
					type render = ( items: Types.DeclarativeNetRequest.SuspensionItem[] ) => void;

					/** A row of one suspended rule with a cancel button */
					type createItem = ( suspension: Types.DeclarativeNetRequest.SuspensionItem ) => HTMLLIElement;

				}

			}

		}

	}

}

export { };
