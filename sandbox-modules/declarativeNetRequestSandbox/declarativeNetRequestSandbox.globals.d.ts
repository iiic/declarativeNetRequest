/**
 * @file sandbox-modules/declarativeNetRequestSandbox/declarativeNetRequestSandbox.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/declarativeNetRequestSandbox.mjs —
 * the overview of the rules of declarativeNetRequest that target the page of the active tab (with suspending a rule
 * temporarily) with the listing of its own event log below it and in Settings the editor of the rules, as an uploaded package the extension brings: the background part of
 * declarativeNetRequest does the work for it, through functions outside the sandbox (its services).
 */

declare global {

	interface HTMLElementTagNameMap {
		'extension-declarative-net-request-sandbox': Classes.ExtensionDeclarativeNetRequestSandbox;
	}

	namespace Enums {

		namespace DeclarativeNetRequestSandbox {

			/**
			 * What the listener declarativeNetRequest.onChange reports: the settings of declarativeNetRequest (the rules, its
			 * mode), its suspensions, its own event log, the module list or the permissions, the bookmarks.
			 */
			type Change = 'settings' | 'suspensions' | 'log' | 'status' | 'bookmarks';

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequestSandbox {

			namespace Element {

				/** this.api of the element as the api of an uploaded module */
				type sandboxApi = ( element: Classes.BaseElement ) => Types.SandboxModuleApi;

				/** The text of an error for the user */
				type errorText = ( err: unknown ) => string;

				/** A header edit for the output */
				type formatEdit = ( edit: Types.DeclarativeNetRequest.HeaderEdit ) => string;

				/** A GET parameter edit for the output */
				type formatParamEdit = ( edit: Types.DeclarativeNetRequest.ParamEdit ) => string;

				/** The lines of a rule's edits — the edits with the same group key (null = not grouped) in one line in place of the first of them */
				type groupEdits = <T>( edits: T[], groupKey: ( edit: T ) => string | null, formatOne: ( edit: T ) => string, formatGroup: ( group: T[] ) => string ) => string[];

				/** The header edits of a rule for the output — the removals in the same direction in one line */
				type formatEdits = ( edits: Types.DeclarativeNetRequest.HeaderEdit[] ) => string[];

				/** The GET parameter edits of a rule for the output — the removals in one line */
				type formatParamEdits = ( edits: Types.DeclarativeNetRequest.ParamEdit[] ) => string[];

				/** What the overview says after a page was blocked: the text, and whether it is a problem (the browser does not block it) */
				type blockNotice = ( response: Types.DeclarativeNetRequest.BlockPageResponse ) => { text: string; problem: boolean };

				/** What the overview says after the domain of the page went into the "Except" domains of a rule (never a problem) */
				type exceptNotice = ( response: Types.DeclarativeNetRequest.ExceptDomainResponse ) => { text: string; problem: boolean };

			}

		}

	}

	namespace Types {

		namespace DeclarativeNetRequestSandbox {

			/** What the last block of a page did (declarativeNetRequest.blockPage, also an exception — addExceptDomain) — shown only for that page (url: pageKey()). */
			type BlockNotice = { url: string; text: string; problem: boolean };

		}

	}

	namespace Classes {

		/**
		 * The overview and the editor in the sandbox. Type checking sees BaseElement of sdk.mjs (the module imports
		 * "../../sdk.mjs"); in the sandbox it is the BaseElement of the sandbox SDK.
		 */
		class ExtensionDeclarativeNetRequestSandbox extends BaseElement {

			/** The states of the declared functions (capabilities.state()) */
			_states: Record<string, Enums.SandboxCapabilityState>;

			/** Subscribed to the listener declarativeNetRequest.onChange (once — while denied the core delivers no events) */
			_listening: boolean;

			/** Unsubscribing the listeners (in disconnectedCallback()) */
			_unsubscribers?: Array<() => void>;

			/** A scheduled render (several triggers = one) */
			_renderTimer?: ReturnType<typeof setTimeout> | null;

			/** A re-render when the earliest listed suspension ends */
			_expiryTimer?: ReturnType<typeof setTimeout> | null;

			/** Sequence of the last _render() call — an older concurrent render is discarded */
			_renderGeneration?: number;

			/** Why the last action failed (empty = it did not) */
			_result: string;

			/** What the last block of a page did (null — nothing blocked yet) */
			_notice: Types.DeclarativeNetRequestSandbox.BlockNotice | null;

			/** The editor of the rules in Settings (null elsewhere, or while it may not be used) */
			_editor: Types.DeclarativeNetRequestSandbox.RulesEditor | null;

			/** The overview of the suspended rules in Settings (null elsewhere) */
			_suspensions: Types.DeclarativeNetRequestSandbox.SuspensionsViewer | null;

			/** The rules the user folded or unfolded differently from their setting (id → open) — they stay so after a re-render */
			_openRules: Map<string, boolean>;

			/** The overview of the page above the listing of the log (outside Settings) */
			_overview: HTMLDivElement;

			/** The listing of the own event log below the overview (null in Settings, or while declarativeNetRequest.getLog is denied) */
			_log: Types.DeclarativeNetRequestSandbox.MatchLogViewer | null;

			/** The listing of the log unfolded (api.state) */
			_logOpen: boolean;

			static override get observedAttributes(): string[];
			override connectedCallback(): void;
			override disconnectedCallback(): void;
			override connectedMoveCallback(): void;
			override adoptedCallback(): void;
			override attributeChangedCallback( name: string, oldValue: string | null, newValue: string | null ): void;
			override init( options: Types.ModuleInitOptions ): Promise<void>;

			/** Subscribes the listener (once) and renders the overview or the editor */
			_start(): Promise<void>;

			/** Did the user allow the function? */
			_allowed( capability: string ): boolean;

			/** A change from the listener declarativeNetRequest.onChange */
			_onChange( change: Enums.DeclarativeNetRequestSandbox.Change ): void;

			/** Re-renders the overview a moment later (several triggers = one render) */
			_scheduleRender(): void;

			/** Re-renders the overview right away (after the user's own action), without a planned render */
			_renderNow(): Promise<void>;

			/** Settings: the editor of the rules and the overview of the suspensions */
			_mountSettings(): void;

			/** "Save module settings" in Settings: stores the cards of the editor (declarativeNetRequest.setRules) */
			override saveSettings(): Promise<void>;

			/** The overview of the page and the listing of the log below it (created again after a change of the functions) */
			_mountLog(): void;

			/** The content of the overview above the listing of the log */
			_show( ...nodes: Array<Node | string> ): void;

			/** The overview for the active tab, or why there is none */
			_render(): Promise<void>;

			/** Rules for the page, the state in the browser and buttons */
			_renderStatus( prefix: string, tab: Types.ActiveTabInfo, response: Types.DeclarativeNetRequest.StatusResponse ): void;

			/**
			 * The row of one rule (a SuspendedRule — suspended, as a whole or for a domain) — details whose summary (title, scope)
			 * stays visible, the edits and the buttons fold away (it starts by closedInOverview); pageDomain: the domain of the page a rule can be suspended for
			 * and get as an exception (null — none); tab: the page of the overview (the exception takes its address)
			 */
			_createRuleItem( rule: Types.DeclarativeNetRequest.MatchedRule | Types.DeclarativeNetRequest.SuspendedRule, pageDomain: string | null, tab: Types.ActiveTabInfo ): HTMLLIElement;

			/**
			 * The buttons of a rule: "Suspend rule temporarily" and "… for <domain>" (pageDomain), for a rule suspended for a domain
			 * "Suspend rule temporarily" and "Restore rule for <domain>", for a rule suspended as a whole "Restore rule" — without the denied functions
			 */
			_suspendButtons( rule: Types.DeclarativeNetRequest.MatchedRule | Types.DeclarativeNetRequest.SuspendedRule, pageDomain: string | null ): HTMLButtonElement[];

			/** A button that suspends or restores a rule (capability with its options; forDomain — the button for a domain, outlined); null — the function is denied */
			_suspendButton( capability: string, options: { id: string; domain?: string }, label: string, title: string, forDomain: boolean ): HTMLButtonElement | null;

			/** "Add <domain> to the exceptions list" of a rule (the domain of the page into its "Except" domains) — null without a domain or while declarativeNetRequest.addExceptDomain is denied */
			_exceptButton( rule: Types.DeclarativeNetRequest.MatchedRule | Types.DeclarativeNetRequest.SuspendedRule, pageDomain: string | null, tab: Types.ActiveTabInfo ): HTMLButtonElement | null;

			/** "Block the domain …" and "Block this address" for the page of the tab — none while declarativeNetRequest.blockPage is denied */
			_blockButtons( tab: Types.ActiveTabInfo ): HTMLButtonElement[];

			/** The domain or the address of the page into the rule of the pages blocked while browsing (the buttons disabled meanwhile) */
			_blockPage( tab: Types.ActiveTabInfo, scope: Types.DeclarativeNetRequest.BlockPageScope, buttons: HTMLButtonElement[] ): Promise<void>;

			/** Schedules a re-render when the earliest of the suspensions ends */
			_scheduleExpiryRender( suspended: Types.DeclarativeNetRequest.SuspendedRule[] ): void;

			/** The "Edit rules" button (Settings at the module's block in Custom module settings) — none while options.open is denied */
			_settingsButtons(): HTMLButtonElement[];

			/** A message about a missing permission with the button that opens the page where declarativeNetRequest asks for it */
			_renderMissingPermission( prefix: string ): void;

			/** Opens the page where declarativeNetRequest asks for its permissions (declarativeNetRequest.openPermissions) */
			_openPermissions(): void;

			/** The buttons of the core above the editor for the missing permissions (declarativeNetRequest.requestPermission); null — none */
			_setPermissionButtons( needs: Types.DeclarativeNetRequestSandbox.PermissionNeeds | null ): void;

			/** Opens Settings (options.open) — with hash a new tab at options.html#<hash>, its section open */
			_openOptions( hash?: string ): void;

			/** A status line (a problem in red) */
			_status( text: string, problem: boolean ): HTMLDivElement;

			/** A button */
			_button( label: string, onClick: () => void ): HTMLButtonElement;

		}

		namespace ExtensionDeclarativeNetRequestSandbox {

			/** Instance properties (without methods); the base of the class is cast to them in JS — see Types.WithFields */
			type Fields = Pick<
				ExtensionDeclarativeNetRequestSandbox,
				'_states' | '_listening' | '_unsubscribers' | '_renderTimer' | '_expiryTimer' | '_renderGeneration' | '_result' | '_notice' | '_editor' | '_suspensions' | '_openRules' | '_overview' | '_log' | '_logOpen'
			>;

		}

	}

}

export { };
