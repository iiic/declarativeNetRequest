/**
 * @file sandbox-modules/declarativeNetRequestSandbox/rulesEditor.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/rulesEditor.mjs — the editor of
 * header, GET parameter and blocking rules of declarativeNetRequest in Settings (the settings view of the module in the sandbox).
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequestSandbox {

			/** The row of one header edit in a rule card. */
			type HeaderEditorRow = {
				line: HTMLDivElement;
				directionSelect: HTMLSelectElement;
				headerInput: HTMLInputElement;
				operationSelect: HTMLSelectElement;
				valueInput: HTMLInputElement;
			};

			/** The row of one GET parameter edit in a rule card. */
			type ParamEditorRow = {
				line: HTMLDivElement;
				paramInput: HTMLInputElement;

				/** The name of the related parameter ("and at the same time"), null = a row without one */
				andInput: HTMLInputElement | null;
				operationSelect: HTMLSelectElement;
				valueInput: HTMLInputElement;
			};

			/** The "What to change" part of one rule kind. */
			type EditsPart = {
				part: HTMLDivElement;

				/** The container of edit rows */
				box: HTMLDivElement;

				/** The "+ Add …" button */
				addLine: HTMLButtonElement;

				/** The button for a row with a related parameter ("and at the same time"), null = the kind has none */
				addPair: HTMLButtonElement | null;
			};

			/** The card of one rule in the editor. */
			type RuleEditorRow = {

				/** The permanent rule id */
				id: string;
				card: HTMLFieldSetElement;

				/** Collapsible details below the header and their summary (kind and number of edits) */
				details: HTMLDetailsElement;
				detailsSummary: HTMLElement;
				enabledInput: HTMLInputElement;
				titleInput: HTMLInputElement;

				/** The color picker of the rule (between the title and ×) */
				colorInput: HTMLInputElement;

				/** Has the rule a color — a stored one, or the user picked one (otherwise the picker only shows a dimmed default) */
				colorChosen: boolean;

				/** The color of the current name (colorFromText(), "" without a name) — a rule with it follows a renaming */
				nameColor: string;

				/** "Notify …" by a notification */
				notifyMatchedInput: HTMLInputElement;

				/** Whether the notifications of the rule can come (below "Notify …") */
				notifyStatus: HTMLElement;

				/** "Notify …" into the own event log */
				logMatchedInput: HTMLInputElement;

				/** Whether the rule can write into the log (below "Notify …") */
				logStatus: HTMLElement;

				/** "List the rule in the overview": "Closed" */
				closedInOverviewInput: HTMLInputElement;

				/** Choosing the rule kind (headers / GET parameters / blocking / the upgrade to HTTPS) */
				kindSelect: HTMLSelectElement;
				protocolSelect: HTMLSelectElement;

				/** The label with the protocol choice — hidden for the upgrade to HTTPS (it targets only http://) */
				protocolField: HTMLElement;

				/** The form part with header edits and the container of its rows */
				headersPart: HTMLDivElement;
				headersBox: HTMLDivElement;
				headerRows: HeaderEditorRow[];

				/** The form part with GET parameter edits and the container of its rows */
				paramsPart: HTMLDivElement;
				paramsBox: HTMLDivElement;
				paramRows: ParamEditorRow[];

				/** An explanation for a blocking rule (instead of edit rows) */
				blockPart: HTMLElement;

				/** The explanation of the upgrade to HTTPS (the kind has no rows either) */
				upgradePart: HTMLElement;

				/** "Which requests" checkboxes by request group */
				partInputs: Record<Types.DeclarativeNetRequest.PartKey, HTMLInputElement>;

				/** The note below the checkboxes of a blocking rule: "Scripts" does not stop inline scripts, a CSP header rule does */
				scriptsNote: HTMLElement;
				domainsInput: HTMLTextAreaElement;
				pagesInput: HTMLTextAreaElement;

				/** The hint for addresses (by the rule kind) */
				pagesHint: HTMLElement;
				folderSelect: HTMLSelectElement;
				wholeDomainInput: HTMLInputElement;

				/** "Except" domains */
				exceptDomainsInput: HTMLTextAreaElement;
				exceptPrivateInput: HTMLInputElement;
				exceptExtensionInput: HTMLInputElement;

				/** Messages below the "What to do", "Which requests" and "Where" parts */
				whatMessage: HTMLElement;
				partsMessage: HTMLElement;
				whereMessage: HTMLElement;

				/** The warning that the rule needs regular expressions instead of urlFilter (regexNotes(), empty = hidden) */
				regexWarning: HTMLDivElement;

				/** "Show the rule in JSON" / "Hide JSON" and the part it shows: the notes and the read-only field with the JSON */
				jsonButton: HTMLButtonElement;
				jsonPanel: HTMLDivElement;
				jsonNotes: HTMLDivElement;
				jsonOutput: HTMLTextAreaElement;

				/** The folder and its name from the stored settings (when the bookmark tree does not have it) */
				storedFolderId: string;
				storedFolderTitle: string;
			};

			/** The permissions the editor misses: for the rules, for the bookmarks, for a checked notification and for a checked log (feedback — the browser reports the applied rules, otherwise only the blocked and redirected requests are followed). */
			type PermissionNeeds = {
				rules: boolean;
				bookmarks: boolean;
				notify: boolean;
				log: boolean;
				feedback: boolean;
			};

			/** What the editor does with the background part of declarativeNetRequest. */
			type RulesEditorOptions = {

				/** The rules with everything the editor needs (declarativeNetRequest.getRules) */
				load: () => Promise<Types.DeclarativeNetRequest.RulesView>;

				/** Stores the rules (declarativeNetRequest.setRules) — the stored rules back */
				save: ( rules: Types.DeclarativeNetRequest.RuleSetting[] ) => Promise<Types.DeclarativeNetRequest.SetRulesResult>;

				/**
				 * The addresses of the bookmarks in a folder, also in its subfolders (declarativeNetRequest.getFolderUrls; null — the folder
				 * cannot be read) for the JSON of a card with the folder; null — the function is denied
				 */
				folderUrls: ( ( folderId: string ) => Promise<string[] | null> ) | null;

				/** Opens the page where declarativeNetRequest asks for its permissions (declarativeNetRequest.openPermissions); null — the buttons of the core above the editor ask right here, or the function is denied */
				openPermissions: ( () => void ) | null;

				/** After every load (the overview of the suspensions gets them) */
				onView: ( view: Types.DeclarativeNetRequest.RulesView ) => void;

				/** After a change of the permissions missing for the state of the cards (the buttons of the core above the editor) */
				onPermissionNeeds: ( needs: Types.DeclarativeNetRequestSandbox.PermissionNeeds ) => void;

				/** After every check of the cards: whether they differ from the stored rules (setUnsavedChanges() of the element) */
				onUnsaved: ( unsaved: boolean ) => void;
			};

			/** The editor: its element, a change the listener declarativeNetRequest.onChange reported, and storing the cards. */
			type RulesEditor = {
				root: HTMLDivElement;
				onChange( change: Enums.DeclarativeNetRequestSandbox.Change ): void;

				/** "Save module settings": stores the cards (rejects with the reason, which also stays below the cards) */
				save(): Promise<void>;
			};

			/**
			 * declarativeNetRequest rules of the stored rules in the browser (rule id → count), of them with a regular expression (only
			 * the rules that have some) and the rules suspended right now.
			 */
			type BrowserCounts = {
				counts: Record<string, number>;
				regexCounts: Record<string, number>;

				/** Rules left out because the browser cannot compile their regular expression (rule id → count) */
				unsupportedCounts: Record<string, number>;
				suspended: string[];
			};

			/**
			 * What the editor has of the bookmarks of a folder for the JSON of a card: they are being loaded, the addresses, or why
			 * the listing has none of them — the function declarativeNetRequest.getFolderUrls is denied, the permission to bookmarks is
			 * missing, the folder cannot be read (deleted), the call failed.
			 */
			type FolderBookmarks =
				| { state: "loading" }
				| { state: "loaded"; urls: string[] }
				| { state: "denied" }
				| { state: "permission" }
				| { state: "missing" }
				| { state: "failed"; error: string };

			/** What a card says about the comments of a field (commentProblems()). */
			type CommentProblems = {

				/** A comment without the closing characters — the rest of the field is ignored */
				unclosed: boolean;

				/** The lines (without their comments) where an opening right after other text is followed by a closing with a space between them — not a comment in an address or a value */
				glued: string[];
			};

			/** One declarativeNetRequest rule in the notation of the static rules of manifest.json ("Show the rule in JSON"). */
			type ManifestRule = {

				/** From 1 in the order of the listing */
				id: number;
				priority: number;
				action: chrome.declarativeNetRequest.RuleAction;
				condition: chrome.declarativeNetRequest.RuleCondition;
			};

		}

	}

	namespace Functions {

		namespace DeclarativeNetRequestSandbox {

			namespace RulesEditor {

				/** What the card says about the comments of a field (separated: the addresses and the values) */
				type commentProblems = ( value: string, separated: boolean ) => Types.DeclarativeNetRequestSandbox.CommentProblems;

				/** Items of the domain list that are not a domain */
				type invalidDomains = ( value: string ) => string[];

				/** A rule without content (skipped when saving) */
				type isEmptyRule = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => boolean;

				/** The rule as it is saved (only the edits of its kind, without empty rows) */
				type savedRule = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => Types.DeclarativeNetRequest.RuleSetting;

				/** The content of a rule for comparing (JSON, without the folder name) */
				type ruleContent = ( rule: Types.DeclarativeNetRequest.RuleSetting ) => string;

				/** The declarativeNetRequest rules of one rule as static rules of manifest.json (ids from 1, the priority of the rule alone; turned off as if on) — available: the request types the browser knows, folderUrls: the bookmarks of its folder (null — nothing from the folder) */
				type manifestRules = ( rule: Types.DeclarativeNetRequest.RuleSetting, available: string[], folderUrls?: string[] | null, extensionHost?: string | null ) => Types.DeclarativeNetRequestSandbox.ManifestRule[];

				/** The notes of the JSON of a card with a bookmark folder by what the editor has of its bookmarks */
				type folderNotes = ( rule: Types.DeclarativeNetRequest.RuleSetting, bookmarks: Types.DeclarativeNetRequestSandbox.FolderBookmarks ) => string[];

				/** The lines of the warning that the rule needs regular expressions instead of urlFilter (how many and why; empty = none) — available: the request types the browser knows */
				type regexNotes = ( rule: Types.DeclarativeNetRequest.RuleSetting, available: string[] ) => string[];

				/** The text of an error for the user */
				type errorText = ( err: unknown ) => string;

				/** Whether the notifications of a rule of the kind can come (the line below "Notify …") */
				type notifyText = ( view: Types.DeclarativeNetRequest.RulesView, kind: Types.DeclarativeNetRequest.RuleKind ) => string;

				/** Whether a rule of the kind can write into the own event log (the line below "Notify …") */
				type logText = ( view: Types.DeclarativeNetRequest.RulesView, kind: Types.DeclarativeNetRequest.RuleKind ) => string;

				/** Whether a permission a button can ask for is what the notifications of a rule of the kind miss */
				type notifyAsks = ( view: Types.DeclarativeNetRequest.RulesView, kind: Types.DeclarativeNetRequest.RuleKind ) => boolean;

				/** Whether a permission a button can ask for is what the log of a rule of the kind misses */
				type logAsks = ( view: Types.DeclarativeNetRequest.RulesView, kind: Types.DeclarativeNetRequest.RuleKind ) => boolean;

				/** What is missing according to the answer of the background part and the checked options of the cards */
				type permissionNeeds = ( current: Types.DeclarativeNetRequest.RulesView ) => Types.DeclarativeNetRequestSandbox.PermissionNeeds;

				/** Passes on a change of what is missing */
				type refreshPermissionNeeds = ( current: Types.DeclarativeNetRequest.RulesView ) => void;

				/** How the stored rules turned out in the browser (the line at the top) */
				type statusText = ( status: Types.NetworkRulesStatus ) => { text: string; problem: boolean };

				/** A label with text, an optional hint and a field */
				type labeled = ( text: string, control: HTMLElement, hint?: string ) => HTMLLabelElement;

				/** A multi-line field */
				type textarea = ( value: string, placeholder: string ) => HTMLTextAreaElement;

				/** A card part with a heading and an optional hint */
				type section = ( className: string, title: string, hint?: string ) => HTMLDivElement;

				/** A place for messages */
				type message = () => HTMLDivElement;

				/** A selection from values with labels */
				type select = <V extends string>( values: readonly V[], labels: Record<V, string>, value: V, ariaLabel: string ) => HTMLSelectElement;

				/** A list of headers or parameters for suggestions */
				type datalist = ( id: string, names: string[] ) => HTMLDataListElement;

				/** The × button with a label */
				type removeButton = ( label: string ) => HTMLButtonElement;

				/** The × of a rule removes it only after a second click (the first one asks "Really?") */
				type requireSecondClick = ( button: HTMLButtonElement, onConfirm: () => void ) => void;

				/** A text field of an edit row */
				type textInput = ( className: string, value: string, placeholder: string, ariaLabel: string ) => HTMLInputElement;

				/** The editor of the rules */
				type createRulesEditor = ( options: Types.DeclarativeNetRequestSandbox.RulesEditorOptions ) => Types.DeclarativeNetRequestSandbox.RulesEditor;

				/** The lines below "Notify …" of a card (the notification, the log) */
				type refreshNotifyStatus = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => void;

				/** The row's folder name (from the tree, otherwise the stored one) */
				type folderTitleOf = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => string;

				/** A header edit from a row */
				type readHeader = ( row: Types.DeclarativeNetRequestSandbox.HeaderEditorRow ) => Types.DeclarativeNetRequest.HeaderEdit;

				/** A GET parameter edit from a row */
				type readParam = ( row: Types.DeclarativeNetRequestSandbox.ParamEditorRow ) => Types.DeclarativeNetRequest.ParamEdit;

				/** The rule of a card */
				type readRow = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => Types.DeclarativeNetRequest.RuleSetting;

				/** The rules of the cards as they are saved */
				type getValue = () => Types.DeclarativeNetRequest.RuleSetting[];

				/** The card's folder menu */
				type fillFolders = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => void;

				/** Checking how one card is written */
				type validateRow = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => void;

				/** The bookmarks of a folder for the JSON of a card — the first time loaded (the cards render again with them) */
				type bookmarksOf = ( folderId: string ) => Types.DeclarativeNetRequestSandbox.FolderBookmarks;

				namespace bookmarksOf {

					/** The answer of the background part — the addresses, or the folder cannot be read */
					type loaded = ( urls: string[] | null ) => Types.DeclarativeNetRequestSandbox.FolderBookmarks;

					/** The call failed */
					type failed = ( err: unknown ) => Types.DeclarativeNetRequestSandbox.FolderBookmarks;

				}

				/** The JSON of a shown card with the notes above it */
				type renderJson = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow, rule: Types.DeclarativeNetRequest.RuleSetting ) => void;

				/** The request types of this browser for the conversion of a card (from the background part, otherwise the common ones) */
				type availableTypes = () => string[];

				/** Lines of text as the children of a box (only when they changed) */
				type renderLines = ( box: HTMLElement, lines: string[] ) => void;

				/** How many declarativeNetRequest rules the stored rule of the card makes in the browser (empty = not known, a card not stored yet) */
				type browserText = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow, rule: Types.DeclarativeNetRequest.RuleSetting ) => string;

				/** How many declarativeNetRequest rules of the stored rule of the card were left out (the browser cannot compile their regular expression), 0 = none or not known */
				type unsupportedCount = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => number;

				/** Checking all cards and whether they differ from the stored rules */
				type refresh = () => void;

				/** Adds a header edit row to a card */
				type addHeaderRow = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow, edit: Types.DeclarativeNetRequest.HeaderEdit ) => Types.DeclarativeNetRequestSandbox.HeaderEditorRow;

				/** Adds a GET parameter edit row to a card */
				type addParamRow = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow, edit: Types.DeclarativeNetRequest.ParamEdit ) => Types.DeclarativeNetRequestSandbox.ParamEditorRow;

				/** The "What to change" part of one kind: hint, rows, button (pairText: a second one for a row with a related parameter) */
				type editsPart = ( hintText: string, addText: string, pairText?: string ) => Types.DeclarativeNetRequestSandbox.EditsPart;

				namespace editsPart {

					/** A "+ Add …" button */
					type button = ( label: string ) => HTMLButtonElement;

				}

				/** Adds a rule card */
				type addRow = ( rule: Types.DeclarativeNetRequest.RuleSetting, open?: boolean ) => Types.DeclarativeNetRequestSandbox.RuleEditorRow;

				namespace addRow {

					/** A checkbox of a setting of the rule ("Notify …", "List the rule in the overview") with its label */
					type settingOption = ( checked: boolean, text: string ) => { label: HTMLLabelElement; input: HTMLInputElement };

					/** A setting of the rule: the group with the heading and below it the labels of its checkboxes */
					type settingGroup = ( heading: string, ...options: HTMLLabelElement[] ) => HTMLDivElement;

				}

				/** Removes a rule card */
				type removeRow = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => void;

				/** Moves a card before another one (the list and the DOM) */
				type moveRowBefore = ( row: Types.DeclarativeNetRequestSandbox.RuleEditorRow, before: Types.DeclarativeNetRequestSandbox.RuleEditorRow ) => void;

				/** The stored rules the cards are compared with from now on */
				type setStored = ( stored: Types.DeclarativeNetRequest.RuleSetting[] ) => void;

				/** Takes over the rules stored elsewhere into the cards the user has not changed */
				type takeOver = ( stored: Types.DeclarativeNetRequest.RuleSetting[] ) => void;

				/** The notice at the top: the missing permissions and the state of the rules in the browser */
				type renderNotice = ( view: Types.DeclarativeNetRequest.RulesView ) => void;

				namespace renderNotice {

					/** A notice line (its element) */
					type line = ( text: string, problem?: boolean ) => HTMLDivElement;

					/** A notice line about a missing permission with the button that opens the page where declarativeNetRequest asks for it */
					type missing = ( text: string ) => void;

				}

				/** Loads the rules with what the editor needs and takes them over */
				type refreshView = () => Promise<void>;

				/** A change the listener reported — a load a moment later */
				type onChange = ( change: Enums.DeclarativeNetRequestSandbox.Change ) => void;

				/** Stores the cards ("Save module settings" — saveSettings() of the element) */
				type saveRules = () => Promise<void>;

			}

		}

	}

}

export { };
