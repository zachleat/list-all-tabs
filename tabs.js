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
    tabs = tabs.filter((tab) => !tab.url.startsWith("about:blank"));
    var dupes = {};
    var hosts = {};
    let collapsedHosts = new Set(
      [...document.querySelectorAll(".host-group:not([open])")].map((group) => group.dataset.host)
    );
    // Hosts already listed stay listed until their last tab closes.
    let shownHosts = new Set(
      [...document.querySelectorAll(".host-group")].map((group) => group.dataset.host)
    );

    tabs.reverse();
    let sort = document.getElementById("sort").value;
    if (sort == "oldest") {
      tabs.sort((a, b) => a.lastAccessed - b.lastAccessed);
    } else if (sort == "newest") {
      tabs.sort((a, b) => b.lastAccessed - a.lastAccessed);
    }
    // Stable sort keeps the chosen order within pinned and unpinned tabs.
    tabs.sort((a, b) => a.pinned - b.pinned);

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
    document.getElementById("dupes").hidden = !dupesList.childElementCount;

    let topHostsList = document.getElementById("top-hosts-list");
    topHostsList.replaceChildren();
    for (let host of topHosts) {
      if (hosts[host].length < 2 && !shownHosts.has(host)) {
        continue;
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
      let loadedCount = document.createElement("span");
      loadedCount.dataset.countOf = "li:not(.discarded-tab)";
      loadedCount.dataset.countIcon = "●";
      loadedCount.title = "Loaded tabs";
      let unloadedCount = document.createElement("span");
      unloadedCount.dataset.countOf = "li.discarded-tab";
      unloadedCount.dataset.countIcon = "○";
      unloadedCount.title = "Unloaded tabs";
      unloadedCount.dataset.countHideZero = "";
      count.append("(", countValue, " ", loadedCount, unloadedCount, ")");
      h3.appendChild(count);
      let unloadAll = document.createElement("button");
      unloadAll.className = "unload-all";
      unloadAll.textContent = "Unload all";
      let moveAll = document.createElement("button");
      moveAll.className = "move-all";
      moveAll.textContent = "Consolidate in one window";
      moveAll.addEventListener("click", (e) => {
        e.preventDefault();
        moveGroup(tabList);
      });
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
      summary.appendChild(moveAll);
      summary.appendChild(unloadAll);
      summary.appendChild(closeAll);

      let group = document.createElement("details");
      group.className = "host-group";
      group.dataset.host = host;
      group.open = !collapsedHosts.has(host);
      group.appendChild(summary);
      group.appendChild(tabList);
      topHostsList.appendChild(group);
    }

    applyFilter();
  });
}

// Unchecked toggles hide their tab class; every word must appear in the title, URL, or container name.
function applyFilter() {
  let hiddenClasses = [...document.querySelectorAll("[data-hides]:not(:checked)")].map((box) => box.dataset.hides);
  let words = document.getElementById("filter").value.toLowerCase().split(/\s+/).filter(Boolean);
  for (let li of document.querySelectorAll(".tabs-list li")) {
    let text = [".tab-title-text", ".tab-url", ".tab-container"]
      .map((selector) => li.querySelector(selector)?.textContent ?? "")
      .join(" ")
      .toLowerCase();
    let hidden = hiddenClasses.some((name) => li.classList.contains(name)) || !words.every((word) => text.includes(word));
    li.classList.toggle("filtered-out", hidden);
  }
  for (let group of document.querySelectorAll(".host-group")) {
    group.classList.toggle("filtered-out", !group.querySelector("li:not(.filtered-out)"));
  }
  updateCounts();
}

// Counts are scoped to the enclosing section; closed and filtered tabs are not counted.
function updateCounts() {
  for (let count of document.querySelectorAll("[data-count-of]")) {
    let items = count.closest("details").querySelectorAll(`${count.dataset.countOf}:not(.deleted-tab, .filtered-out)`);
    let unit = count.dataset.countUnit;
    let icon = count.dataset.countIcon;
    count.hidden = "countHideZero" in count.dataset && items.length == 0;
    if (unit) {
      count.textContent = `${items.length} ${unit}${items.length == 1 ? "" : "s"}`;
    } else if (icon) {
      let iconSpan = document.createElement("span");
      iconSpan.className = "count-icon";
      iconSpan.textContent = icon;
      count.replaceChildren(iconSpan, ` ${items.length}`);
    } else {
      count.textContent = items.length;
    }
  }
}

function closeGroup(name, tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out)")]
      .map((li) => +li.getAttribute("data-tabid"))
      .filter((id) => id != self?.id);
    let noun = tabIds.length == 1 ? "tab" : "tabs";
    if (tabIds.length > 0 && confirm(`Close ${tabIds.length} ${noun} from ${name}?`)) {
      browser.tabs.remove(tabIds);
    }
  });
}

function moveGroup(tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out)")]
      .map((li) => +li.getAttribute("data-tabid"))
      .filter((id) => id != self?.id);
    if (tabIds.length == 0) {
      return;
    }
    // The blank tab stays showing so no moved tab has to load.
    browser.windows.create({ url: "about:blank" }).then((win) => {
      browser.tabs.move(tabIds, { windowId: win.id, index: -1 });
    });
  });
}

// Unloads every open tab in the button's section; Firefox skips active tabs.
function unloadGroup(button) {
  let tabIds = [...button.closest("details").querySelectorAll("li:not(.deleted-tab, .discarded-tab, .pinned-tab, .filtered-out)")]
    .map((li) => +li.getAttribute("data-tabid"));
  browser.tabs.discard([...new Set(tabIds)]);
}

document.addEventListener("click", (e) => {
  let toggle = e.target.closest("[data-hosts-open]");
  if (toggle) {
    for (let group of document.querySelectorAll(".host-group")) {
      group.open = toggle.dataset.hostsOpen == "true";
    }
    return;
  }
  let unloadAll = e.target.closest(".unload-all");
  if (unloadAll) {
    // Keep the button from toggling the section.
    e.preventDefault();
    unloadGroup(unloadAll);
    return;
  }
  let elt = e.target.closest(".tabs-list li");
  if (elt == null || elt.classList.contains("deleted-tab") || e.target.closest("button:disabled")) {
    return;
  }
  let tabId = +elt.getAttribute("data-tabid");
  if (e.target.closest(".close-tab")) {
    // The onRemoved handler marks the tab as deleted.
    browser.tabs.remove(tabId);
  } else if (e.target.closest(".unload-tab")) {
    // The onUpdated handler marks the tab as discarded.
    browser.tabs.discard(tabId);
  } else {
    browser.tabs.update(tabId, { active: true }).then((tab) => {
      browser.windows.update(tab.windowId, { focused: true });
    });
  }
});

function renderTabItem(tab) {
  var li = document.createElement("li");
  li.setAttribute("data-tabid", tab.id);
  li.classList.toggle("discarded-tab", tab.discarded);
  li.classList.toggle("active-tab", tab.active);
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
  // Shown by CSS while the tab is pinned or discarded.
  for (let [className, text] of [["tab-pinned", "Pinned"], ["tab-unloaded", "Unloaded"]]) {
    let badge = document.createElement("span");
    badge.classList.add("tab-badge", className);
    badge.textContent = text;
    pTitle.appendChild(badge);
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
  var unload = document.createElement("button");
  unload.classList.add("unload-tab");
  unload.textContent = "Unload";
  var close = document.createElement("button");
  close.classList.add("close-tab");
  close.textContent = "Close";
  li.appendChild(info);
  let ago = formatAgo(tab.lastAccessed);
  if (ago) {
    var accessed = document.createElement("time");
    accessed.classList.add("tab-accessed");
    accessed.dateTime = new Date(tab.lastAccessed).toISOString();
    accessed.title = `Last used ${ago.long} (${new Date(tab.lastAccessed).toLocaleString()})`;
    accessed.textContent = ago.short;
    li.appendChild(accessed);
  }
  li.appendChild(unload);
  li.appendChild(close);
  setPinned(li, tab.pinned);
  return li;
}

// Pinned tabs can't be closed, unloaded, or moved from here.
function setPinned(li, pinned) {
  li.classList.toggle("pinned-tab", pinned);
  for (let button of li.querySelectorAll("button")) {
    button.disabled = pinned;
  }
}

var relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
var timeUnits = [["year", 31536e6, "y"], ["month", 2592e6, "mo"], ["week", 6048e5, "w"]];
// Only tabs unused for a week or more get a label.
function formatAgo(timestamp) {
  let elapsed = Date.now() - timestamp;
  for (let [unit, ms, abbr] of timeUnits) {
    if (elapsed >= ms) {
      let n = Math.floor(elapsed / ms);
      return { short: `${n}${abbr}`, long: relativeTime.format(-n, unit) };
    }
  }
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

document.addEventListener("DOMContentLoaded", () => {
  let sort = document.getElementById("sort");
  try {
    sort.value = localStorage.getItem("sort") || sort.value;
  } catch {}
  sort.addEventListener("change", () => {
    try {
      localStorage.setItem("sort", sort.value);
    } catch {}
    updateTabsLists();
  });
  document.getElementById("filter").addEventListener("input", applyFilter);
  for (let box of document.querySelectorAll("[data-hides]")) {
    try {
      let saved = localStorage.getItem(box.id);
      if (saved != null) {
        box.checked = saved == "true";
      }
    } catch {}
    box.addEventListener("change", () => {
      try {
        localStorage.setItem(box.id, box.checked);
      } catch {}
      applyFilter();
    });
  }
  updateTabsLists();
});

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

// Firefox can't discard the tab showing in each window.
browser.tabs.onActivated.addListener(({ tabId, previousTabId }) => {
  for (let elt of tabItems(previousTabId)) {
    elt.classList.remove("active-tab");
  }
  for (let elt of tabItems(tabId)) {
    elt.classList.add("active-tab");
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.pinned != null) {
    // A new URL can change the tab's groups; pinning changes its position.
    scheduleRender();
    return;
  }
  for (let elt of tabItems(tabId)) {
    elt.querySelector(".tab-title-text").textContent = tab.title;
    elt.classList.toggle("discarded-tab", tab.discarded);
    setPinned(elt, tab.pinned);
  }
  applyFilter();
}, { properties: ["title", "url", "discarded", "pinned"] });
