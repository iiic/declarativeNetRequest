# declarativeNetRequest

Firefox extension that modifies HTTP headers and GET parameters, blocks requests and redirects them to HTTPS by your own
rules. The browser applies the rules itself through its `declarativeNetRequest` API, without a request listener.

## What it does

Rules are edited in Settings. Each rule says:

- **what to do** — modify request or response headers, remove or set GET parameters, block the requests, or redirect them
  from HTTP to HTTPS;
- **where** — domains, addresses (`*` stands for anything) or the bookmarks of a bookmark folder, with "Except" domains;
- **which requests** — the page, frames, scripts, styles, images, fonts, fetch/XHR, media, WebSocket, others.

The toolbar popup and the sidebar show the rules that target the page of the active tab. There you can suspend a rule for
an hour (everywhere, or only for the domain of the page), add the domain to its "Except" domains, block the domain or the
address of the page, and read the event log of the rules that keep one.

The extension comes with a set of default rules. Some are turned on (removing tracking GET parameters, blocking dangerous
CDN servers, removing a few Facebook parameters, and sending two privacy-preference headers); others are ready to turn on.
Review them in Settings after granting the permission below — they can affect how sites work, and the uncommon headers
may make your browser easier to identify.

## Using the extension

### First-time setup

1. Click the extension's toolbar button and open **Settings** (or open `about:addons`, select **declarativeNetRequest**,
   then **Preferences**).
2. In the Declarative Net Request section, click **Allow request modification** and approve access to all websites.
   Without this permission, the browser cannot apply the rules.
3. Review the rules in Settings. The enabled defaults remove common tracking parameters, block requests to a list of
  known dangerous CDN domains, remove a few unnecessary parameters on Facebook, send a Global Privacy Control signal,
  and send a cookie preference for functional-only cookies. These two headers are uncommon and may make your browser
  easier to identify. An HTTP-to-HTTPS rule is also available but disabled by default. You can enable, disable, or edit
  rules to suit your needs.

### While browsing

Click the toolbar button to see rules that target the current page. From the popup (or the extension's sidebar), you can:

- Suspend a rule for one hour, either everywhere or only for the current domain. Use this to check whether a rule is
  causing a site problem; it will resume automatically.
- Add the current domain to a rule's **Except** list. This keeps the exception until you remove it in Settings.
- Block the current domain or the exact page address. The block is added to a rule in Settings and stays in effect until
  you remove it there.
- Open the event log, when available. It is not a complete record of every rule match: Firefox reports blocked requests
  and HTTP-to-HTTPS redirects, but does not identify every rule it applies.

If a site stops working, first suspend a suspected rule for an hour. If that fixes the site, add a domain exception or
adjust the rule in Settings rather than turning off protections you still want on other sites.

### Creating and managing rules

In Settings, add or edit a rule by choosing its action (change request or response headers, remove or set URL parameters,
block requests, or redirect HTTP to HTTPS), its target (domains, URL patterns, or a bookmark folder), and the request
types it should affect. Use **Except** domains when a rule should skip a site. Start with a narrow target and test one
change at a time: blocking or changing requests can affect how a website works.

The toolbar popup is for quick actions on the current page; Settings is where rules are reviewed and maintained. The
sidebar shows the same page overview with more room.

## Everyday Use: A Practical Guide

### Check What Applies to a Page

Open the extension popup while viewing a website. It lists the rules that target that page and shows whether a rule is active or temporarily suspended. If no rules are listed, the page may simply have no matching rules. Browser-internal pages, such as extension settings, are not ordinary web pages and cannot be modified by these rules.

### Test a Rule Before Keeping a Change

1. In the popup, suspend a suspected rule for one hour, either everywhere or only for the current domain.
2. Reload the page and check whether the problem is gone. Rules affect new requests; they do not undo requests that have already loaded.
3. If the rule caused the problem, add the domain to that rule's **Except** list to keep the rule active on other websites, or edit the rule in Settings.

A temporary suspension ends automatically after one hour. An exception is permanent until you remove it in the rule editor.

### Choose the Right Scope

A domain target covers requests to that domain and its subdomains, as well as files loaded by its pages from other domains. An address target is narrower: it affects requests to the matching page or file, but does not cover other files that page loads from elsewhere. Use a domain when you mean a whole site; use an address when you mean one specific page or file.

The popup's block actions have different effects too. **Block domain** blocks requests to the domain and its subdomains across websites. **Block this address** blocks only the exact page address. Both actions add an entry to a rule in Settings, where you can later change or remove it.

### Know What the Defaults Send

Along with removing tracking parameters and blocking a list of dangerous CDN domains, the enabled defaults remove a few Facebook parameters and send two request headers: `Sec-GPC: 1` (a Global Privacy Control signal) and `Cookie-Preference: functional`. These headers express preferences, but they are uncommon and may make your browser easier to identify. Review or disable them in Settings if you do not want to send them. The HTTP-to-HTTPS rule is available but starts disabled.

### Understand the Event Log

The event log is not a full browsing history or a complete list of every rule match. In Firefox, it can show blocked requests and requests redirected to HTTPS; Firefox does not report every applied rule. A rule must also be set to write events to the log, and the required browser permission must be granted. Use the rule overview to see which rules target the current page.

## Permissions

**Rules do not apply until you grant access to all pages**: Settings → "Allow request modification". The popup and the
sidebar say so while it is missing.

| Permission | Granted | What for |
| --- | --- | --- |
| `declarativeNetRequestWithHostAccess` | at installation | the rules in the browser |
| `storage`, `alarms` | at installation | the rules and settings; the end of a temporary suspension |
| `activeTab` | at installation | the address of the active tab for the overview |
| `<all_urls>` | on request | the browser applies the rules only to addresses the extension has access to |
| `bookmarks` | on request | rules that target a bookmark folder |
| `notifications`, `webRequest` | on request | notifications about applied rules and the event log |
| `declarativeNetRequestFeedback` | on request | the browser's own report of applied rules (Firefox does not implement it) |
| `scripting` | on request | the floating window of the core |

Firefox does not report which rule was applied. The notifications and the event log therefore cover only blocked requests
and requests redirected to HTTPS, found out through `webRequest`.

The module itself sends nothing off the device (`data_collection_permissions`: `none`).

## Development

Load the extension from `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → `manifest.json`.

Requires Node.js 22 or newer. The project has no dependencies; `npm install` only turns on the git hook.

```sh
npm install   # once: git then runs the tests before each commit (.githooks/pre-commit)
npm test      # the tests in tests/ (node:test)
```

The tests also run on GitHub (`.github/workflows/test.yml`) and before `npm publish`.

## Release

The version is in `package.json` and `manifest.json` and the tests check that both are the same. Change it with
`npm version`, which updates both, commits and tags:

```sh
npm version patch   # or minor, major, X.Y.Z — Firefox accepts numbers only, no "-beta.1"
git push --follow-tags
npm publish
```

## License

[CC BY-SA 4.0](LICENSE)
