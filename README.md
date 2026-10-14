# List All Tabs

A Firefox extension that lists every open tab across all windows, groups duplicates and busy hosts (respecting Multi-Account Containers), and lets you jump to or close tabs individually or by host. Forked from [David Lazar’s original](https://addons.mozilla.org/en-US/firefox/addon/list-all-tabs/).

- Download from Mozilla Add-ons: https://addons.mozilla.org/en-US/firefox/addon/list-all-tabs-updated/

## Notes for me, the developer

- Source code: https://github.com/zachleat/list-all-tabs
- For local dev: `about:debugging#/runtime/this-firefox` and choose the `manifest.json`
- For publish: `npx web-ext build --overwrite-dest` will build a zip file to upload
  - Manage addons here: https://addons.mozilla.org/en-US/developers/addons
