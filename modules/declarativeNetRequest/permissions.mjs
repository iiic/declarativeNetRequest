//@ts-check
"use strict";

// modules/declarativeNetRequest/permissions.mjs
// The permissions for header and GET parameter edits and the part that is still missing — shared
// by the element and the rules editor in Settings.
import { NETWORK_RULES_PERMISSIONS } from "../../sdk.mjs";

// declarativeNetRequest rules (NETWORK_RULES_PERMISSIONS, the
// "WithHostAccess" variant) and the host permission for all addresses: with the
// "WithHostAccess" variant the browser applies header edits and redirects (GET parameters)
// only to requests to addresses for which the extension has the host permission
// — and the page's files can be from anywhere. Chrome accepts both as optional, Firefox
// declarativeNetRequestWithHostAccess only as required (it is in its manifest),
// <all_urls> as optional.
/** @type {Types.PermissionSet} */
export const HEADERS_PERMISSIONS = {
	permissions: [ ...( NETWORK_RULES_PERMISSIONS.permissions || [] ) ],
	origins: [ "<all_urls>" ],
};

/** @type {Types.PermissionSet} */
export const NOTIFICATION_PERMISSIONS = { permissions: [ "notifications" ] };
/** @type {Types.PermissionSet} */
export const MATCHED_RULES_PERMISSIONS = { permissions: [ "declarativeNetRequestFeedback" ] };

// The part of HEADERS_PERMISSIONS that is not granted yet (null = all granted).
// The button requests only it — Firefox would reject a request for declarativeNetRequest*
// even when the extension has had it for a long time (see customSearch). It is computed in advance:
// permissions.request() must happen directly in the click handler (Firefox
// does not carry the user gesture over an await).
/** @type {Functions.DeclarativeNetRequest.Permissions.missingPermissions} */
export async function missingPermissions ( api )
{
	if ( await api.permissions.contains( HEADERS_PERMISSIONS ) ) return null;
	/** @type {Required<Types.PermissionSet>} */
	const missing = { permissions: [], origins: [] };
	for ( const permission of HEADERS_PERMISSIONS.permissions || [] ) {
		if ( !( await api.permissions.contains( { permissions: [ permission ] } ) ) ) missing.permissions.push( permission );
	}
	for ( const origin of HEADERS_PERMISSIONS.origins || [] ) {
		if ( !( await api.permissions.contains( { origins: [ origin ] } ) ) ) missing.origins.push( origin );
	}
	return missing;
}
