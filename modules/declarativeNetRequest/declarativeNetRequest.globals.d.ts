/**
 * @file modules/declarativeNetRequest/declarativeNetRequest.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/declarativeNetRequest.mjs — the permissions
 * of the rules (HEADERS_PERMISSIONS, the bookmarks, the notifications) with the buttons that ask for them and the state of
 * the rules in the browser; the overview of the rules for the page and their editor are declarativeNetRequestSandbox.
 */

declare global {

	interface HTMLElementTagNameMap {
		'extension-declarative-net-request': Classes.ExtensionDeclarativeNetRequest;
	}

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Element {

				/** Does the background part follow only the requests an extension blocked (no onRuleMatchedDebug)? */
				type followsBlockedRequests = () => boolean;

			}

		}

	}

	namespace Classes {

		/** The declarativeNetRequest module element. */
		class ExtensionDeclarativeNetRequest extends BaseElement {

			/** Unsubscribing the activation and permission listeners (in disconnectedCallback()) */
			_unsubscribers?: Array<() => void>;

			/** Sequence of the last _render() call — an older concurrent render is discarded */
			_renderGeneration?: number;

			/** A scheduled render (several triggers = one) */
			_renderTimer?: ReturnType<typeof setTimeout> | null;

			static override get observedAttributes(): string[];
			override connectedCallback(): void;
			override disconnectedCallback(): void;
			override connectedMoveCallback(): void;
			override adoptedCallback(): void;
			override attributeChangedCallback( name: string, oldValue: string | null, newValue: string | null ): void;
			override init( options: Types.ModuleInitOptions ): Promise<void>;

			/** Re-renders the output a moment later (several triggers = one render) */
			_scheduleRender(): void;

			/** The intro, the permissions with their buttons and the state of the rules in the browser */
			_render(): Promise<void>;

			/** How the stored rules turned out in the browser */
			_statusLine(): Promise<HTMLDivElement>;

			/** Whether the rules with notifications can announce themselves, with a button for what is missing (null — no such rule) */
			_notifyLine( rules: Types.DeclarativeNetRequest.RuleSetting[] ): Promise<HTMLDivElement | null>;

			/** Whether the rules with the own event log can write into it, with a button for the missing permission (null — no such rule) */
			_logLine( rules: Types.DeclarativeNetRequest.RuleSetting[] ): Promise<HTMLDivElement | null>;

			/** A line of the status with an optional button (only text in the floating window) */
			_line( text: string, problem: boolean, button?: HTMLButtonElement ): HTMLDivElement;

			/** A permission request button */
			_permissionButton( text: string, permissions: Types.PermissionSet ): HTMLButtonElement;

			/** The "Edit rules" button (the Settings page) */
			_settingsButton(): HTMLButtonElement;

		}

		namespace ExtensionDeclarativeNetRequest {

			/** Instance properties (without methods); the base of the class is cast to them in JS — see Types.WithFields */
			type Fields = Pick<ExtensionDeclarativeNetRequest, '_unsubscribers' | '_renderGeneration' | '_renderTimer'>;

		}

	}

}

export { };
