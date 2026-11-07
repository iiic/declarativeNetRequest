/**
 * @file sidebar.globals.d.ts
 * @description Global TypeScript declarations for sidebar.mjs — the side panel controller (sidebar.html).
 */

declare global {

	namespace Classes {

		/** Side panel controller — renders modules with the "sidebar" output surface. */
		class SidebarController extends BaseController {

			/** Container for the module elements (#modules-output in sidebar.html) */
			outputEl: HTMLElement;

			constructor ();

			/** Renders the elements of modules that have "In the side panel" selected, or the notice when "Do not use the sidebar" is on */
			initPage(): Promise<void>;

			/** The notice instead of the modules: the panel is off in Settings, how to remove its icon in Firefox */
			_renderDisabledNotice(): void;

		}

	}

}

export { };
