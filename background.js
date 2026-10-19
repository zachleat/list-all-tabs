browser.action.setBadgeBackgroundColor({ color: "green" });

// Recount instead of incrementing so the badge never drifts.
function updateBadge() {
  browser.tabs.query({ discarded: false }).then((tabs) => {
    let count = tabs.filter((tab) => !tab.url.startsWith("about:blank")).length;
    browser.action.setBadgeText({ text: count.toString() });
  });
}
updateBadge();

browser.tabs.onCreated.addListener(updateBadge);
// onRemoved fires before the tab leaves query results.
browser.tabs.onRemoved.addListener(() => setTimeout(updateBadge, 100));
browser.tabs.onUpdated.addListener(updateBadge, { properties: ["discarded", "url"] });

function handleClick() {
  let url = browser.runtime.getURL("tabs.html");
  browser.tabs.query({ url: url, currentWindow: true }).then((tabs) => {
    if (tabs.length > 0) {
      let tabId = tabs[0].id;
      browser.tabs.move(tabId, { index: -1 });
      browser.tabs.update(tabId, { active: true });
    } else {
      browser.tabs.create({ url: "tabs.html" });
    }
  });
}

browser.action.onClicked.addListener(handleClick);

// Firefox leaves the container out of closed tab data, so open container tabs are tracked and logged as they close.
// This page can be unloaded between events, so the open tabs live in session storage.
var trackQueue = Promise.resolve();
function track(change) {
  trackQueue = trackQueue
    .then(() => browser.storage.session.get({ containerTabs: {} }))
    .then(({ containerTabs }) => change(containerTabs))
    .then((containerTabs) => browser.storage.session.set({ containerTabs }))
    .catch(() => {});
}

function inContainer(tab) {
  return tab.cookieStoreId && tab.cookieStoreId != "firefox-default" && !tab.incognito;
}

function trackAll() {
  browser.tabs.query({}).then((tabs) => track(() => Object.fromEntries(
    tabs.filter(inContainer).map((tab) => [tab.id, { url: tab.url, cookieStoreId: tab.cookieStoreId }])
  )));
}

function trackTab(tab) {
  if (inContainer(tab)) {
    track((tabs) => ({ ...tabs, [tab.id]: { url: tab.url, cookieStoreId: tab.cookieStoreId } }));
  }
}

browser.runtime.onStartup.addListener(trackAll);
browser.runtime.onInstalled.addListener(trackAll);
browser.tabs.onCreated.addListener(trackTab);
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => trackTab(tab), { properties: ["url"] });

// Tabs in a closing window aren't listed as recently closed tabs.
browser.tabs.onRemoved.addListener((tabId, { isWindowClosing }) => track((tabs) => {
  let closed = tabs[tabId];
  delete tabs[tabId];
  if (!closed || isWindowClosing) {
    return tabs;
  }
  return browser.storage.local.get({ closedContainers: [] }).then(({ closedContainers }) => browser.storage.local.set({
    closedContainers: [...closedContainers, { ...closed, closed: Date.now() }].slice(-200),
  })).then(() => tabs);
}));
