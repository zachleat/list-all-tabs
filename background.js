browser.action.setBadgeBackgroundColor({ color: "green" });

// Recount instead of incrementing so the badge never drifts.
function updateBadge() {
  browser.tabs.query({ discarded: false }).then((tabs) => {
    browser.action.setBadgeText({ text: tabs.length.toString() });
  });
}
updateBadge();

browser.tabs.onCreated.addListener(updateBadge);
// onRemoved fires before the tab leaves query results.
browser.tabs.onRemoved.addListener(() => setTimeout(updateBadge, 100));
browser.tabs.onUpdated.addListener(updateBadge, { properties: ["discarded"] });

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
