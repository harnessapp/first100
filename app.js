let rawPayload = null;
let filteredMeetings = [];
let selectedState = "";
let selectedMeetingKey = "";
let selectedRaceKey = "";
let selectedMetric = "weighted";
let selectedDistance = "100";

let playTimer = null;
let playRaf = null;
let isPlaying = false;

let currentMap = {
  container: null,
  mapEl: null,
  track: null,
  post: null,
  postLabel: null,
  runnersByKey: {}
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./data/first100.json");
    if (!response.ok) {
      throw new Error(`Failed to load first100.json (${response.status})`);
    }

    rawPayload = await response.json();

    document.getElementById("meetingSelect").addEventListener("change", (e) => {
      stopPlay();
      selectedMeetingKey = e.target.value;
      selectedRaceKey = "";
      rebuildRaceOptions();
    });

    document.querySelectorAll("[data-metric]").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopPlay();
        selectedMetric = btn.dataset.metric || "weighted";

        document.querySelectorAll("[data-metric]").forEach((b) => {
          b.classList.toggle("active", b.dataset.metric === selectedMetric);
        });

        renderSelectedRace();
      });
    });

    document.querySelectorAll("[data-distance]").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopPlay();
        setSelectedDistance(btn.dataset.distance || "100");
      });
    });

    const playBtn = document.getElementById("playToggle");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        playDistances();
      });
    }

    selectedState = "QLD";

    buildStateOptions();
    rebuildMeetingOptions();
    updatePlayButton();
  } catch (err) {
    console.error(err);
    document.getElementById("raceTitle").textContent = "Load error";
    document.getElementById("mapContainer").innerHTML =
      `<div class="empty">Failed to load data: ${err.message}</div>`;
  }
});

function buildStateOptions() {
  const container = document.getElementById("stateTabs");
  const states = Array.isArray(rawPayload?.states) ? rawPayload.states : [];
  container.innerHTML = "";

  const allBtn = makeStateBtn("ALL", "");
  if (!selectedState) allBtn.classList.add("active");
  container.appendChild(allBtn);

  for (const state of states) {
    const btn = makeStateBtn(state, state);
    if (state === selectedState) btn.classList.add("active");
    container.appendChild(btn);
  }
}

function makeStateBtn(label, value) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "state-tab";
  btn.textContent = label;

  btn.addEventListener("click", () => {
    stopPlay();
    selectedState = value;
    selectedMeetingKey = "";
    selectedRaceKey = "";
    buildStateOptions();
    rebuildMeetingOptions();
  });

  return btn;
}

function rebuildMeetingOptions() {
  const meetingSelect = document.getElementById("meetingSelect");
  const meetings = Array.isArray(rawPayload?.meetings) ? rawPayload.meetings : [];

  filteredMeetings = meetings.filter((m) => {
    if (!selectedState) return true;
    return (m.state || "") === selectedState;
  });

  meetingSelect.innerHTML = "";

  if (!filteredMeetings.length) {
    document.getElementById("raceTabs").innerHTML = "";
    document.getElementById("raceTitle").textContent = "No meeting selected";
    resetMapContainer(`<div class="empty">(no meetings found)</div>`);
    return;
  }

  for (const meeting of filteredMeetings) {
    const option = document.createElement("option");
    option.value = meeting.meetingKey;
    option.textContent = meeting.meetingLabel;
    meetingSelect.appendChild(option);
  }

  selectedMeetingKey = filteredMeetings.some((m) => m.meetingKey === selectedMeetingKey)
    ? selectedMeetingKey
    : filteredMeetings[0].meetingKey;

  meetingSelect.value = selectedMeetingKey;
  rebuildRaceOptions();
}

function rebuildRaceOptions() {
  const raceTabs = document.getElementById("raceTabs");
  const meeting = filteredMeetings.find((m) => m.meetingKey === selectedMeetingKey);

  raceTabs.innerHTML = "";

  if (!meeting || !Array.isArray(meeting.races) || !meeting.races.length) {
    document.getElementById("raceTitle").textContent = "No race selected";
    resetMapContainer(`<div class="empty">(no races found)</div>`);
    return;
  }

  const sortedRaces = [...meeting.races].sort(
    (a, b) => raceNoSortValue(a.raceNo) - raceNoSortValue(b.raceNo)
  );

  selectedRaceKey = sortedRaces.some((r) => r.raceKey === selectedRaceKey)
    ? selectedRaceKey
    : sortedRaces[0].raceKey;

  for (const race of sortedRaces) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "race-tab";

    if (race.raceKey === selectedRaceKey) {
      btn.classList.add("active");
    }

    btn.textContent = race.raceNo || "?";

    btn.addEventListener("click", () => {
      stopPlay();
      selectedRaceKey = race.raceKey;
      rebuildRaceOptions();
      renderSelectedRace();
    });

    raceTabs.appendChild(btn);
  }

  renderSelectedRace();
}

function getCurrentMeeting() {
  return filteredMeetings.find((m) => m.meetingKey === selectedMeetingKey) || null;
}

function getCurrentRace() {
  const meeting = getCurrentMeeting();
  if (!meeting) return null;

  const sortedRaces = [...meeting.races].sort(
    (a, b) => raceNoSortValue(a.raceNo) - raceNoSortValue(b.raceNo)
  );

  return sortedRaces.find((r) => r.raceKey === selectedRaceKey) || null;
}

function setRaceTitle(text) {
  document.getElementById("raceTitle").textContent = text;
}

function renderSelectedRace() {
  const meeting = getCurrentMeeting();
  const race = getCurrentRace();
  if (!meeting || !race) return;

  setRaceTitle(`${buildRaceTitle(meeting, race)} — ${distanceTitle()} ${metricTitle()}`);
  renderEarlySpeedMap(race, selectedDistance);
}

function buildRaceTitle(meeting, race) {
  const venue = race.venue || meeting.venue || "";
  const raceNo = race.raceNo ? `R${race.raceNo}` : "";
  const raceName = race.raceName || "";
  const distance = race.distance ? `${race.distance}m` : "";
  const start = race.start || "";
  const time = race.time || "";

  return [venue, raceNo, raceName ? `- ${raceName}` : "", distance, start, time]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function raceNoSortValue(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 9999;
}

function currentPrefix(distanceOverride = null) {
  const d = distanceOverride || selectedDistance;
  return `F${d}`;
}

function metricValueKey(distanceOverride = null) {
  const prefix = currentPrefix(distanceOverride);

  switch (selectedMetric) {
    case "fast":
      return `${prefix}Fast`;
    case "avg123":
      return `${prefix}Avg123`;
    case "last5":
      return `${prefix}Last5`;
    case "avg":
      return `${prefix}Avg`;
    case "med":
      return `${prefix}Med`;
    case "weighted":
    default:
      return null;
  }
}

function metricQtyKey(distanceOverride = null) {
  const prefix = currentPrefix(distanceOverride);

  switch (selectedMetric) {
    case "fast":
      return `${prefix}FastQty`;
    case "avg123":
      return `${prefix}Avg123Qty`;
    case "last5":
      return `${prefix}Last5Qty`;
    case "avg":
      return `${prefix}AvgQty`;
    case "med":
      return `${prefix}Qty`;
    case "weighted":
    default:
      return null;
  }
}

function weightedMetric(r, distanceOverride = null) {
  const prefix = currentPrefix(distanceOverride);

  const components = [
    { value: Number(r[`${prefix}Med`]), weight: 0.30, qty: Number(r[`${prefix}Qty`]) },
    { value: Number(r[`${prefix}Fast`]), weight: 0.10, qty: Number(r[`${prefix}FastQty`]) },
    { value: Number(r[`${prefix}Avg123`]), weight: 0.25, qty: Number(r[`${prefix}Avg123Qty`]) },
    { value: Number(r[`${prefix}Last5`]), weight: 0.25, qty: Number(r[`${prefix}Last5Qty`]) },
    { value: Number(r[`${prefix}Avg`]), weight: 0.10, qty: Number(r[`${prefix}AvgQty`]) }
  ];

  const valid = components.filter(
    (c) => Number.isFinite(c.value) && Number.isFinite(c.qty) && c.qty > 0
  );

  if (!valid.length) {
    return { value: NaN, qty: 0 };
  }

  const totalWeight = valid.reduce((sum, c) => sum + c.weight, 0);
  const weightedValue =
    valid.reduce((sum, c) => sum + (c.value * c.weight), 0) / totalWeight;

  const qty = Math.max(...valid.map((c) => c.qty));

  return {
    value: Number(weightedValue.toFixed(2)),
    qty
  };
}

function getMetricForRunner(r, distanceOverride = null) {
  if (selectedMetric === "weighted") {
    return weightedMetric(r, distanceOverride);
  }

  const valueKey = metricValueKey(distanceOverride);
  const qtyKey = metricQtyKey(distanceOverride);

  return {
    value: Number(r[valueKey]),
    qty: Number(r[qtyKey])
  };
}

function metricTitle() {
  switch (selectedMetric) {
    case "weighted": return "Weighted";
    case "fast": return "Fastest";
    case "avg123": return "Average FR1-3";
    case "last5": return "Last 5";
    case "avg": return "Average";
    case "med": return "Median";
    default: return "Weighted";
  }
}

function metricLabel() {
  switch (selectedMetric) {
    case "weighted": return "Weighted";
    case "fast": return "Fast";
    case "avg123": return "Avg FR1-3";
    case "last5": return "Last 5";
    case "avg": return "Avg";
    case "med": return "Med";
    default: return "Weighted";
  }
}

function distanceTitle(distanceOverride = null) {
  return `${distanceOverride || selectedDistance}m`;
}

function getPostX(distanceOverride = null) {
  const d = distanceOverride || selectedDistance;

  switch (d) {
    case "50":
      return 260;
    case "100":
      return 520;
    case "200":
      return 1000;
    default:
      return 760;
  }
}

function setSelectedDistance(distance) {
  selectedDistance = distance;

  document.querySelectorAll("[data-distance]").forEach((b) => {
    b.classList.toggle("active", b.dataset.distance === selectedDistance);
  });

  renderSelectedRace();
}

function stopPlay() {
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  if (playRaf) {
    cancelAnimationFrame(playRaf);
    playRaf = null;
  }

  isPlaying = false;

  if (currentMap.post) currentMap.post.style.opacity = "1";
  if (currentMap.postLabel) currentMap.postLabel.style.opacity = "1";

  restoreMapTransitions();
  updatePlayButton();
}

function updatePlayButton() {
  const btn = document.getElementById("playToggle");
  if (!btn) return;

  btn.textContent = isPlaying ? "Pause" : "▶ Play";
  btn.classList.toggle("active", isPlaying);
}

function resetMapContainer(html) {
  const container = document.getElementById("mapContainer");
  container.innerHTML = html;
  currentMap = {
    container: null,
    mapEl: null,
    track: null,
    post: null,
    postLabel: null,
    runnersByKey: {}
  };
}

function ensureMapShell() {
  const container = document.getElementById("mapContainer");

  if (currentMap.container === container && currentMap.mapEl && currentMap.track) {
    return;
  }

  container.innerHTML = "";

  const mapEl = document.createElement("div");
  mapEl.className = "speed-map";

  mapEl.innerHTML = `
    <div class="map-track">
      <div class="map-post"></div>
      <div class="map-post-label"></div>
    </div>
  `;

  container.appendChild(mapEl);

  currentMap = {
    container,
    mapEl,
    track: mapEl.querySelector(".map-track"),
    post: mapEl.querySelector(".map-post"),
    postLabel: mapEl.querySelector(".map-post-label"),
    runnersByKey: {}
  };
}

function runnerKey(r) {
  return `${r.no}__${r.name}`;
}

function createRunnerElement(r) {
  const el = document.createElement("div");
  el.className = "map-runner";
  el.dataset.runnerKey = runnerKey(r);

el.innerHTML = `
  <div class="horse-wrap">
    <div class="cloth cloth-${r.no}">${r.no}</div>
    <img class="horse-icon" src="horse.png" alt="">
  </div>
  <div class="tooltip">
    <div class="tooltip-title"></div>
    <div class="tooltip-body pace-line"></div>
    <div class="tooltip-body metric-line"></div>
    <div class="tooltip-body driver-line"></div>
  </div>
`;

  const tip = el.querySelector(".tooltip");
  el.addEventListener("mouseenter", () => {
    tip.style.display = "block";
    tip.style.left = "78px";
    tip.style.top = "-8px";
  });
  el.addEventListener("mouseleave", () => {
    tip.style.display = "none";
  });

  return el;
}

function updateRunnerElement(el, r, distanceForTooltip = null) {
  el.classList.toggle("unknown", !r.isKnown);

  // Always reset pace classes first
  el.classList.remove("pace-green", "pace-red", "pace-yellow");

  // Only apply pace colouring if the runner has real data
  if (r.isKnown) {
    const paceClass = getPaceClass(r);
    if (paceClass) {
      el.classList.add(paceClass);
    }
  }
  const cloth = el.querySelector(".cloth");
  cloth.className = `cloth cloth-${r.no}`;
  cloth.textContent = r.no;

  el.querySelector(".tooltip-title").textContent = `${r.no}. ${r.name} (${r.barrier})`;

  const ld = formatPct(r.ldPct);
  const bl = formatPct(r.blPct);
  const dth = formatPct(r.dthPct);

  const paceParts = [];
  if (ld) paceParts.push(`Ld ${ld}`);
  if (bl) paceParts.push(`BL ${bl}`);
  if (dth) paceParts.push(`Dth ${dth}`);

  el.querySelector(".pace-line").textContent = paceParts.join(" | ");

  el.querySelector(".metric-line").textContent =
    `${distanceTitle(distanceForTooltip)} ${metricLabel()}: ${r.isKnown ? r.med.toFixed(2) : "-"} (n=${r.qty || 0})`;

  el.querySelector(".driver-line").textContent = `Dr: ${r.driver || "-"}`;

  el.style.left = `${r.displayX}px`;
  el.style.top = `${r.displayY}px`;
}

function disableMapTransitions() {
  Object.values(currentMap.runnersByKey).forEach((el) => {
    el.style.transition = "none";
  });
  if (currentMap.post) currentMap.post.style.transition = "none";
  if (currentMap.postLabel) currentMap.postLabel.style.transition = "none";
}

function restoreMapTransitions() {
  Object.values(currentMap.runnersByKey).forEach((el) => {
    el.style.transition = "";
  });
  if (currentMap.post) currentMap.post.style.transition = "";
  if (currentMap.postLabel) currentMap.postLabel.style.transition = "";
}

function computeRaceLayout(race, distanceOverride) {
  const start = String(race.start || race.Start || "").toUpperCase();
  if (start !== "MOBILE") {
    return { error: "(only mobile-start races shown)" };
  }

const runners = (race.runners || []).map((r) => {
  const metric = getMetricForRunner(r, distanceOverride);

  return {
    no: Number(r["Horse No"] ?? r.no),
    name: r["Horse"] ?? r.name,
    barrier: r["Barrier"] ?? r.barrier,
    driver: r["Driver"] ?? r.driver,
    ldPct: Number(r["LdPct"]),
    blPct: Number(r["BLPct"]),
    dthPct: Number(r["DthPct"]),
    med: metric.value,
    qty: metric.qty
  };
}).filter((r) => r.barrier && r.barrier !== "SCR");


  if (!runners.length) {
    return { error: "(no runners)" };
  }

  const valid = runners.filter((r) => Number.isFinite(r.med) && r.qty > 0);
  const hasKnownData = valid.length > 0;

  const PX_PER_METRE = 11;
  const LANE_GAP = 52;
  const UNKNOWN_BACK_MARKER_M = 6;
  const HORSE_WIDTH_PX = 96;
  const SAME_LANE_Y_OFFSET = -14;
  const POST_X = getPostX(distanceOverride);

  const fastest = hasKnownData ? Math.min(...valid.map((r) => r.med)) : null;

  const parseBarrier = (b) => {
    const m = String(b || "").trim().toUpperCase().match(/(FR|SR)(\d+)/);
    return m ? { row: m[1], slot: parseInt(m[2], 10) } : { row: "", slot: null };
  };

  const knownGaps = hasKnownData ? valid.map((r) => (r.med - fastest) * 14.5) : [];
  const slowestKnownGap = hasKnownData ? Math.max(...knownGaps) : 0;

  const frMap = {};
  const srList = [];

  runners.forEach((r) => {
    const p = parseBarrier(r.barrier);
    r.row = p.row;
    r.slot = p.slot;

    r.isKnown = Number.isFinite(r.med) && r.qty > 0;

    if (hasKnownData) {
      if (r.isKnown) {
        r.rawGap = (r.med - fastest) * 14.5;
      } else {
        r.rawGap = slowestKnownGap + UNKNOWN_BACK_MARKER_M;
      }
    } else {
      // Whole race has no sectional data:
      // keep runners visible in a simple greyed-out formation
      if (r.row === "FR") {
        r.rawGap = 0;
      } else {
        r.rawGap = UNKNOWN_BACK_MARKER_M;
      }
    }

    const laneY = (r.slot || 1) * LANE_GAP;
    r.displayY = laneY + SAME_LANE_Y_OFFSET;

    if (r.row === "FR") {
      r.displayX = POST_X - (r.rawGap * PX_PER_METRE);
      frMap[r.slot] = r;
    } else {
      srList.push(r);
    }
  });

  srList.forEach((r) => {
    const fr = frMap[r.slot];
    const rawX = POST_X - (r.rawGap * PX_PER_METRE);

    if (fr) {
      const actualGapPx = Math.max(0, (r.rawGap - fr.rawGap) * PX_PER_METRE);
      const requiredBehindPx = HORSE_WIDTH_PX + actualGapPx;

      r.displayX = fr.displayX - requiredBehindPx;
      r.displayY = fr.displayY;
    } else {
      r.displayX = rawX;
    }
  });

  const runnersByKey = {};
  runners.forEach((r) => {
    runnersByKey[runnerKey(r)] = r;
  });

  return {
    distance: distanceOverride,
    postX: POST_X,
    runners,
    runnersByKey
  };
}

function getPaceClass(r) {
  const ld = Number(r.ldPct);
  const bl = Number(r.blPct);
  const dth = Number(r.dthPct);

  if (ld >= 15) return "pace-green";

  if (dth >= 15 && ld < 15) return "pace-red";

  if (bl >= 15 && ld < 15 && dth < 15) return "pace-yellow";

  return "";
}

function syncMapToLayout(layout, labelText = null, tooltipDistance = null) {
  ensureMapShell();

  // Find right-most horse
  const maxX = Math.max(...layout.runners.map(r => r.displayX));

  // Offset so post sits just to the right
  const POST_OFFSET = 140; // tweak this if needed

  const dynamicPostX = maxX + POST_OFFSET;

  currentMap.post.style.left = `${dynamicPostX}px`;
  currentMap.post.style.right = "auto";

  currentMap.postLabel.textContent = labelText || layout.distance;
  currentMap.postLabel.style.left = `${dynamicPostX}px`;
  currentMap.postLabel.style.right = "auto";

  currentMap.postLabel.style.transform = "translateX(-50%)";

  const nextKeys = new Set(layout.runners.map((r) => runnerKey(r)));

  Object.keys(currentMap.runnersByKey).forEach((key) => {
    if (!nextKeys.has(key)) {
      currentMap.runnersByKey[key].remove();
      delete currentMap.runnersByKey[key];
    }
  });

  layout.runners.forEach((r) => {
    const key = runnerKey(r);
    let el = currentMap.runnersByKey[key];

    if (!el) {
      el = createRunnerElement(r);
      currentMap.runnersByKey[key] = el;
      currentMap.track.appendChild(el);
    }

    updateRunnerElement(el, r, tooltipDistance || layout.distance);
  });
}

function interpolateRunner(a, b, t) {
  return {
    no: a?.no ?? b?.no ?? 0,
    name: a?.name ?? b?.name ?? "",
    barrier: a?.barrier ?? b?.barrier ?? "",
    driver: a?.driver ?? b?.driver ?? "",
    med: t < 0.5 ? (a?.med ?? b?.med) : (b?.med ?? a?.med),
    qty: t < 0.5 ? (a?.qty ?? b?.qty) : (b?.qty ?? a?.qty),
    isKnown: (a?.isKnown ?? false) || (b?.isKnown ?? false),
    displayX: lerp(a?.displayX ?? b?.displayX ?? 0, b?.displayX ?? a?.displayX ?? 0, t),
    displayY: lerp(a?.displayY ?? b?.displayY ?? 0, b?.displayY ?? a?.displayY ?? 0, t)
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function playDistances() {
  if (isPlaying) {
    stopPlay();
    return;
  }

  const meeting = getCurrentMeeting();
  const race = getCurrentRace();
  if (!meeting || !race) return;

  const layout50 = computeRaceLayout(race, "50");
  const layout100 = computeRaceLayout(race, "100");
  const layout200 = computeRaceLayout(race, "200");

  if (layout50.error || layout100.error || layout200.error) {
    const msg = layout50.error || layout100.error || layout200.error || "(play unavailable)";
    resetMapContainer(`<div class="empty">${msg}</div>`);
    return;
  }

  isPlaying = true;
  updatePlayButton();

  if (currentMap.post) currentMap.post.style.opacity = "0";
  if (currentMap.postLabel) currentMap.postLabel.style.opacity = "0";

  // Snap instantly to 50
  selectedDistance = "50";
  document.querySelectorAll("[data-distance]").forEach((b) => {
    b.classList.toggle("active", b.dataset.distance === selectedDistance);
  });

  setRaceTitle(`${buildRaceTitle(meeting, race)} — Play`);
  syncMapToLayout(layout50, "50", "50");
  disableMapTransitions();

  // Let the DOM paint, then animate with RAF
  requestAnimationFrame(() => {
    const SEGMENT_1_MS = 3200; // 50 -> 100
    const SEGMENT_2_MS = 4200; // 100 -> 200

    const totalMs = SEGMENT_1_MS + SEGMENT_2_MS;
    const startTs = performance.now();

    function frame(now) {
      if (!isPlaying) return;

      const elapsed = now - startTs;

      let phase;
      let t;

      if (elapsed <= SEGMENT_1_MS) {
        phase = "50-100";
        t = elapsed / SEGMENT_1_MS;
      } else {
        phase = "100-200";
        t = Math.min(1, (elapsed - SEGMENT_1_MS) / SEGMENT_2_MS);
      }

      const runnersByKey = {};
      const allKeys = new Set([
        ...Object.keys(layout50.runnersByKey),
        ...Object.keys(layout100.runnersByKey),
        ...Object.keys(layout200.runnersByKey)
      ]);

      if (phase === "50-100") {
        allKeys.forEach((key) => {
          runnersByKey[key] = interpolateRunner(layout50.runnersByKey[key], layout100.runnersByKey[key], t);
        });

        const interpLayout = {
          distance: "100",
          postX: lerp(layout50.postX, layout100.postX, t),
          runners: Object.values(runnersByKey),
          runnersByKey
        };

        const label = t < 0.5 ? "50" : "100";
        const tooltipDistance = t < 0.5 ? "50" : "100";
        syncMapToLayout(interpLayout, label, tooltipDistance);
      } else {
        allKeys.forEach((key) => {
          runnersByKey[key] = interpolateRunner(layout100.runnersByKey[key], layout200.runnersByKey[key], t);
        });

        const interpLayout = {
          distance: "200",
          postX: lerp(layout100.postX, layout200.postX, t),
          runners: Object.values(runnersByKey),
          runnersByKey
        };

        const label = t < 0.25 ? "100" : "200";
        const tooltipDistance = t < 0.25 ? "100" : "200";
        syncMapToLayout(interpLayout, label, tooltipDistance);
      }

      if (elapsed < totalMs) {
        playRaf = requestAnimationFrame(frame);
      } else {
        selectedDistance = "200";
        document.querySelectorAll("[data-distance]").forEach((b) => {
          b.classList.toggle("active", b.dataset.distance === selectedDistance);
        });

        syncMapToLayout(layout200, "200", "200");
        restoreMapTransitions();
        stopPlay();
        setRaceTitle(`${buildRaceTitle(meeting, race)} — ${distanceTitle()} ${metricTitle()}`);
      }
    }

    playRaf = requestAnimationFrame(frame);
  });
}


function formatPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n)}%`;
}


function renderEarlySpeedMap(race, distanceOverride) {
  const layout = computeRaceLayout(race, distanceOverride);

  if (layout.error) {
    resetMapContainer(`<div class="empty">${layout.error}</div>`);
    return;
  }

  ensureMapShell();
  restoreMapTransitions();
  syncMapToLayout(layout, distanceOverride, distanceOverride);
}