let rawPayload = null;
let filteredMeetings = [];
let selectedState = "";
let selectedMeetingKey = "";
let selectedRaceKey = "";
let selectedMetric = "weighted";
let selectedDistance = "100";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("./data/first100.json");
    if (!response.ok) {
      throw new Error(`Failed to load first100.json (${response.status})`);
    }

    rawPayload = await response.json();

    document.getElementById("meetingSelect").addEventListener("change", (e) => {
      selectedMeetingKey = e.target.value;
      selectedRaceKey = "";
      rebuildRaceOptions();
    });

    document.querySelectorAll("[data-metric]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMetric = btn.dataset.metric || "weighted";

        document.querySelectorAll("[data-metric]").forEach((b) => {
          b.classList.toggle("active", b.dataset.metric === selectedMetric);
        });

        renderSelectedRace();
      });
    });

    document.querySelectorAll("[data-distance]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDistance = btn.dataset.distance || "100";

        document.querySelectorAll("[data-distance]").forEach((b) => {
          b.classList.toggle("active", b.dataset.distance === selectedDistance);
        });

        renderSelectedRace();
      });
    });

    selectedState = "QLD";

    buildStateOptions();
    rebuildMeetingOptions();
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
    document.getElementById("mapContainer").innerHTML = `<div class="empty">(no meetings found)</div>`;
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
    document.getElementById("mapContainer").innerHTML = `<div class="empty">(no races found)</div>`;
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

function renderEarlySpeedMap(race) {
  const container = document.getElementById("mapContainer");
  container.innerHTML = "";

  const start = String(race.start || race.Start || "").toUpperCase();
  if (start !== "MOBILE") {
    container.innerHTML = `<div class="empty">(only mobile-start races shown)</div>`;
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
    container.innerHTML = `<div class="empty">(no runners)</div>`;
    return;
  }

  const mapEl = document.createElement("div");
  mapEl.className = "speed-map";

  const PX_PER_METRE = 11;
  const LANE_GAP = 52;
  const UNKNOWN_BACK_MARKER_M = 6;
  const HORSE_WIDTH_PX = 96;
  const SAME_LANE_Y_OFFSET = -14;
  const POST_X = getPostX();

  const valid = runners.filter((r) => Number.isFinite(r.med) && r.qty > 0);
  if (!valid.length) {
    container.innerHTML = `<div class="empty">(no ${currentPrefix()} data)</div>`;
    return;
  }

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

    const laneY = r.slot * LANE_GAP;
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

  mapEl.innerHTML = `
    <div class="map-track">
      <div class="map-post"></div>
      <div class="map-post-label">${selectedDistance}</div>
    </div>
  `;

  const track = mapEl.querySelector(".map-track");

  runners.forEach((r) => {
    const el = document.createElement("div");
    el.className = "map-runner";
    if (!r.isKnown) el.classList.add("unknown");

    el.style.left = `${r.displayX}px`;
    el.style.top = `${r.displayY}px`;

    el.innerHTML = `
      <div class="horse-wrap">
        <div class="cloth cloth-${r.no}">${r.no}</div>
        <img class="horse-icon" src="horse.png" alt="">
      </div>
      <div class="tooltip">
        <div class="tooltip-title">${r.no}. ${r.name} (${r.barrier})</div>
        <div class="tooltip-body">${distanceTitle()} ${metricLabel()}: ${r.isKnown ? r.med.toFixed(2) : "-"} (n=${r.qty || 0})</div>
        <div class="tooltip-body">Dr: ${r.driver || "-"}</div>
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

    track.appendChild(el);
  });

  container.appendChild(mapEl);
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