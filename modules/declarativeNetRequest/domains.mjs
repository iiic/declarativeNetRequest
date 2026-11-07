//@ts-check
"use strict";

// modules/declarativeNetRequest/domains.mjs
// The domain lists of the rules ("Where" and "Except") — normalizeDomain(), parseDomainList() and isHostInDomains() of the
// core. rules.mjs takes them from here, not from sdk.mjs: its copy in the package of declarativeNetRequestSandbox (the
// editor of the rules and the overview run in the sandbox, whose SDK does not have these functions) has its own
// domains.mjs with the same code as the core (tests/sandbox.test.mjs compares them).
export { normalizeDomain, parseDomainList, isHostInDomains } from "../../sdk.mjs";
