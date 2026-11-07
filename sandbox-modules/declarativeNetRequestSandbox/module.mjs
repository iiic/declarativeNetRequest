//@ts-check
"use strict";

// sandbox-modules/declarativeNetRequestSandbox/module.mjs
// The module description without DOM (see declarativeNetRequestSandbox.mjs).
import { getTagName, NOT_DISABLED_SPEC, t } from "../../sdk.mjs";

export const MODULE_NAME = "declarativeNetRequestSandbox";
export const TAG = getTagName(MODULE_NAME); // "extension-declarative-net-request-sandbox"

// t() reads the module's own texts — messages.json of the package (an uploaded module
// cannot add them to _locales).
export const DESCRIPTION = t("declarativeNetRequestSandbox_description");

// The overview is shown everywhere, also over a special page of the browser — there it says the rules do not apply
// (the same as the element of declarativeNetRequest did before) — hence without WEB_PAGE_SPEC.
export const ACTIVATION_SPEC = NOT_DISABLED_SPEC;

// The overview loads when its surface opens and follows the rules while it is open — in the sidebar (the element of
// declarativeNetRequest used to be in the popup), a block element without a heading (the output starts with the module
// name; a standalone build leaves that prefix out, "messages" in modules/declarativeNetRequest/standalone.json).
/** @type {Types.ModuleDescriptor['DEFAULT_ACTIVATION_MODE']} */
export const DEFAULT_ACTIVATION_MODE = "background";
/** @type {Types.ModuleDescriptor['DEFAULT_DISPLAY_LOCATION']} */
export const DEFAULT_DISPLAY_LOCATION = "sidebar";
/** @type {Types.ModuleDescriptor['DEFAULT_OUTPUT_ELEMENT']} */
export const DEFAULT_OUTPUT_ELEMENT = "block";
/** @type {Types.ModuleDescriptor['DEFAULT_SHOW_HEADING']} */
export const DEFAULT_SHOW_HEADING = false;

// The look of the overview and the editor — a file of the package, the sandbox applies it to its own
// page after mvp.css.
/** @type {string[]} */
export const STYLES = [new URL("./declarativeNetRequestSandbox.css", import.meta.url).href];

// Without declarativeNetRequest nothing applies — its background part converts the rules into the browser, keeps them
// and the suspensions and does for the module what needs the browser (Settings shows it with both modules).
/** @type {Types.ModuleDependency[]} */
export const DEPENDS_ON = [{ module: "declarativeNetRequest", reason: t("declarativeNetRequestSandbox_depends_declarative_net_request") }];

// The element is also the editor of the rules of declarativeNetRequest — Settings renders it in the settings block of this
// module (init({ location: "settings" }), rulesEditor.mjs): as a custom field it would be code outside the sandbox.
/** @type {Types.ModuleDescriptor['SETTINGS_VIEW']} */
export const SETTINGS_VIEW = true;

// The functions outside the sandbox the module works with (registerModule({ capabilities })) — the services of the
// background part of declarativeNetRequest (api.services): the rules for the page of the active tab and how they turned
// out in the browser (declarativeNetRequest.getStatus), the rules with what their editor needs and storing them
// (declarativeNetRequest.getRules, declarativeNetRequest.setRules), the addresses of the bookmarks in a folder for the JSON of a
// rule with the folder (declarativeNetRequest.getFolderUrls), suspending a rule temporarily and restoring it
// (declarativeNetRequest.suspendRule, declarativeNetRequest.restoreRule), reloading the page of the active tab
// (declarativeNetRequest.reloadTab), blocking the domain or the address of that page — the rule "Direct blocking list
// created by browsing" (declarativeNetRequest.blockPage), adding the domain of that page to the "Except" domains of a rule (the
// button "Add <domain> to the exceptions list", declarativeNetRequest.addExceptDomain), its own log of the applied rules and deleting its entries (declarativeNetRequest.getLog,
// declarativeNetRequest.clearLog — the listing at the bottom of the overview, matchLogViewer.mjs) and the listener of the
// changes of the rules, the suspensions, the log, the permissions and the bookmarks (declarativeNetRequest.onChange);
// options.open opens Settings, where the editor is; declarativeNetRequest.requestPermission asks for the permissions from the
// buttons the core draws above the editor (a click in the sandbox frame cannot ask for a permission);
// declarativeNetRequest.openPermissions opens the page where declarativeNetRequest asks for them — from the overview and from the
// editor of a module of a client (the Settings of the client, not those of the service provider showing the module). The extension brings the module itself, so
// they are allowed until the user denies them in Settings → "Uploaded modules (sandbox)".
/** @type {Types.ModuleDescriptor['CAPABILITIES']} */
export const CAPABILITIES = [
	"declarativeNetRequest.getStatus",
	"declarativeNetRequest.getRules",
	"declarativeNetRequest.getFolderUrls",
	"declarativeNetRequest.setRules",
	"declarativeNetRequest.suspendRule",
	"declarativeNetRequest.restoreRule",
	"declarativeNetRequest.reloadTab",
	"declarativeNetRequest.blockPage",
	"declarativeNetRequest.addExceptDomain",
	"declarativeNetRequest.getLog",
	"declarativeNetRequest.clearLog",
	"declarativeNetRequest.openPermissions",
	"declarativeNetRequest.requestPermission",
	"declarativeNetRequest.onChange",
	"options.open",
];
