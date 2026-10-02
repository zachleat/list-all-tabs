var containers = {};

function loadContainers() {
  // Rejects when containers are disabled.
  return browser.contextualIdentities.query({}).then((identities) => {
    for (let identity of identities) {
      containers[identity.cookieStoreId] = identity;
    }
  }, () => {});
}

function getHost(tabUrl) {
  try {
    return new URL(tabUrl).host || "(no host)";
  } catch {
    return "(no host)";
  }
}

function updateTabsLists() {
  loadContainers().then(() => browser.tabs.query({})).then((tabs) => {
    var dupes = {};
    var hosts = {};
    let collapsedHosts = new Set(
      [...document.querySelectorAll(".host-group:not([open])")].map((group) => group.dataset.host)
    );

    tabs.reverse();

    let allTabsList = document.createElement("ul");

    for (let tab of tabs) {
      // Same URL in different containers is not a duplicate.
      (dupes[`${tab.cookieStoreId} ${tab.url}`] ??= []).push(tab);
      (hosts[getHost(tab.url)] ??= []).push(tab);
      allTabsList.appendChild(renderTabItem(tab));
    }

    document.getElementById("all-tabs-list").replaceChildren(allTabsList);

    let topHosts = Object.keys(hosts).sort((a, b) => hosts[b].length - hosts[a].length);
    let topDupes = Object.keys(dupes).sort((a, b) => dupes[b].length - dupes[a].length);

    let dupesList = document.createElement("ul");
    for (let key of topDupes) {
      if (dupes[key].length < 2) {
        break;
      }
      for (let tab of dupes[key]) {
        dupesList.appendChild(renderTabItem(tab));
      }
    }
    document.getElementById("dupes-tabs-list").replaceChildren(dupesList);

    let topHostsList = document.getElementById("top-hosts-list");
    topHostsList.replaceChildren();
    for (let host of topHosts) {
      if (hosts[host].length < 2) {
        break;
      }

      let tabList = document.createElement("ul");
      tabList.className = "tabs-list";
      for (let tab of hosts[host]) {
        tabList.appendChild(renderTabItem(tab));
      }

      let h3 = document.createElement("h3");
      h3.textContent = `${host} `;
      let count = document.createElement("span");
      count.className = "count";
      let countValue = document.createElement("span");
      countValue.dataset.countOf = "li";
      count.append("(", countValue, ")");
      h3.appendChild(count);
      let closeAll = document.createElement("button");
      closeAll.className = "close-tab";
      closeAll.textContent = "Close all";
      closeAll.addEventListener("click", (e) => {
        // Keep the button from toggling the group.
        e.preventDefault();
        closeGroup(host, tabList);
      });
      let summary = document.createElement("summary");
      summary.className = "host-header";
      summary.appendChild(h3);
      summary.appendChild(closeAll);

      let group = document.createElement("details");
      group.className = "host-group";
      group.dataset.host = host;
      group.open = !collapsedHosts.has(host);
      group.appendChild(summary);
      group.appendChild(tabList);
      topHostsList.appendChild(group);
    }

    updateCounts();
  });
}

// Counts are scoped to the enclosing section; closed tabs are not counted.
function updateCounts() {
  for (let count of document.querySelectorAll("[data-count-of]")) {
    let items = count.closest("details").querySelectorAll(`${count.dataset.countOf}:not(.deleted-tab)`);
    let unit = count.dataset.countUnit;
    count.textContent = unit ? `${items.length} ${unit}${items.length == 1 ? "" : "s"}` : items.length;
  }
}

function closeGroup(name, tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab)")]
      .map((li) => +li.getAttribute("data-tabid"))
      .filter((id) => id != self?.id);
    let noun = tabIds.length == 1 ? "tab" : "tabs";
    if (tabIds.length > 0 && confirm(`Close ${tabIds.length} ${noun} from ${name}?`)) {
      browser.tabs.remove(tabIds);
    }
  });
}

document.addEventListener("click", (e) => {
  let elt = e.target.closest(".tabs-list li");
  if (elt == null || elt.classList.contains("deleted-tab")) {
    return;
  }
  let tabId = +elt.getAttribute("data-tabid");
  if (e.target.closest(".close-tab")) {
    // The onRemoved handler marks the tab as deleted.
    browser.tabs.remove(tabId);
  } else {
    browser.tabs.update(tabId, { active: true }).then((tab) => {
      browser.windows.update(tab.windowId, { focused: true });
    });
  }
});

function renderTabItem(tab) {
  var li = document.createElement("li");
  li.setAttribute("data-tabid", tab.id);
  var pTitle = document.createElement("p");
  pTitle.classList.add("tab-title");
  let container = containers[tab.cookieStoreId];
  if (container) {
    let label = document.createElement("span");
    label.classList.add("tab-container");
    label.style.setProperty("--container-color", container.colorCode);
    label.textContent = container.name;
    pTitle.appendChild(label);
  }
  var titleText = document.createElement("span");
  titleText.classList.add("tab-title-text");
  titleText.textContent = tab.title;
  pTitle.appendChild(titleText);
  var pURL = document.createElement("p");
  pURL.classList.add("tab-url");
  pURL.textContent = tab.url;
  var info = document.createElement("div");
  info.classList.add("tab-info");
  info.appendChild(pTitle);
  info.appendChild(pURL);
  var close = document.createElement("button");
  close.classList.add("close-tab");
  close.textContent = "Close";
  li.appendChild(info);
  li.appendChild(close);
  return li;
}

function tabItems(tabId) {
  return document.querySelectorAll(`li[data-tabid="${tabId}"]`);
}

// Batches bursts of tab events into one re-render.
var renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(updateTabsLists, 250);
}

document.addEventListener("DOMContentLoaded", updateTabsLists);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState == "visible") {
    updateTabsLists();
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  for (let elt of tabItems(tabId)) {
    elt.classList.add("deleted-tab");
  }
  updateCounts();
});

browser.tabs.onCreated.addListener(scheduleRender);

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // A new URL can change the tab's duplicate and host groups.
    scheduleRender();
    return;
  }
  for (let elt of tabItems(tabId)) {
    elt.querySelector(".tab-title-text").textContent = tab.title;
  }
}, { properties: ["title", "url"] });
