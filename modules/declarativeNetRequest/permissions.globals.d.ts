/**
 * @file modules/declarativeNetRequest/permissions.globals.d.ts
 * @description Global TypeScript declarations for modules/declarativeNetRequest/permissions.mjs — the header edit
 * permissions and their missing part.
 */

declare global {

	namespace Functions {

		namespace DeclarativeNetRequest {

			namespace Permissions {

				/** The part of HEADERS_PERMISSIONS that is not granted yet (null = all granted) */
				type missingPermissions = ( api: Types.ModuleApi ) => Promise<Required<Types.PermissionSet> | null>;

			}

		}

	}

}

export { };
