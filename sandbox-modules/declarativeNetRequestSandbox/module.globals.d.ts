/**
 * @file sandbox-modules/declarativeNetRequestSandbox/module.globals.d.ts
 * @description Global TypeScript declarations for sandbox-modules/declarativeNetRequestSandbox/module.mjs — the description of
 * the package of the overview and the editor of the rules of declarativeNetRequest without DOM: the dependency on
 * declarativeNetRequest and the functions outside the sandbox it works with.
 */

declare global {

	namespace Types {

		namespace DeclarativeNetRequestSandbox {

			/** The module.mjs namespace — checked against Types.ModuleDescriptor (the full module description). */
			type Descriptor = Types.Satisfies<Types.ModuleDescriptor, typeof import( './module.mjs' )>;

		}

	}

}

export { };
