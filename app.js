let rawPayload = null;
let filteredMeetings = [];
let selectedState = "";
let selectedMeetingKey = "";
let selectedRaceKey = "";

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

  selectedRaceKey = meeting.races.some((r) => r.raceKey === selectedRaceKey)
    ? selectedRaceKey
    : meeting.races[0].raceKey;

  for (const race of meeting.races) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "race-tab";
    if (race.raceKey === selectedRaceKey) btn.classList.add("active");
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

  const race = meeting.races.find((r) => r.raceKey === selectedRaceKey);
  if (!race) return;

  document.getElementById("raceTitle").textContent = buildRaceTitle(meeting, race);
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

function renderEarlySpeedMap(race) {
  const container = document.getElementById("mapContainer");
  container.innerHTML = "";

  const start = String(race.start || race.Start || "").toUpperCase();
  if (start !== "MOBILE") {
    container.innerHTML = `<div class="empty">(only mobile-start races shown)</div>`;
    return;
  }

  const runners = (race.runners || []).map(r => ({
    no: Number(r["Horse No"] ?? r.no),
    name: r["Horse"] ?? r.name,
    barrier: r["Barrier"] ?? r.barrier,
    driver: r["Driver"] ?? r.driver,
    med: Number(r["F100Med"] ?? r.med),
    qty: Number(r["F100Qty"] ?? r.qty)
  })).filter(r => r.barrier && r.barrier !== "SCR");

  if (!runners.length) {
    container.innerHTML = `<div class="empty">(no runners)</div>`;
    return;
  }

  const mapEl = document.createElement("div");
  mapEl.className = "speed-map";

  const PX_PER_METRE = 12;
  const LANE_GAP = 52;
  const FALLBACK = 18;
  const HORSE_WIDTH_PX = 96;
  const SAME_LANE_Y_OFFSET = -14;

  const valid = runners.filter(r => Number.isFinite(r.med) && r.qty > 0);
  if (!valid.length) {
    container.innerHTML = `<div class="empty">(no F100 data)</div>`;
    return;
  }

  const fastest = Math.min(...valid.map(r => r.med));

  const parseBarrier = (b) => {
    const m = String(b || "").trim().toUpperCase().match(/(FR|SR)(\d+)/);
    return m ? { row: m[1], slot: parseInt(m[2], 10) } : { row: "", slot: null };
  };

  const frMap = {};
  const srList = [];

  runners.forEach(r => {
    const p = parseBarrier(r.barrier);
    r.row = p.row;
    r.slot = p.slot;
    r.rawGap = (Number.isFinite(r.med) && r.qty > 0) ? (r.med - fastest) * 14.5 : FALLBACK;
    const laneY = r.slot * LANE_GAP;
    r.displayY = laneY + SAME_LANE_Y_OFFSET;

    if (r.row === "FR") {
      r.displayX = 930 - (r.rawGap * PX_PER_METRE);
      frMap[r.slot] = r;
    } else {
      srList.push(r);
    }
  });

  srList.forEach(r => {
    const rawX = 930 - (r.rawGap * PX_PER_METRE);
    const fr = frMap[r.slot];
    if (fr) {
      const maxAllowedX = fr.displayX - HORSE_WIDTH_PX;
      r.displayX = Math.min(rawX, maxAllowedX);
      r.displayY = fr.displayY;
    } else {
      r.displayX = rawX;
    }
  });

  mapEl.innerHTML = `
    <div class="map-track">
      <div class="map-post"></div>
      <div class="map-post-label">100</div>
    </div>
  `;

  const track = mapEl.querySelector(".map-track");

  runners.forEach(r => {
    const el = document.createElement("div");
    el.className = "map-runner";
    el.style.left = `${r.displayX}px`;
    el.style.top = `${r.displayY}px`;

    el.innerHTML = `
      <div class="horse-wrap">
        <div class="cloth cloth-${r.no}">${r.no}</div>
        <img class="horse-icon" src="horse.png" alt="">
      </div>
      <div class="tooltip">
        <div class="tooltip-title">${r.no}. ${r.name} (${r.barrier})</div>
        <div class="tooltip-body">Med: ${Number.isFinite(r.med) ? r.med.toFixed(2) : "-"} (n=${r.qty})</div>
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
