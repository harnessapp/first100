let rawPayload = null;
let filteredMeetings = [];
let selectedState = "";
let selectedMeetingKey = "";
let selectedRaceKey = "";
let selectedMetric = "weighted";

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

    document.querySelectorAll(".metric-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMetric = btn.dataset.metric || "weighted";

        document.querySelectorAll(".metric-tab").forEach((b) => {
          b.classList.toggle("active", b.dataset.metric === selectedMetric);
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
    `${buildRaceTitle(meeting, race)} — ${metricTitle()}`;

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

function weightedMetric(r) {
  const components = [
    { value: Number(r["F100Med"] ?? r.F100Med), weight: 0.30, qty: Number(r["F100Qty"] ?? r.F100Qty) },
    { value: Number(r["F100Fast"] ?? r.F100Fast), weight: 0.10, qty: Number(r["F100FastQty"] ?? r.F100FastQty) },
    { value: Number(r["F100Avg123"] ?? r.F100Avg123), weight: 0.25, qty: Number(r["F100Avg123Qty"] ?? r.F100Avg123Qty) },
    { value: Number(r["F100Last5"] ?? r.F100Last5), weight: 0.25, qty: Number(r["F100Last5Qty"] ?? r.F100Last5Qty) },
    { value: Number(r["F100Avg"] ?? r.F100Avg), weight: 0.10, qty: Number(r["F100AvgQty"] ?? r.F100AvgQty) }
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
  switch (selectedMetric) {
    case "weighted":
      return weightedMetric(r);
    case "fast":
      return {
        value: Number(r["F100Fast"] ?? r.F100Fast),
        qty: Number(r["F100FastQty"] ?? r.F100FastQty)
      };
    case "avg123":
      return {
        value: Number(r["F100Avg123"] ?? r.F100Avg123),
        qty: Number(r["F100Avg123Qty"] ?? r.F100Avg123Qty)
      };
    case "last5":
      return {
        value: Number(r["F100Last5"] ?? r.F100Last5),
        qty: Number(r["F100Last5Qty"] ?? r.F100Last5Qty)
      };
    case "avg":
      return {
        value: Number(r["F100Avg"] ?? r.F100Avg),
        qty: Number(r["F100AvgQty"] ?? r.F100AvgQty)
      };
    case "med":
    default:
      return {
        value: Number(r["F100Med"] ?? r.F100Med),
        qty: Number(r["F100Qty"] ?? r.F100Qty)
      };
  }
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

function renderEarlySpeedMap(race) {
  console.log("renderEarlySpeedMap called:", race.venue, race.date);

  const container = document.getElementById("mapContainer");
  container.innerHTML = "";

  const start = String(race.start || race.Start || "").toUpperCase();
  if (start !== "MOBILE") {
    container.innerHTML = `<div class="empty">(only mobile-start races shown)</div>`;
    return;
  }

  const parseBarrier = (b) => {
    const text = String(b || "").trim().toUpperCase();
    if (text === "SCR") return { row: "SCR", slot: null, valid: false, emergency: false };
    if (text === "FR-" || text === "SR-") return { row: text.slice(0,2), slot: null, valid: false, emergency: true };
    const m = text.match(/(FR|SR)(\d+)/);
    if (!m) return { row:"", slot:null, valid:false, emergency:false };
    return { row:m[1], slot:parseInt(m[2],10), valid:true, emergency:false };
  };

  // Map all runners with metrics
  const runnersRaw = (race.runners || []).map((r) => {
    const metric = getMetricForRunner(r);
    const barrier = r["Barrier"] ?? r.barrier;
    const parsed = parseBarrier(barrier);
    return {
      no: Number(r["Horse No"] ?? r.no),
      name: r["Horse"] ?? r.name,
      barrier,
      driver: r["Driver"] ?? r.driver,
      med: metric.value,
      qty: metric.qty,
      row: parsed.row,
      slot: parsed.slot,
      barrierValid: parsed.valid,
      emergency: parsed.emergency,
      isKnown: Number.isFinite(metric.value) && metric.qty > 0,
      isEmergency: parsed.emergency
    };
  });

  // Preserve layout: all runners remain for X/Y calculation
  const allRunners = runnersRaw.map(r => ({ ...r }));

  // Placeholder runners if no real runners exist
  const realRunners = allRunners.filter(r => !r.isEmergency);
  if (realRunners.length === 0) {
    for (let i=0; i<10; i++) {
      allRunners.push({
        no:"-",
        name:i===0?"(no qualifying runners)":"",
        driver:"-",
        med:0,
        qty:0,
        slot:i+1,
        row:"SR",
        barrierValid:true,
        isKnown:false,
        isEmergency:true,
        rawGap:6
      });
    }
  }

  const mapEl = document.createElement("div");
  mapEl.className = "speed-map";

  const PX_PER_METRE = 11;
  const LANE_GAP = 52;
  const HORSE_WIDTH_PX = 96;
  const SAME_LANE_Y_OFFSET = -14;
  const POST_X = 930;

  const maxSlot = Math.max(...allRunners.map(r => Number.isFinite(r.slot)?r.slot:0),0);
  mapEl.style.minHeight = `${Math.max(520,(maxSlot*LANE_GAP)+180)}px`;

  const frMap = {};
  const srList = [];
  allRunners.forEach(r=>{
    r.rawGap = r.isKnown ? r.med*14.5 : r.rawGap || 6;
    const laneY = r.slot*LANE_GAP;
    r.displayY = laneY + SAME_LANE_Y_OFFSET;
    if(r.row==="FR") frMap[r.slot]=r; else srList.push(r);
  });

  srList.forEach(r=>{
    const fr = frMap[r.slot];
    const rawX = POST_X - r.rawGap*PX_PER_METRE;
    if(fr){
      const actualGapPx = Math.max(0,(r.rawGap-fr.rawGap)*PX_PER_METRE);
      const requiredBehindPx = HORSE_WIDTH_PX+actualGapPx;
      r.displayX = fr.displayX-requiredBehindPx;
      r.displayY = fr.displayY;
    } else r.displayX = rawX;
  });

  mapEl.innerHTML = `<div class="map-track"><div class="map-post"></div><div class="map-post-label">100</div></div>`;
  const track = mapEl.querySelector(".map-track");

  // Draw runners
  allRunners.forEach(r=>{
    const el = document.createElement("div");
    el.className="map-runner";
    if(!r.isKnown) el.classList.add("unknown");

    // Hide FR-/SR- runners visually
    if(r.isEmergency) el.style.display="none";

    el.style.left=`${r.displayX}px`;
    el.style.top=`${r.displayY}px`;

    el.innerHTML=`
      <div class="horse-wrap">
        <div class="cloth cloth-${r.no}">${r.no}</div>
        <img class="horse-icon" src="horse.png" alt="">
      </div>
      <div class="tooltip">
        <div class="tooltip-title">${r.no}. ${r.name} (${r.barrier})</div>
        <div class="tooltip-body">${metricLabel()}: ${r.isEmergency ? "-" : (r.isKnown?r.med.toFixed(2):"-")} (n=${r.qty||0})</div>
        <div class="tooltip-body">Dr: ${r.driver||"-"}</div>
      </div>
    `;

    const tip = el.querySelector(".tooltip");
    el.addEventListener("mouseenter",()=>{tip.style.display="block";tip.style.left="78px";tip.style.top="-8px";});
    el.addEventListener("mouseleave",()=>{tip.style.display="none";});

    track.appendChild(el);
  });

  container.appendChild(mapEl);
}