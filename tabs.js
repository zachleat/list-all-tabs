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
  Promise.all([loadContainers(), suffixesReady]).then(() => browser.tabs.query({})).then((tabs) => {
    tabs = tabs.filter((tab) => !tab.url.startsWith("about:blank"));
    var dupes = {};
    var hosts = {};
    let collapsedHosts = new Set(
      [...document.querySelectorAll(".host-group:not([open])")].map((group) => group.dataset.host)
    );
    // Sites already listed stay listed until their last tab closes.
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
    let windows = {};
    let collapsedWindows = new Set(
      [...document.querySelectorAll(".window-group:not([open])")].map((group) => group.dataset.windowid)
    );

    for (let tab of tabs) {
      (windows[tab.windowId] ??= []).push(tab);
      // Same URL in different containers is not a duplicate.
      (dupes[`${tab.cookieStoreId} ${tab.url}`] ??= []).push(tab);
      (hosts[getSite(tab.url)] ??= []).push(tab);
      allTabsList.appendChild(renderTabItem(tab));
    }

    document.getElementById("all-tabs-list").replaceChildren(allTabsList);
    // Windows are listed in the order they opened.
    let windowIds = Object.keys(windows).sort((a, b) => a - b);
    document.getElementById("all-windows-list").replaceChildren(
      ...windowIds.map((id) => renderWindowGroup(id, windows[id], collapsedWindows))
    );

    let audioList = document.createElement("ul");
    for (let tab of tabs.filter((tab) => tab.audible)) {
      audioList.appendChild(renderTabItem(tab));
    }
    document.getElementById("audio-tabs-list").replaceChildren(audioList);

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
    document.getElementById("audio").hidden = !audioList.childElementCount;
    document.getElementById("dupes").hidden = !dupesList.childElementCount;
    document.getElementById("important").hidden = !audioList.childElementCount && !dupesList.childElementCount;

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
      h3.append(`${host} `, groupCount(true));
      let unloadAll = unloadAllButton();
      let moveAll = document.createElement("button");
      moveAll.className = "move-all";
      moveAll.append(icon(mergePaths), "Merge");
      moveAll.title = "Move these tabs into one new window";
      moveAll.addEventListener("click", (e) => {
        e.preventDefault();
        moveGroup(host, tabList);
      });
      let saveAll = document.createElement("button");
      saveAll.className = "save-all";
      saveAll.title = "Save all: close these tabs and keep them under Saved";
      saveAll.setAttribute("aria-label", "Save all");
      saveAll.append(icon(floppyPaths));
      let closeAll = closeAllButton(host, tabList);
      let summary = document.createElement("summary");
      summary.className = "host-header";
      summary.appendChild(h3);
      summary.appendChild(unloadAll);
      summary.appendChild(moveAll);
      summary.appendChild(saveAll);
      summary.appendChild(closeAll);

      let group = document.createElement("details");
      group.className = "host-group";
      group.dataset.host = host;
      group.open = !collapsedHosts.has(host);
      group.appendChild(summary);
      group.appendChild(tabList);
      topHostsList.appendChild(group);
    }

    updateToggleLabel();
    applyFilter();
  });
}

// A card's tab counts, with how many windows its tabs are in when withWindows is set.
function groupCount(withWindows) {
  let count = document.createElement("span");
  count.className = "count";
  let countValue = document.createElement("span");
  countValue.dataset.countOf = "li";
  let loadedCount = document.createElement("span");
  loadedCount.dataset.countOf = "li:not(.discarded-tab)";
  loadedCount.dataset.countIcon = "●";
  loadedCount.title = "Loaded tabs";
  loadedCount.dataset.countHideSame = "";
  let unloadedCount = document.createElement("span");
  unloadedCount.dataset.countOf = "li.discarded-tab";
  unloadedCount.dataset.countIcon = "○";
  unloadedCount.title = "Unloaded tabs";
  unloadedCount.dataset.countHideZero = "";
  count.append("(", countValue, loadedCount, unloadedCount);
  if (withWindows) {
    let windowCount = document.createElement("span");
    windowCount.dataset.countOf = "li";
    windowCount.dataset.countBy = "windowid";
    windowCount.dataset.countIcon = "window";
    windowCount.title = "Windows";
    windowCount.dataset.countHideZero = "";
    count.append(windowCount);
  }
  count.append(")");
  return count;
}

function unloadAllButton() {
  let unloadAll = document.createElement("button");
  unloadAll.className = "unload-all";
  unloadAll.title = "Unload all";
  unloadAll.setAttribute("aria-label", "Unload all");
  unloadAll.append(icon(zzzPaths));
  return unloadAll;
}

function closeAllButton(name, tabList) {
  let closeAll = document.createElement("button");
  closeAll.className = "close-tab close-all";
  closeAll.title = "Close all";
  closeAll.setAttribute("aria-label", "Close all");
  closeAll.append(icon(trashPaths));
  closeAll.addEventListener("click", (e) => {
    // Keep the button from toggling the group.
    e.preventDefault();
    closeGroup(name, tabList);
  });
  return closeAll;
}

function renderWindowGroup(windowId, tabs, collapsed) {
  let tabList = document.createElement("ul");
  tabList.className = "tabs-list";
  for (let tab of tabs) {
    tabList.appendChild(renderTabItem(tab));
  }
  let h3 = document.createElement("h3");
  h3.append(tabs[0].incognito ? "Private " : "", groupCount(false));
  let summary = document.createElement("summary");
  summary.className = "host-header";
  summary.append(h3, unloadAllButton(), closeAllButton("this window", tabList));
  let group = document.createElement("details");
  group.className = "window-group";
  group.dataset.windowid = windowId;
  group.open = !collapsed.has(windowId);
  group.append(summary, tabList);
  return group;
}

// A toggle button acts on the cards in its own section.
function toggleGroups(button) {
  return [...button.closest("details").querySelectorAll(":scope > div details")];
}

// Names the action each Toggle all button will take next.
function updateToggleLabel() {
  for (let button of document.querySelectorAll(".toggle-groups")) {
    button.textContent = toggleGroups(button).some((group) => group.open) ? "Collapse all" : "Expand all";
  }
}

// Toggle events don't bubble, so this listens during capture.
document.addEventListener("toggle", (e) => {
  if (e.target.matches(".host-group, .window-group")) {
    updateToggleLabel();
  }
}, true);

// Unchecked toggles hide their tab class (data-counted keeps it in counts); every word must match title, URL, or container.
function applyFilter() {
  let unchecked = [...document.querySelectorAll("[data-hides]:not(:checked)")];
  let uncountedClasses = unchecked.filter((box) => !("counted" in box.dataset)).map((box) => box.dataset.hides);
  let countedClasses = unchecked.filter((box) => "counted" in box.dataset).map((box) => box.dataset.hides);
  let words = document.getElementById("filter").value.toLowerCase().split(/\s+/).filter(Boolean);
  for (let li of document.querySelectorAll(".tabs-list li")) {
    let text = [".tab-title-text", ".tab-url", ".tab-container"]
      .map((selector) => li.querySelector(selector)?.textContent ?? "")
      .join(" ")
      .toLowerCase();
    let filtered = uncountedClasses.some((name) => li.classList.contains(name)) || !words.every((word) => text.includes(word));
    li.classList.toggle("filtered-out", filtered);
    li.classList.toggle("hidden-tab", !filtered && countedClasses.some((name) => li.classList.contains(name)));
  }
  for (let group of document.querySelectorAll(".host-group, .window-group, .saved-group, .closed-group")) {
    group.classList.toggle("filtered-out", !group.querySelector("li:not(.filtered-out)"));
    group.classList.toggle("hidden-tab", !group.querySelector("li:not(.filtered-out, .hidden-tab)"));
  }
  updateCounts();
}

// Filtering opens Recently closed while it has matches and closes it again once the filter is cleared.
function openForFilter() {
  let section = document.getElementById("recently-closed");
  let filtering = document.getElementById("filter").value.trim() != "";
  if (filtering && !section.open && section.querySelector(".tabs-list li:not(.filtered-out)")) {
    section.open = true;
    section.dataset.openedByFilter = "";
  } else if (!filtering && "openedByFilter" in section.dataset) {
    section.open = false;
    delete section.dataset.openedByFilter;
  }
}

// Counts are scoped to the enclosing section; closed and filtered tabs are not counted, hidden ones are.
function countItems(count) {
  let items = count.closest("details").querySelectorAll(`${count.dataset.countOf}:not(.deleted-tab, .filtered-out)`);
  // A tab listed twice in one section (like in both Important cards) counts once; data-count-by counts another field, like windows.
  return new Set([...items].map((item) => item.dataset[count.dataset.countBy ?? "tabid"] ?? item)).size;
}

// data-count-hide-same hides a count that matches the total just before it.
function updateCounts() {
  for (let count of document.querySelectorAll("[data-count-of]")) {
    let total = countItems(count);
    let unit = count.dataset.countUnit;
    let iconName = count.dataset.countIcon;
    count.hidden = ("countHideZero" in count.dataset && total == 0) ||
      ("countHideSame" in count.dataset && total == countItems(count.previousElementSibling));
    if (unit) {
      count.textContent = `${total} ${unit}${total == 1 ? "" : "s"}`;
    } else if (iconName) {
      let iconSpan = document.createElement("span");
      iconSpan.className = "count-icon";
      iconSpan.append(iconName == "window" ? icon(windowPaths) : iconName);
      count.replaceChildren(iconSpan, ` ${total}`);
    } else {
      count.textContent = total;
    }
  }
  // Card counts hide for a single tab.
  for (let wrapper of document.querySelectorAll("h3 > .count")) {
    wrapper.hidden = countItems(wrapper.querySelector("[data-count-of]")) == 1;
  }
}

function closeGroup(name, tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
      .map((li) => +li.getAttribute("data-tabid"))
      .filter((id) => id != self?.id);
    if (tabIds.length > 0 && confirm(`Close ${tabCount(tabIds.length)} from ${name}?`)) {
      return getTabs(tabIds).then(closeAction);
    }
  });
}

function tabCount(n) {
  return `${n} ${n == 1 ? "tab" : "tabs"}`;
}

// Undo history lasts until this page closes; a new action clears redo.
var undoStack = [];
var redoStack = [];
var historyQueue = Promise.resolve();

function record(label, undo, redo) {
  undoStack.push({ label, undo, redo });
  redoStack = [];
  showToast(label, "Undo");
}

function stepHistory(from, to, verb, nextAction) {
  let entry = from.pop();
  if (!entry) {
    return;
  }
  historyQueue = historyQueue
    .then(verb == "Undid" ? entry.undo : entry.redo)
    .then(() => {
      to.push(entry);
      showToast(`${verb}: ${entry.label}`, nextAction);
    })
    .catch((error) => showToast(`Couldn’t ${verb == "Undid" ? "undo" : "redo"}: ${error.message}`));
}

function undo() {
  stepHistory(undoStack, redoStack, "Undid", "Redo");
}

function redo() {
  stepHistory(redoStack, undoStack, "Redid", "Undo");
}

var toastTimer;
function showToast(text, action) {
  let toast = document.getElementById("toast");
  toast.querySelector(".toast-text").textContent = text;
  let button = toast.querySelector(".toast-action");
  button.hidden = !action;
  button.textContent = action ?? "";
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.hidden = true, 6000);
}

// Records keep what's needed to reopen a tab; id changes each time it reopens.
function getTabs(tabIds) {
  return Promise.all(tabIds.map((id) => browser.tabs.get(id))).then((tabs) => tabs.map(
    ({ id, url, title, favIconUrl, lastAccessed, windowId, index, cookieStoreId }) => ({ id, url, title, favIconUrl, lastAccessed, windowId, index, cookieStoreId })
  ));
}

// Tabs already closed elsewhere are skipped.
function closeTabs(records) {
  return Promise.allSettled(records.map((rec) => browser.tabs.remove(rec.id)));
}

// Firefox leaves the container out, so it comes from what background.js logged when the tab closed; newest first.
function getClosedTabs() {
  return Promise.all([browser.sessions.getRecentlyClosed(), browser.storage.local.get({ closedContainers: [] })]).then(([closed, { closedContainers }]) => {
    let log = [...closedContainers];
    return closed.filter((entry) => entry.tab).map(({ tab, lastModified }) => {
      let match = log.findIndex((rec) => rec.url == tab.url && Math.abs(rec.closed - lastModified) < 2000);
      let logged = match >= 0 ? log.splice(match, 1)[0].cookieStoreId : null;
      return { ...tab, closedAt: lastModified, cookieStoreId: logged ?? (tab.incognito ? "firefox-private" : "firefox-default") };
    });
  });
}

// Prefers Firefox's recently closed tabs, which keep back/forward history, then puts this page back in front.
function reopenTabs(records) {
  return Promise.all([browser.tabs.getCurrent(), getClosedTabs()]).then(([self, closedTabs]) => {
    let reopenAll = records.reduce((chain, rec) => chain.then(() => {
      let match = closedTabs.findIndex((tab) => tab.url == rec.url && tab.cookieStoreId == rec.cookieStoreId);
      let reopened = match >= 0
        ? browser.sessions.restore(closedTabs.splice(match, 1)[0].sessionId).then((session) => session.tab)
        : createTab({ ...unloaded(rec), windowId: rec.windowId, index: rec.index }, rec.cookieStoreId)
          .catch(() => createTab(unloaded(rec), rec.cookieStoreId));
      return reopened.then((tab) => rec.id = tab.id, () => {});
    }), Promise.resolve());
    return reopenAll.then(() => self && browser.tabs.update(self.id, { active: true }));
  });
}

// Tabs past Firefox's recently closed list reopen unloaded so they don't all load at once.
function unloaded(rec) {
  return { url: rec.url, title: rec.title, active: false, discarded: true };
}

// Opens in the tab's container, or without one when it was removed or can't be used here.
function createTab(options, cookieStoreId) {
  if (!containers[cookieStoreId]) {
    return browser.tabs.create(options);
  }
  return browser.tabs.create({ ...options, cookieStoreId }).catch(() => browser.tabs.create(options));
}

function closeAction(records) {
  return closeTabs(records).then(() => record(
    `Closed ${tabCount(records.length)}`,
    () => reopenTabs(records),
    () => closeTabs(records),
  ));
}

function moveGroup(name, tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
      .map((li) => +li.getAttribute("data-tabid"))
      .filter((id) => id != self?.id);
    if (tabIds.length == 0 || !confirm(`Merge ${tabCount(tabIds.length)} from ${name} into a new window?`)) {
      return;
    }
    // The blank tab stays showing so no moved tab has to load.
    browser.windows.create({ url: "about:blank" }).then((win) => {
      browser.tabs.move(tabIds, { windowId: win.id, index: -1 });
    });
  });
}

// Closes the section's tabs after saving them as one Saved group.
function saveGroup(section) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...new Set(
      [...section.querySelectorAll("li[data-tabid]:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
        .map((li) => +li.dataset.tabid)
        .filter((id) => id != self?.id)
    )];
    let name = section.dataset.host;
    if (tabIds.length == 0 || !confirm(`Save ${tabCount(tabIds.length)} from ${name}? They’ll close and be listed under Saved.`)) {
      return;
    }
    return getTabs(tabIds).then((records) => saveAction(name, records));
  });
}

function saveAction(name, records, join = false) {
  let items = records.map(savedItem);
  let keys = items.map(savedKey);
  return addSaved(name, items, join).then((meta) => closeTabs(records).then(() => record(
    `Saved ${tabCount(records.length)}`,
    () => removeSaved(meta.id, keys).then(() => reopenTabs(records)),
    () => putSaved(meta, items).then(() => closeTabs(records)),
  )));
}

// The "stored" key dates from when this feature was called Store.
function loadSaved() {
  return browser.storage.local.get({ stored: [] }).then((data) => data.stored);
}

// The container's name and color are kept so its label still shows if it's removed.
function savedItem({ url, title, favIconUrl, lastAccessed, cookieStoreId }) {
  let container = containers[cookieStoreId];
  return { url, title, favIconUrl, lastAccessed, cookieStoreId, container: container && { name: container.name, colorCode: container.colorCode } };
}

// Same URL in different containers is a different site; older saves have no container.
function savedKey(item) {
  return `${item.cookieStoreId ?? "firefox-default"} ${item.url}`;
}

function groupMeta({ id, name, stored }) {
  return { id, name, stored };
}

// Newest group first; a site is listed once per group. With join, tabs go into the newest group of that name.
// Resolves to the group's id, name, and time.
function addSaved(name, items, join = false) {
  return loadSaved().then((groups) => {
    let group = join && groups.find((group) => group.name == name);
    if (!group) {
      group = { id: crypto.randomUUID(), name, stored: Date.now(), tabs: [] };
      groups.unshift(group);
    }
    return putInGroup(groups, group, items);
  });
}

// Puts sites back into their group, recreating it in date order if it was emptied.
function putSaved(meta, items) {
  return loadSaved().then((groups) => {
    let group = groups.find((group) => group.id == meta.id);
    if (!group) {
      group = { ...meta, tabs: [] };
      groups.push(group);
      groups.sort((a, b) => b.stored - a.stored);
    }
    return putInGroup(groups, group, items);
  });
}

function putInGroup(groups, group, items) {
  let keys = new Set(items.map(savedKey));
  group.tabs = [...new Map(items.map((item) => [savedKey(item), item])).values(), ...group.tabs.filter((tab) => !keys.has(savedKey(tab)))];
  return browser.storage.local.set({ stored: groups }).then(() => groupMeta(group));
}

// A single saved tab joins its site's group.
function saveTab(tabId) {
  getTabs([tabId]).then((records) => saveAction(getSite(records[0].url), records, true));
}

function findSaved(groupId, keys) {
  return loadSaved().then((groups) => {
    let group = groups.find((group) => group.id == groupId);
    return { meta: groupMeta(group), items: group.tabs.filter((tab) => keys.includes(savedKey(tab))) };
  });
}

// Resolves to records of the tabs that opened.
function openSaved(items) {
  return Promise.allSettled(items.map((item) => createTab({ url: item.url, active: false }, item.cookieStoreId))).then((results) => {
    let failed = items.filter((item, i) => results[i].status == "rejected");
    if (failed.length) {
      alert(`Couldn’t restore:\n${failed.map((item) => item.url).join("\n")}`);
    }
    return results.flatMap((result, i) => result.status == "fulfilled" ? [{ id: result.value.id, key: savedKey(items[i]) }] : []);
  });
}

// Restored sites leave their group.
function restoreSaved(groupId, keys) {
  findSaved(groupId, keys).then(({ meta, items }) => openSaved(items).then((records) => {
    let opened = new Set(records.map((rec) => rec.key));
    let restored = items.filter((item) => opened.has(savedKey(item)));
    if (!restored.length) {
      return;
    }
    let restoredKeys = restored.map(savedKey);
    return removeSaved(meta.id, restoredKeys).then(() => record(
      `Restored ${tabCount(restored.length)}`,
      () => closeTabs(records).then(() => putSaved(meta, restored)),
      () => openSaved(restored).then((fresh) => {
        records = fresh;
        return removeSaved(meta.id, restoredKeys);
      }),
    ));
  }));
}

function deleteSaved(groupId, key) {
  findSaved(groupId, [key]).then(({ meta, items }) => removeSaved(groupId, [key]).then(() => record(
    "Deleted 1 saved site",
    () => putSaved(meta, items),
    () => removeSaved(groupId, [key]),
  )));
}

// Empty groups are dropped.
function removeSaved(groupId, keys) {
  let removed = new Set(keys);
  return loadSaved().then((groups) => browser.storage.local.set({
    stored: groups
      .map((group) => group.id == groupId ? { ...group, tabs: group.tabs.filter((tab) => !removed.has(savedKey(tab))) } : group)
      .filter((group) => group.tabs.length),
  }));
}

function renderSaved() {
  let collapsed = new Set(
    [...document.querySelectorAll(".saved-group:not([open])")].map((group) => group.dataset.id)
  );
  Promise.all([loadSaved(), loadContainers()]).then(([groups]) => {
    document.getElementById("saved-list").replaceChildren(...groups.map((group) => renderSavedGroup(group, collapsed)));
    document.getElementById("saved").hidden = !groups.length;
    applyFilter();
  });
}

function renderSavedGroup(group, collapsed) {
  let tabList = document.createElement("ul");
  tabList.className = "tabs-list";
  for (let tab of group.tabs) {
    // Sites saved before lastAccessed was kept fall back to the group's time.
    tabList.appendChild(renderSavedTab({ lastAccessed: group.stored, ...tab }));
  }
  let h3 = document.createElement("h3");
  h3.textContent = `${group.name} `;
  let count = document.createElement("span");
  count.className = "count";
  let countValue = document.createElement("span");
  countValue.dataset.countOf = "li";
  count.append("(", countValue, ")");
  h3.appendChild(count);
  let time = document.createElement("time");
  time.className = "saved-time";
  time.dateTime = new Date(group.stored).toISOString();
  time.textContent = new Date(group.stored).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  let restoreAll = document.createElement("button");
  restoreAll.className = "restore-all";
  restoreAll.textContent = "Restore all";
  let summary = document.createElement("summary");
  summary.className = "host-header";
  summary.append(h3, time, restoreAll);
  let details = document.createElement("details");
  details.className = "card saved-group";
  details.dataset.id = group.id;
  details.open = !collapsed.has(group.id);
  details.append(summary, tabList);
  return details;
}

function renderSavedTab(tab) {
  let li = document.createElement("li");
  li.dataset.key = savedKey(tab);
  let favicon = document.createElement("img");
  favicon.classList.add("tab-favicon");
  favicon.alt = "";
  setFavicon(favicon, tab.favIconUrl);
  let pTitle = document.createElement("p");
  pTitle.classList.add("tab-title");
  // Prefers the container's current name and color.
  let label = containerLabel(containers[tab.cookieStoreId] ?? tab.container);
  if (label) {
    pTitle.appendChild(label);
  }
  let titleText = document.createElement("span");
  titleText.classList.add("tab-title-text");
  titleText.textContent = tab.title;
  pTitle.appendChild(titleText);
  let pURL = document.createElement("p");
  pURL.classList.add("tab-url");
  pURL.textContent = tab.url;
  let info = document.createElement("div");
  info.classList.add("tab-info");
  info.append(pTitle, pURL);
  li.append(favicon, info, accessedPill(tab.lastAccessed, true));
  let restore = document.createElement("button");
  restore.classList.add("restore-tab");
  restore.textContent = "Restore";
  let remove = document.createElement("button");
  remove.classList.add("close-tab", "delete-saved");
  remove.title = "Delete";
  remove.setAttribute("aria-label", "Delete");
  remove.appendChild(icon(trashPaths));
  li.append(restore, remove);
  return li;
}

// Shows up to 50 tabs closed in the last 7 days, one per site, grouped by site in order of their newest tab; closed windows are left out.
function renderRecentlyClosed() {
  let collapsed = new Set(
    [...document.querySelectorAll(".closed-group:not([open])")].map((group) => group.dataset.host)
  );
  Promise.all([getClosedTabs(), loadContainers(), suffixesReady]).then(([closedTabs]) => {
    let hosts = new Map();
    let seen = new Set();
    for (let tab of closedTabs) {
      if (tab.closedAt < Date.now() - 6048e5) {
        break;
      }
      let key = `${tab.cookieStoreId} ${tab.url}`;
      if (tab.url == "about:newtab" || tab.url.startsWith("about:blank") || seen.has(key)) {
        continue;
      }
      seen.add(key);
      let host = getSite(tab.url);
      if (!hosts.has(host)) {
        hosts.set(host, document.createElement("ul"));
      }
      hosts.get(host).appendChild(renderClosedTab(tab));
      if (seen.size == 50) {
        break;
      }
    }
    let groups = [...hosts].map(([host, tabList]) => renderClosedGroup(host, tabList, collapsed));
    document.getElementById("recently-closed-list").replaceChildren(...groups);
    document.getElementById("recently-closed").hidden = !groups.length;
    applyFilter();
  });
}

// Public Suffix List rules from publicsuffix.org; Unicode rules are stored in the punycode form URLs use.
var suffixes = { rules: new Set(), wildcards: new Set(), exceptions: new Set() };
var suffixesReady = fetch("public_suffix_list.dat").then((res) => res.text()).then((text) => {
  for (let line of text.split("\n")) {
    let rule = line.trim();
    if (!rule || rule.startsWith("//")) {
      continue;
    }
    let set = suffixes.rules;
    if (rule.startsWith("!")) {
      set = suffixes.exceptions;
      rule = rule.slice(1);
    } else if (rule.startsWith("*.")) {
      set = suffixes.wildcards;
      rule = rule.slice(2);
    }
    if (/[^\x00-\x7f]/.test(rule)) {
      rule = new URL(`http://${rule}`).hostname;
    }
    set.add(rule);
  }
}).catch(() => {});

// The registrable domain (mail.google.com → google.com, a.b.co.uk → b.co.uk, foo.github.io stays); each extension has its own host, so their pages share one group.
function getSite(tabUrl) {
  if (tabUrl.startsWith("moz-extension:")) {
    return "moz-extension:";
  }
  let host;
  try {
    host = new URL(tabUrl).hostname;
  } catch {}
  if (!host || /^[\d.]+$|^\[/.test(host)) {
    return getHost(tabUrl);
  }
  let labels = host.split(".");
  // The longest matching rule wins; unlisted endings count as one-label suffixes.
  let suffixLength = 1;
  for (let i = 0; i < labels.length; i++) {
    let rest = labels.slice(i).join(".");
    if (suffixes.exceptions.has(rest)) {
      suffixLength = labels.length - i - 1;
      break;
    }
    if (suffixes.rules.has(rest) || (i + 1 < labels.length && suffixes.wildcards.has(labels.slice(i + 1).join(".")))) {
      suffixLength = labels.length - i;
      break;
    }
  }
  return labels.slice(-Math.min(suffixLength + 1, labels.length)).join(".");
}

function renderClosedGroup(host, tabList, collapsed) {
  tabList.className = "tabs-list";
  let h3 = document.createElement("h3");
  h3.textContent = `${host} `;
  let count = document.createElement("span");
  count.className = "count";
  let countValue = document.createElement("span");
  countValue.dataset.countOf = "li";
  count.append("(", countValue, ")");
  h3.appendChild(count);
  let summary = document.createElement("summary");
  summary.className = "host-header";
  summary.appendChild(h3);
  let group = document.createElement("details");
  group.className = "closed-group";
  group.dataset.host = host;
  group.open = !collapsed.has(host);
  group.append(summary, tabList);
  return group;
}

function renderClosedTab(tab) {
  let li = document.createElement("li");
  li.dataset.sessionId = tab.sessionId;
  let favicon = document.createElement("img");
  favicon.classList.add("tab-favicon");
  favicon.alt = "";
  setFavicon(favicon, tab.favIconUrl);
  let pTitle = document.createElement("p");
  pTitle.classList.add("tab-title");
  let label = containerLabel(containers[tab.cookieStoreId]);
  if (label) {
    pTitle.appendChild(label);
  }
  let titleText = document.createElement("span");
  titleText.classList.add("tab-title-text");
  titleText.textContent = tab.title;
  pTitle.appendChild(titleText);
  let pURL = document.createElement("p");
  pURL.classList.add("tab-url");
  pURL.textContent = tab.url;
  let info = document.createElement("div");
  info.classList.add("tab-info");
  info.append(pTitle, pURL);
  let restore = document.createElement("button");
  restore.classList.add("restore-closed");
  restore.textContent = "Restore";
  li.append(favicon, info, accessedPill(tab.closedAt, true, "Closed"), restore);
  return li;
}

// Reopens in its old spot with its history, then puts this page back in front.
function restoreClosed(sessionId) {
  Promise.all([browser.tabs.getCurrent(), browser.sessions.restore(sessionId)])
    .then(([self, session]) => getTabs([session.tab.id]).then((records) => {
      record("Restored 1 tab", () => closeTabs(records), () => reopenTabs(records));
      return self && browser.tabs.update(self.id, { active: true });
    }));
}

// Unloads every open tab in the button's section; Firefox skips active tabs.
function unloadGroup(button) {
  let tabIds = [...button.closest("details").querySelectorAll("li:not(.deleted-tab, .discarded-tab, .pinned-tab, .filtered-out)")]
    .map((li) => +li.getAttribute("data-tabid"));
  browser.tabs.discard([...new Set(tabIds)]);
}

document.addEventListener("click", (e) => {
  if (e.target.closest(".copy-processes")) {
    navigator.clipboard.writeText("about:processes")
      .then(() => showToast("Copied about:processes"), () => showToast("Couldn’t copy"));
    return;
  }
  let toastAction = e.target.closest(".toast-action");
  if (toastAction) {
    toastAction.textContent == "Undo" ? undo() : redo();
    return;
  }
  let toggle = e.target.closest(".toggle-groups");
  if (toggle) {
    // Keep the button from toggling the section.
    e.preventDefault();
    // Collapses every card if any is open, otherwise expands them all.
    let groups = toggleGroups(toggle);
    let open = !groups.some((group) => group.open);
    for (let group of groups) {
      group.open = open;
    }
    updateToggleLabel();
    return;
  }
  let saveAll = e.target.closest(".save-all");
  if (saveAll) {
    // Keep the button from toggling the section.
    e.preventDefault();
    saveGroup(saveAll.closest("details"));
    return;
  }
  let restoreAll = e.target.closest(".restore-all");
  if (restoreAll) {
    e.preventDefault();
    let group = restoreAll.closest(".saved-group");
    restoreSaved(group.dataset.id, [...group.querySelectorAll("li:not(.filtered-out)")].map((li) => li.dataset.key));
    return;
  }
  let restore = e.target.closest(".restore-tab");
  if (restore) {
    restoreSaved(restore.closest(".saved-group").dataset.id, [restore.closest("li").dataset.key]);
    return;
  }
  let remove = e.target.closest(".delete-saved");
  if (remove) {
    deleteSaved(remove.closest(".saved-group").dataset.id, remove.closest("li").dataset.key);
    return;
  }
  let reopen = e.target.closest(".restore-closed");
  if (reopen) {
    restoreClosed(reopen.closest("li").dataset.sessionId);
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
  if (elt == null || !elt.dataset.tabid || elt.classList.contains("deleted-tab") || e.target.closest("button:disabled")) {
    return;
  }
  let tabId = +elt.getAttribute("data-tabid");
  if (e.target.closest(".close-tab")) {
    // The onRemoved handler marks the tab as deleted.
    getTabs([tabId]).then(closeAction);
  } else if (e.target.closest(".save-tab")) {
    saveTab(tabId);
  } else if (e.target.closest(".mute-tab")) {
    browser.tabs.get(tabId).then((tab) => browser.tabs.update(tabId, { muted: !tab.mutedInfo.muted }));
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
  li.dataset.windowid = tab.windowId;
  li.classList.toggle("discarded-tab", tab.discarded);
  li.classList.toggle("active-tab", tab.active);
  li.classList.toggle("self-tab", tab.url == location.href);
  var favicon = document.createElement("img");
  favicon.classList.add("tab-favicon");
  favicon.alt = "";
  setFavicon(favicon, tab.favIconUrl);
  li.appendChild(favicon);
  var pTitle = document.createElement("p");
  pTitle.classList.add("tab-title");
  let label = containerLabel(containers[tab.cookieStoreId]);
  if (label) {
    pTitle.appendChild(label);
  }
  // Shown by CSS while the tab is pinned or discarded.
  let pinnedBadge = document.createElement("span");
  pinnedBadge.classList.add("tab-badge", "tab-pinned");
  pinnedBadge.textContent = "Pinned";
  let unloadedBadge = document.createElement("span");
  unloadedBadge.classList.add("tab-badge", "tab-unloaded");
  unloadedBadge.append(icon(zzzPaths), "Unloaded");
  pTitle.append(pinnedBadge, unloadedBadge);
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
  unload.title = "Unload";
  unload.setAttribute("aria-label", "Unload");
  unload.appendChild(icon(zzzPaths));
  var close = document.createElement("button");
  close.classList.add("close-tab");
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.appendChild(icon(trashPaths));
  var save = document.createElement("button");
  save.classList.add("save-tab");
  save.title = "Save";
  save.setAttribute("aria-label", "Save");
  save.appendChild(icon(floppyPaths));
  li.appendChild(info);
  let accessed = accessedPill(tab.lastAccessed);
  if (accessed) {
    li.appendChild(accessed);
  }
  if (tab.audible) {
    let mute = document.createElement("button");
    mute.classList.add("mute-tab");
    li.appendChild(mute);
    setMuted(li, tab.mutedInfo.muted);
  }
  li.appendChild(unload);
  li.appendChild(save);
  li.appendChild(close);
  setPinned(li, tab.pinned);
  return li;
}

var trashPaths = ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"];
var zzzPaths = ["M3 12h7l-7 8h7", "M12 6h5l-5 6h5", "M18 2h3l-3 4h3"];
var mergePaths = ["M3 5h4l5 7h9", "M3 19h4l5-7", "M17 8l4 4-4 4"];
var windowPaths = ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 9h18"];
var floppyPaths = ["M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z", "M17 21v-8H7v8", "M7 3v5h8"];

function icon(paths) {
  let ns = "http://www.w3.org/2000/svg";
  let svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (let d of paths) {
    let path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function containerLabel(container) {
  if (!container) {
    return;
  }
  let label = document.createElement("span");
  label.classList.add("tab-container");
  label.style.setProperty("--container-color", container.colorCode);
  label.textContent = container.name;
  return label;
}

// Icons extension pages can't load (like chrome:// ones) leave an empty slot.
function setFavicon(img, url) {
  img.onerror = () => img.removeAttribute("src");
  if (url) {
    img.src = url;
  } else {
    img.removeAttribute("src");
  }
}

function setMuted(li, muted) {
  let mute = li.querySelector(".mute-tab");
  if (mute) {
    mute.textContent = muted ? "Unmute" : "Mute";
  }
}

// Pinned tabs can't be closed, unloaded, or moved from here, but can be muted; this page can't save itself.
function setPinned(li, pinned) {
  li.classList.toggle("pinned-tab", pinned);
  for (let button of li.querySelectorAll("button:not(.mute-tab)")) {
    button.disabled = pinned || (button.matches(".save-tab") && li.classList.contains("self-tab"));
  }
}

var relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
var timeUnits = [["year", 31536e6, "y"], ["month", 2592e6, "mo"], ["week", 6048e5, "w"], ["day", 864e5, "d"], ["hour", 36e5, "h"], ["minute", 6e4, "m"]];
// Without always, only times a week or more ago get a label.
function formatAgo(timestamp, always = false) {
  let elapsed = Date.now() - timestamp;
  for (let [unit, ms, abbr] of timeUnits) {
    if (!always && ms < 6048e5) {
      return;
    }
    if (elapsed >= ms) {
      let n = Math.floor(elapsed / ms);
      return { short: `${n}${abbr}`, long: relativeTime.format(-n, unit) };
    }
  }
  return { short: "now", long: relativeTime.format(0, "second") };
}

function accessedPill(timestamp, always = false, verb = "Last used") {
  let ago = formatAgo(timestamp, always);
  if (!ago) {
    return;
  }
  let accessed = document.createElement("time");
  accessed.classList.add("tab-accessed");
  accessed.dateTime = new Date(timestamp).toISOString();
  accessed.title = `${verb} ${ago.long} (${new Date(timestamp).toLocaleString()})`;
  accessed.textContent = ago.short;
  return accessed;
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
  document.querySelector(".version").textContent = `v${browser.runtime.getManifest().version}`;
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
  document.getElementById("filter").addEventListener("input", () => {
    applyFilter();
    openForFilter();
  });
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
  renderSaved();
  renderRecentlyClosed();
});

browser.sessions.onChanged.addListener(renderRecentlyClosed);

browser.storage.onChanged.addListener((changes) => {
  if (changes.stored) {
    renderSaved();
  }
  // The log can land after Firefox reports the close.
  if (changes.closedContainers) {
    renderRecentlyClosed();
  }
});

// Text fields keep their own undo.
document.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.target.closest("input, select, textarea")) {
    return;
  }
  let key = e.key.toLowerCase();
  if (key == "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key == "z" && e.shiftKey) || key == "y") {
    e.preventDefault();
    redo();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState == "visible") {
    updateTabsLists();
    renderRecentlyClosed();
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  for (let elt of tabItems(tabId)) {
    elt.classList.add("deleted-tab");
  }
  updateCounts();
});

browser.tabs.onCreated.addListener(scheduleRender);
// Moving a tab to another window changes the window count.
browser.tabs.onAttached.addListener(scheduleRender);

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
  if (changeInfo.url || changeInfo.pinned != null || changeInfo.audible != null) {
    // A new URL can change the tab's groups; pinning changes its position; audio changes its sections.
    scheduleRender();
    return;
  }
  for (let elt of tabItems(tabId)) {
    elt.querySelector(".tab-title-text").textContent = tab.title;
    if (changeInfo.favIconUrl != null) {
      setFavicon(elt.querySelector(".tab-favicon"), tab.favIconUrl);
    }
    elt.classList.toggle("discarded-tab", tab.discarded);
    setPinned(elt, tab.pinned);
    setMuted(elt, tab.mutedInfo.muted);
  }
  applyFilter();
}, { properties: ["title", "url", "discarded", "pinned", "favIconUrl", "audible", "mutedInfo"] });
