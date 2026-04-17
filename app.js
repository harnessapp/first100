let rawPayload = null;
let filteredMeetings = [];
let selectedState = "";
let selectedMeetingKey = "";
let selectedRaceKey = "";
let selectedMetric = "weighted";
let selectedDistance = "100";

let playTimer = null;
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

function renderSelectedRace() {
  const meeting = filteredMeetings.find((m) => m.meetingKey === selectedMeetingKey);
  if (!meeting) return;

  const sortedRaces = [...meeting.races].sort(
    (a, b) => raceNoSortValue(a.raceNo) - raceNoSortValue(b.raceNo)
  );

  const race = sortedRaces.find((r) => r.raceKey === selectedRaceKey);
  if (!race) return;

  document.getElementById("raceTitle").textContent =
    `${buildRaceTitle(meeting, race)} — ${distanceTitle()} ${metricTitle()}`;

  renderEarlySpeedMap(race);
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

function currentPrefix() {
  return `F${selectedDistance}`;
}

function metricValueKey() {
  switch (selectedMetric) {
    case "fast":
      return `${currentPrefix()}Fast`;
    case "avg123":
      return `${currentPrefix()}Avg123`;
    case "last5":
      return `${currentPrefix()}Last5`;
    case "avg":
      return `${currentPrefix()}Avg`;
    case "med":
      return `${currentPrefix()}Med`;
    case "weighted":
    default:
      return null;
  }
}

function metricQtyKey() {
  switch (selectedMetric) {
    case "fast":
      return `${currentPrefix()}FastQty`;
    case "avg123":
      return `${currentPrefix()}Avg123Qty`;
    case "last5":
      return `${currentPrefix()}Last5Qty`;
    case "avg":
      return `${currentPrefix()}AvgQty`;
    case "med":
      return `${currentPrefix()}Qty`;
    case "weighted":
    default:
      return null;
  }
}

function weightedMetric(r) {
  const prefix = currentPrefix();

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

function getMetricForRunner(r) {
  if (selectedMetric === "weighted") {
    return weightedMetric(r);
  }

  const valueKey = metricValueKey();
  const qtyKey = metricQtyKey();

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

function distanceTitle() {
  return `${selectedDistance}m`;
}

function getPostX() {
  switch (selectedDistance) {
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
  isPlaying = false;
  updatePlayButton();
}

function updatePlayButton() {
  const btn = document.getElementById("playToggle");
  if (!btn) return;

  btn.textContent = isPlaying ? "Pause" : "▶ Play";
  btn.classList.toggle("active", isPlaying);
}

function playDistances() {
  if (isPlaying) {
    stopPlay();
    return;
  }

  isPlaying = true;
  updatePlayButton();

  const sequence = ["50", "100", "200"];
  let index = 0;

  const MOVE_TIME = 1400;   // slower travel
  const HOLD_TIME = 250;    // shorter pause on each point

  function step() {
    if (!isPlaying) return;

    setSelectedDistance(sequence[index]);
    index += 1;

    if (index < sequence.length) {
      playTimer = setTimeout(step, MOVE_TIME + HOLD_TIME);
    } else {
      playTimer = setTimeout(() => {
        stopPlay();
      }, MOVE_TIME + HOLD_TIME);
    }
  }

  step();
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

function updateRunnerElement(el, r) {
  el.classList.toggle("unknown", !r.isKnown);

  const cloth = el.querySelector(".cloth");
  cloth.className = `cloth cloth-${r.no}`;
  cloth.textContent = r.no;

  el.querySelector(".tooltip-title").textContent = `${r.no}. ${r.name} (${r.barrier})`;
  el.querySelector(".metric-line").textContent =
    `${distanceTitle()} ${metricLabel()}: ${r.isKnown ? r.med.toFixed(2) : "-"} (n=${r.qty || 0})`;
  el.querySelector(".driver-line").textContent = `Dr: ${r.driver || "-"}`;

  el.style.left = `${r.displayX}px`;
  el.style.top = `${r.displayY}px`;
}

function renderEarlySpeedMap(race) {
  const start = String(race.start || race.Start || "").toUpperCase();
  if (start !== "MOBILE") {
    resetMapContainer(`<div class="empty">(only mobile-start races shown)</div>`);
    return;
  }

  const runners = (race.runners || []).map((r) => {
    const metric = getMetricForRunner(r);

    return {
      no: Number(r["Horse No"] ?? r.no),
      name: r["Horse"] ?? r.name,
      barrier: r["Barrier"] ?? r.barrier,
      driver: r["Driver"] ?? r.driver,
      med: metric.value,
      qty: metric.qty
    };
  }).filter((r) => r.barrier && r.barrier !== "SCR");

  if (!runners.length) {
    resetMapContainer(`<div class="empty">(no runners)</div>`);
    return;
  }

  const valid = runners.filter((r) => Number.isFinite(r.med) && r.qty > 0);
  if (!valid.length) {
    resetMapContainer(`<div class="empty">(no ${currentPrefix()} data)</div>`);
    return;
  }

  ensureMapShell();

  const PX_PER_METRE = 11;
  const LANE_GAP = 52;
  const UNKNOWN_BACK_MARKER_M = 6;
  const HORSE_WIDTH_PX = 96;
  const SAME_LANE_Y_OFFSET = -14;
  const POST_X = getPostX();

  const fastest = Math.min(...valid.map((r) => r.med));

  const parseBarrier = (b) => {
    const m = String(b || "").trim().toUpperCase().match(/(FR|SR)(\d+)/);
    return m ? { row: m[1], slot: parseInt(m[2], 10) } : { row: "", slot: null };
  };

  const knownGaps = valid.map((r) => (r.med - fastest) * 14.5);
  const slowestKnownGap = Math.max(...knownGaps);

  const frMap = {};
  const srList = [];

  runners.forEach((r) => {
    const p = parseBarrier(r.barrier);
    r.row = p.row;
    r.slot = p.slot;

    r.isKnown = Number.isFinite(r.med) && r.qty > 0;

    if (r.isKnown) {
      r.rawGap = (r.med - fastest) * 14.5;
    } else {
      r.rawGap = slowestKnownGap + UNKNOWN_BACK_MARKER_M;
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

  currentMap.post.style.left = `${POST_X}px`;
  currentMap.post.style.right = "auto";

  currentMap.postLabel.textContent = selectedDistance;
  currentMap.postLabel.style.left = `${POST_X}px`;
  currentMap.postLabel.style.right = "auto";
  currentMap.postLabel.style.transform = "translateX(-50%)";

  const nextKeys = new Set(runners.map((r) => runnerKey(r)));

  Object.keys(currentMap.runnersByKey).forEach((key) => {
    if (!nextKeys.has(key)) {
      currentMap.runnersByKey[key].remove();
      delete currentMap.runnersByKey[key];
    }
  });

  runners.forEach((r) => {
    const key = runnerKey(r);
    let el = currentMap.runnersByKey[key];

    if (!el) {
      el = createRunnerElement(r);
      currentMap.runnersByKey[key] = el;
      currentMap.track.appendChild(el);

      el.style.left = `${r.displayX}px`;
      el.style.top = `${r.displayY}px`;

      requestAnimationFrame(() => {
        updateRunnerElement(el, r);
      });
    } else {
      updateRunnerElement(el, r);
    }
  });
}