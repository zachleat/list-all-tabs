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
      h3.textContent = `${host} `;
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
      count.append("(", countValue, loadedCount, unloadedCount, ")");
      h3.appendChild(count);
      let unloadAll = document.createElement("button");
      unloadAll.className = "unload-all";
      unloadAll.title = "Unload all";
      unloadAll.setAttribute("aria-label", "Unload all");
      unloadAll.append(icon(zzzPaths));
      let moveAll = document.createElement("button");
      moveAll.className = "move-all";
      moveAll.append(icon(mergePaths), "Merge");
      moveAll.title = "Move these tabs into one new window";
      moveAll.addEventListener("click", (e) => {
        e.preventDefault();
        moveGroup(tabList);
      });
      let saveAll = document.createElement("button");
      saveAll.className = "save-all";
      saveAll.title = "Save all: close these tabs and keep them under Saved";
      saveAll.setAttribute("aria-label", "Save all");
      saveAll.append(icon(floppyPaths));
      let closeAll = document.createElement("button");
      closeAll.className = "close-tab";
      closeAll.title = "Close all";
      closeAll.setAttribute("aria-label", "Close all");
      closeAll.append(icon(trashPaths));
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

    applyFilter();
  });
}

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
  for (let group of document.querySelectorAll(".host-group, .saved-group")) {
    group.classList.toggle("filtered-out", !group.querySelector("li:not(.filtered-out)"));
    group.classList.toggle("hidden-tab", !group.querySelector("li:not(.filtered-out, .hidden-tab)"));
  }
  updateCounts();
}

// Counts are scoped to the enclosing section; closed and filtered tabs are not counted, hidden ones are.
function countItems(count) {
  let items = count.closest("details").querySelectorAll(`${count.dataset.countOf}:not(.deleted-tab, .filtered-out)`);
  // A tab listed twice in one section (like in both Important cards) counts once.
  return new Set([...items].map((item) => item.dataset.tabid ?? item)).size;
}

// data-count-hide-same hides a count that matches the total just before it.
function updateCounts() {
  for (let count of document.querySelectorAll("[data-count-of]")) {
    let total = countItems(count);
    let unit = count.dataset.countUnit;
    let icon = count.dataset.countIcon;
    count.hidden = ("countHideZero" in count.dataset && total == 0) ||
      ("countHideSame" in count.dataset && total == countItems(count.previousElementSibling));
    if (unit) {
      count.textContent = `${total} ${unit}${total == 1 ? "" : "s"}`;
    } else if (icon) {
      let iconSpan = document.createElement("span");
      iconSpan.className = "count-icon";
      iconSpan.textContent = icon;
      count.replaceChildren(iconSpan, ` ${total}`);
    } else {
      count.textContent = total;
    }
  }
}

function closeGroup(name, tabList) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
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
    let tabIds = [...tabList.querySelectorAll("li:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
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

// Closes the section's tabs after saving them as one Saved group.
function saveGroup(section) {
  browser.tabs.getCurrent().then((self) => {
    let tabIds = [...new Set(
      [...section.querySelectorAll("li[data-tabid]:not(.deleted-tab, .pinned-tab, .filtered-out, .hidden-tab)")]
        .map((li) => +li.dataset.tabid)
        .filter((id) => id != self?.id)
    )];
    let name = section.dataset.host ?? "All tabs";
    let noun = tabIds.length == 1 ? "tab" : "tabs";
    if (tabIds.length == 0 || !confirm(`Save ${tabIds.length} ${noun} from ${name}? They’ll close and be listed under Saved.`)) {
      return;
    }
    return Promise.all(tabIds.map((id) => browser.tabs.get(id)))
      .then((tabs) => addSaved(name, tabs))
      .then(() => browser.tabs.remove(tabIds));
  });
}

// The "stored" key dates from when this feature was called Store.
function loadSaved() {
  return browser.storage.local.get({ stored: [] }).then((data) => data.stored);
}

// Newest group first; a URL is listed once per group. With join, tabs go into the newest group of that name.
function addSaved(name, tabs, join = false) {
  let unique = new Map(tabs.map(({ url, title, favIconUrl, lastAccessed }) => [url, { url, title, favIconUrl, lastAccessed }]));
  return loadSaved().then((groups) => {
    let existing = join && groups.find((group) => group.name == name);
    if (existing) {
      existing.tabs = [...unique.values(), ...existing.tabs.filter((tab) => !unique.has(tab.url))];
    } else {
      groups.unshift({ id: crypto.randomUUID(), name, stored: Date.now(), tabs: [...unique.values()] });
    }
    return browser.storage.local.set({ stored: groups });
  });
}

// A single saved tab joins its host's group.
function saveTab(tabId) {
  browser.tabs.get(tabId)
    .then((tab) => addSaved(getHost(tab.url), [tab], true))
    .then(() => browser.tabs.remove(tabId));
}

// Restored URLs leave their group.
function restoreTabs(groupId, urls) {
  Promise.allSettled(urls.map((url) => browser.tabs.create({ url, active: false }))).then((results) => {
    let failed = urls.filter((url, i) => results[i].status == "rejected");
    if (failed.length) {
      alert(`Couldn’t restore:\n${failed.join("\n")}`);
    }
    return removeSaved(groupId, urls.filter((url) => !failed.includes(url)));
  });
}

// Empty groups are dropped.
function removeSaved(groupId, urls) {
  let removed = new Set(urls);
  return loadSaved().then((groups) => browser.storage.local.set({
    stored: groups
      .map((group) => group.id == groupId ? { ...group, tabs: group.tabs.filter((tab) => !removed.has(tab.url)) } : group)
      .filter((group) => group.tabs.length),
  }));
}

function renderSaved() {
  let collapsed = new Set(
    [...document.querySelectorAll(".saved-group:not([open])")].map((group) => group.dataset.id)
  );
  loadSaved().then((groups) => {
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
  let resaveAll = document.createElement("button");
  resaveAll.className = "resave-all";
  resaveAll.textContent = "Restore all";
  let summary = document.createElement("summary");
  summary.className = "host-header";
  summary.append(h3, time, resaveAll);
  let details = document.createElement("details");
  details.className = "card saved-group";
  details.dataset.id = group.id;
  details.open = !collapsed.has(group.id);
  details.append(summary, tabList);
  return details;
}

function renderSavedTab(tab) {
  let li = document.createElement("li");
  li.dataset.url = tab.url;
  let favicon = document.createElement("img");
  favicon.classList.add("tab-favicon");
  favicon.alt = "";
  setFavicon(favicon, tab.favIconUrl);
  let pTitle = document.createElement("p");
  pTitle.classList.add("tab-title");
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

// Unloads every open tab in the button's section; Firefox skips active tabs.
function unloadGroup(button) {
  let tabIds = [...button.closest("details").querySelectorAll("li:not(.deleted-tab, .discarded-tab, .pinned-tab, .filtered-out)")]
    .map((li) => +li.getAttribute("data-tabid"));
  browser.tabs.discard([...new Set(tabIds)]);
}

document.addEventListener("click", (e) => {
  let toggle = e.target.closest("[data-hosts-open]");
  if (toggle) {
    // Keep the button from toggling the section.
    e.preventDefault();
    for (let group of document.querySelectorAll(".host-group")) {
      group.open = toggle.dataset.hostsOpen == "true";
    }
    return;
  }
  let saveAll = e.target.closest(".save-all");
  if (saveAll) {
    // Keep the button from toggling the section.
    e.preventDefault();
    saveGroup(saveAll.closest("details"));
    return;
  }
  let resaveAll = e.target.closest(".resave-all");
  if (resaveAll) {
    e.preventDefault();
    let group = resaveAll.closest(".saved-group");
    restoreTabs(group.dataset.id, [...group.querySelectorAll("li:not(.filtered-out)")].map((li) => li.dataset.url));
    return;
  }
  let restore = e.target.closest(".restore-tab");
  if (restore) {
    restoreTabs(restore.closest(".saved-group").dataset.id, [restore.closest("li").dataset.url]);
    return;
  }
  let remove = e.target.closest(".delete-saved");
  if (remove) {
    removeSaved(remove.closest(".saved-group").dataset.id, [remove.closest("li").dataset.url]);
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
    browser.tabs.remove(tabId);
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
  li.classList.toggle("discarded-tab", tab.discarded);
  li.classList.toggle("active-tab", tab.active);
  var favicon = document.createElement("img");
  favicon.classList.add("tab-favicon");
  favicon.alt = "";
  setFavicon(favicon, tab.favIconUrl);
  li.appendChild(favicon);
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
  let pinnedBadge = document.createElement("span");
  pinnedBadge.classList.add("tab-badge", "tab-pinned");
  pinnedBadge.textContent = "Pinned";
  let unloadedBadge = document.createElement("span");
  unloadedBadge.classList.add("tab-badge", "tab-unloaded");
  unloadedBadge.title = "Unloaded";
  unloadedBadge.setAttribute("role", "img");
  unloadedBadge.setAttribute("aria-label", "Unloaded");
  unloadedBadge.appendChild(icon(zzzPaths));
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

// Pinned tabs can't be closed, unloaded, or moved from here, but can be muted.
function setPinned(li, pinned) {
  li.classList.toggle("pinned-tab", pinned);
  for (let button of li.querySelectorAll("button:not(.mute-tab)")) {
    button.disabled = pinned;
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

function accessedPill(timestamp, always = false) {
  let ago = formatAgo(timestamp, always);
  if (!ago) {
    return;
  }
  let accessed = document.createElement("time");
  accessed.classList.add("tab-accessed");
  accessed.dateTime = new Date(timestamp).toISOString();
  accessed.title = `Last used ${ago.long} (${new Date(timestamp).toLocaleString()})`;
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
  renderSaved();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.stored) {
    renderSaved();
  }
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
