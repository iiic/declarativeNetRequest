//@ts-check
"use strict";

// modules/declarativeNetRequest/module.mjs
// The module description without DOM (see halloWorld/module.mjs) — shared by the element
// and the background part.
import { getTagName, NOT_DISABLED_SPEC, BOOKMARKS_PERMISSIONS, WEBREQUEST_PERMISSIONS, t } from "../../sdk.mjs";
import { HEADERS_PERMISSIONS, NOTIFICATION_PERMISSIONS, MATCHED_RULES_PERMISSIONS } from "./permissions.mjs";

export const MODULE_NAME = "declarativeNetRequest";
export const TAG = getTagName( MODULE_NAME ); // "extension-declarative-net-request"
export const DESCRIPTION = t( "declarativeNetRequest_description" );

// Headers and GET parameters are edited (and requests blocked) by the browser itself according to
// declarativeNetRequest rules that the background part passes to the core
// (api.networkRules) — in any enabled mode, like the rules of
// customSearch; the core removes the rules of a turned-off module from the browser. The element shows only
// the permissions with the buttons and how the rules turned out in the browser — it does not depend on the active tab.
export const ACTIVATION_SPEC = NOT_DISABLED_SPEC;
/** @type {Types.ModuleDescriptor['DEFAULT_ACTIVATION_MODE']} */
export const DEFAULT_ACTIVATION_MODE = "background";
// The element only asks for the permissions — that belongs to Settings, next to the editor of the rules. The overview
// of the rules for the page of the active tab (declarativeNetRequestSandbox) is in the popup.
/** @type {Types.ModuleDescriptor['DEFAULT_DISPLAY_LOCATION']} */
export const DEFAULT_DISPLAY_LOCATION = "options";
// A short status (a few lines, buttons for missing permissions), it should be visible whole right
// away — a block element. No heading, the output starts with the module name.
/** @type {Types.ModuleDescriptor['DEFAULT_OUTPUT_ELEMENT']} */
export const DEFAULT_OUTPUT_ELEMENT = "block";
/** @type {Types.ModuleDescriptor['DEFAULT_SHOW_HEADING']} */
export const DEFAULT_SHOW_HEADING = false;

// The rules are edited by the element of declarativeNetRequestSandbox in its settings block (registerModule({ settingsEditedBy }))
// — the reset of that block in Settings also puts the rules back to the defaults (DEFAULT_RULES of rules.mjs).
/** @type {Types.ModuleDescriptor['SETTINGS_EDITED_BY']} */
export const SETTINGS_EDITED_BY = "declarativeNetRequestSandbox";

// The look of the element (the core attaches the file to the element's surfaces).
/** @type {string[]} */
export const STYLES = [ new URL( "./declarativeNetRequest.css", import.meta.url ).href ];

// Header and parameter edits (HEADERS_PERMISSIONS), bookmarks for rules
// with a bookmark folder and notifications about applied rules (from declarativeNetRequestFeedback, without it
// blocked requests from webRequest).
/** @type {Types.PermissionSet[]} */
export const USES_PERMISSIONS = [ HEADERS_PERMISSIONS, BOOKMARKS_PERMISSIONS, NOTIFICATION_PERMISSIONS, MATCHED_RULES_PERMISSIONS, WEBREQUEST_PERMISSIONS ];

// The own settings key with the rules (an array of Types.DeclarativeNetRequest.RuleSetting;
// the default DEFAULT_RULES from rules.mjs). No settingsSchema field — the editor is the settings view of
// declarativeNetRequestSandbox (SETTINGS_EDITED_BY), which stores them through SET_RULES_SERVICE.
export const RULES_KEY = "rules";

// Element → background part: converts the stored rules into the browser (only when they changed) and returns how they
// turned out, and the rules that target the url address (response Types.DeclarativeNetRequest.StatusResponse).
export const STATUS_MESSAGE = "DECLARATIVE_NET_REQUEST_STATUS";

// The services of the background part (api.services, background-script.mjs) — the functions of the catalog of
// uploaded modules declarativeNetRequestSandbox asks for: the rules for the page of the active tab and how they turned
// out in the browser, the rules with what their editor needs (the bookmark folders, the permissions, the
// suspensions), the addresses of the bookmarks in a folder (the JSON of a rule with a folder in the editor), storing the edited rules, suspending a rule temporarily and restoring it, reloading the page of the
// active tab, blocking the domain or the address of the page of the active tab (the rule PAGE_BLOCK_RULE_ID of rules.mjs),
// adding the domain of that page to the "Except" domains of a rule (addExceptDomain() of rules.mjs), the own log of the applied rules (matchLog.mjs) with deleting its entries and opening the page where the
// element of this module asks for the permissions (OPEN_PERMISSIONS_SERVICE — a module in the sandbox cannot ask, and for a service provider that page is in this extension). The listener of the changes
// (CHANGES_SERVICE) follows the events of the page itself on a page of this extension (base.mjs); for a service provider showing the module the background part feeds it (api.services.changed()).
export const STATUS_SERVICE = "declarativeNetRequest.getStatus";
export const GET_RULES_SERVICE = "declarativeNetRequest.getRules";
export const FOLDER_URLS_SERVICE = "declarativeNetRequest.getFolderUrls";
export const SET_RULES_SERVICE = "declarativeNetRequest.setRules";
export const SUSPEND_SERVICE = "declarativeNetRequest.suspendRule";
export const RESTORE_SERVICE = "declarativeNetRequest.restoreRule";
export const RELOAD_SERVICE = "declarativeNetRequest.reloadTab";
export const BLOCK_PAGE_SERVICE = "declarativeNetRequest.blockPage";
export const EXCEPT_DOMAIN_SERVICE = "declarativeNetRequest.addExceptDomain";
export const GET_LOG_SERVICE = "declarativeNetRequest.getLog";
export const CLEAR_LOG_SERVICE = "declarativeNetRequest.clearLog";
export const OPEN_PERMISSIONS_SERVICE = "declarativeNetRequest.openPermissions";
export const CHANGES_SERVICE = "declarativeNetRequest.onChange";

// The address of an image into the rule of the blocked images (IMAGE_BLOCK_RULE_ID in rules.mjs) — the button "Block the image
// permanently" of imageInfoSandbox. Not a function of the catalog: no module asks for it directly, the core calls it wherever this
// module runs (the function imageInfo.blockImage outside the sandbox, SANDBOX_DECLARATIVE_NET_REQUEST_BLOCK_IMAGE_SERVICE in base.mjs —
// also in a client of the extension, routeModuleService()), and only for an image its listing showed. The background part stores
// the rule in Settings, converts the rules right away and says whether the browser now blocks the address (the answer
// Types.DeclarativeNetRequest.BlockImageResponse).
export const BLOCK_IMAGE_SERVICE = "declarativeNetRequest.blockImage";
