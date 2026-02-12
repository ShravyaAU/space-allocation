import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import "./App.css";

/* ----------------- helpers ----------------- */
function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function toNum(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildAllocationCsv({ courseName, programs, allocationResult }) {
  const programNames = allocationResult.programs;
  const lines = [];

  lines.push(["course", "row_type", "total_students", ...programNames].map(csvEscape).join(","));

  lines.push(
    [
      courseName,
      "course_summary",
      allocationResult.summary.totalStudents,
      ...programs.map((p) => Math.max(0, Math.floor(Number(p.count) || 0))),
    ]
      .map(csvEscape)
      .join(",")
  );

  lines.push(
    ["course", "row_type", "space", "type", "capacity", "total_allocated", ...programNames]
      .map(csvEscape)
      .join(",")
  );

  for (const r of allocationResult.rooms) {
    lines.push(
      [
        courseName,
        "space_allocation",
        r.label,
        r.kind,
        r.capacity,
        r.totalAllocated,
        ...r.allocated,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  return lines.join("\n");
}

function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Proportional allocation for one room */
function allocateForRoom(capacity, progRemaining) {
  const n = progRemaining.length;
  const totalRem = progRemaining.reduce((s, x) => s + x, 0);
  if (totalRem === 0 || capacity === 0) return new Array(n).fill(0);

  const ideal = progRemaining.map((r) => (r / totalRem) * capacity);
  const base = ideal.map((v) => Math.floor(v));
  const allocated = base.slice();
  let used = allocated.reduce((s, x) => s + x, 0);
  let leftover = capacity - used;

  const fracs = ideal.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fracs.sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < fracs.length && leftover > 0; ++k) {
    const i = fracs[k].i;
    const canTake = Math.min(leftover, progRemaining[i] - allocated[i]);
    if (canTake > 0) {
      allocated[i] += canTake;
      leftover -= canTake;
    }
  }

  if (leftover > 0) {
    for (let i = 0; i < n && leftover > 0; ++i) {
      const canTake = Math.min(leftover, progRemaining[i] - allocated[i]);
      if (canTake > 0) {
        allocated[i] += canTake;
        leftover -= canTake;
      }
    }
  }

  return allocated;
}

/* ----------------- App ----------------- */
export default function App() {
  /* Data loading */
  const [spaceRows, setSpaceRows] = useState([]);
  const [combinedRows, setCombinedRows] = useState([]);

  const [useZones, setUseZones] = useState(true);
  const [selected, setSelected] = useState(() => new Set());

  // Room selection controls (Option C)
  const [buildingFilter, setBuildingFilter] = useState("ALL"); // ALL | Design North (DN) | Design South (DS)
  const [searchText, setSearchText] = useState("");

  // Programs & course
  const [programs, setPrograms] = useState([
    { name: "Architecture", count: 80 },
    { name: "Interior", count: 70 },
    { name: "Industrial", count: 60 },
    { name: "Graphic", count: 50 },
    { name: "Landscape", count: 40 },
  ]);
  const [courseName, setCourseName] = useState("Course 1");

  const [allocationResult, setAllocationResult] = useState(null);

  // Load CSVs
  useEffect(() => {
    Papa.parse("/data/space_division.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        let lastBuilding = "";
        let lastLevel = "";
        let lastStudio = "";

        const parsed = (res.data || [])
          .map((r) => {
            const building = norm(r["BUILDING"]) || lastBuilding;
            const level = norm(r["LEVEL"]) || lastLevel;
            const studio = norm(r["STUDIO"]) || lastStudio;

            if (building) lastBuilding = building;
            if (level) lastLevel = level;
            if (studio) lastStudio = studio;

            const room = norm(r["ROOM"]);
            const cap = toNum(r["ASTRA OCCUPANCY"]);

            return { building, level, studio, room, capacity: cap };
          })
          .filter((x) => x.room && x.capacity > 0);

        setSpaceRows(parsed);
      },
    });
  }, []);

  useEffect(() => {
    Papa.parse("/data/combined_spaces.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = (res.data || [])
          .map((r) => ({
            combined_id: norm(r["combined_id"]),
            members: norm(r["members"])
              .split(",")
              .map((x) => norm(x))
              .filter(Boolean),
            capacity_override: toNum(r["capacity_override"]),
            mode: norm(r["mode"]) || "zone",
          }))
          .filter((x) => x.combined_id && x.members.length > 0 && x.capacity_override > 0);

        setCombinedRows(parsed);
      },
    });
  }, []);

  // Rooms
  const baseRooms = useMemo(() => {
    return spaceRows.map((r) => ({
      key: `room:${r.building}:${r.room}`,
      id: r.room,
      room: r.room,
      label: `${r.building} ${r.room}`,
      building: r.building,
      level: r.level,
      capacity: r.capacity,
      kind: "room",
      members: [r.room],
    }));
  }, [spaceRows]);

  // Zones
  const zones = useMemo(() => {
    return combinedRows.map((z) => ({
      key: `zone:${z.combined_id}`,
      id: z.combined_id,
      label: z.combined_id,
      building: z.combined_id.startsWith("DS-")
        ? "Design South (DS)"
        : z.combined_id.startsWith("DN-")
        ? "Design North (DN)"
        : "Unknown",
      level: "Combined",
      capacity: z.capacity_override,
      kind: "zone",
      members: z.members,
    }));
  }, [combinedRows]);

  // room ids inside any zone
  const zonedRoomIds = useMemo(() => {
    const s = new Set();
    for (const z of zones) for (const m of z.members) s.add(m);
    return s;
  }, [zones]);

  // which zones are selected
const selectedZoneIds = useMemo(() => {
  return new Set(
    Array.from(selected)
      .filter((key) => key.startsWith("zone:"))
  );
}, [selected]);

// room ids inside selected zones only
const roomsInsideSelectedZones = useMemo(() => {
  const set = new Set();
  for (const z of zones) {
    if (selectedZoneIds.has(z.key)) {
      for (const m of z.members) set.add(m);
    }
  }
  return set;
}, [zones, selectedZoneIds]);

  // selectableSpaces used for allocation only
  const selectableSpaces = useMemo(() => {
    const list = useZones ? [...zones, ...baseRooms] : [...baseRooms];
    return list.sort((a, b) => {
      const ab = a.building.localeCompare(b.building);
      if (ab !== 0) return ab;
      const ak = a.kind.localeCompare(b.kind);
      if (ak !== 0) return ak;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [useZones, zones, baseRooms]);

  // Auto-select all when loaded
  useEffect(() => {
    if (selectableSpaces.length === 0) return;
    setSelected(new Set(selectableSpaces.map((x) => x.key)));
  }, [selectableSpaces.length]);

  // Keep selection valid when toggling zones
  useEffect(() => {
    setSelected((prev) => {
      const allowed = new Set(selectableSpaces.map((x) => x.key));
      const next = new Set();
      for (const k of prev) if (allowed.has(k)) next.add(k);
      return next;
    });
  }, [useZones, selectableSpaces]);
  useEffect(() => {
  setAllocationResult(null); // clear old results when switching zone mode
}, [useZones]);


  function toggleSelect(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group rooms by building -> level
  const roomsByBuilding = useMemo(() => {
    const out = {};
    for (const r of baseRooms) {
      const b = r.building || "Unknown";
      const l = r.level || "Unknown Level";
      out[b] = out[b] || {};
      out[b][l] = out[b][l] || [];
      out[b][l].push(r);
    }
    return out;
  }, [baseRooms]);

  // Zones by building
  const zonesByBuilding = useMemo(() => {
    const out = {};
    for (const z of zones) {
      const b = z.building || "Unknown";
      out[b] = out[b] || [];
      out[b].push(z);
    }
    return out;
  }, [zones]);

  // Filtered buildings list (based on dropdown)
  const filteredBuildingNames = useMemo(() => {
    const all = Object.keys(roomsByBuilding);
    if (buildingFilter === "ALL") return all.sort();
    return all.filter((b) => b === buildingFilter).sort();
  }, [roomsByBuilding, buildingFilter]);

  // Search matcher
  const q = useMemo(() => norm(searchText).toLowerCase(), [searchText]);

  function matchesSearch(text) {
    if (!q) return true;
    return String(text || "").toLowerCase().includes(q);
  }

  // Keys for bulk selection
  function keysForBuilding(building) {
    const keys = [];
    const levs = roomsByBuilding[building] || {};
    for (const level of Object.keys(levs)) {
      for (const r of levs[level]) {
        // Search filter also affects bulk selection (only visible items)
        if (matchesSearch(`${r.building} ${r.level} ${r.room}`)) keys.push(r.key);
      }
    }
    if (useZones) {
      for (const z of zonesByBuilding[building] || []) {
        if (matchesSearch(`${z.label} ${z.building}`)) keys.push(z.key);
      }
    }
    return keys;
  }

  function keysForLevel(building, level) {
    const keys = [];
    const levs = roomsByBuilding[building] || {};
    for (const r of levs[level] || []) {
      if (matchesSearch(`${r.building} ${r.level} ${r.room}`)) keys.push(r.key);
    }
    return keys;
  }

  function setSelectedKeys(keys, add = true) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) add ? next.add(k) : next.delete(k);
      return next;
    });
  }

  // Stats (visible-only, based on search/filter)
  function buildingStatsVisible(building) {
    let cap = 0;
    let selectedCap = 0;
    let zonesCount = 0;

    const levs = roomsByBuilding[building] || {};
    for (const level of Object.keys(levs)) {
      for (const r of levs[level] || []) {
        if (!matchesSearch(`${r.building} ${r.level} ${r.room}`)) continue;
        cap += r.capacity;
        if (selected.has(r.key)) selectedCap += r.capacity;
      }
    }

    if (useZones) {
      const zb = zonesByBuilding[building] || [];
      for (const z of zb) {
        if (!matchesSearch(`${z.label} ${z.building}`)) continue;
        cap += z.capacity;
        zonesCount += 1;
        if (selected.has(z.key)) selectedCap += z.capacity;
      }
    }

    return { cap, selectedCap, zonesCount };
  }

  /* ---- Allocation ---- */
  function runAllocation() {
    const map = new Map(selectableSpaces.map((s) => [s.key, s]));
    const selectedList = Array.from(selected).map((k) => map.get(k)).filter(Boolean);

    const progRemaining = programs.map((p) => Math.max(0, Math.floor(Number(p.count) || 0)));
    const totalStudents = progRemaining.reduce((s, x) => s + x, 0);

    const roomAllocations = [];

  for (const s of selectedList) {
  const remainingTotal = progRemaining.reduce((a, b) => a + b, 0);
  if (remainingTotal === 0) break;

  const effectiveCapacity = Math.min(s.capacity, remainingTotal);

  const alloc = allocateForRoom(effectiveCapacity, progRemaining);

  roomAllocations.push({
    key: s.key,
    id: s.id,
    label: s.label,
    kind: s.kind,
    capacity: s.capacity,
    allocated: alloc.slice(),
    totalAllocated: alloc.reduce((a, b) => a + b, 0),
  });

  for (let i = 0; i < progRemaining.length; ++i) {
    progRemaining[i] = Math.max(0, progRemaining[i] - alloc[i]);
  }
}

    const remaining = progRemaining.slice();
    const allocatedTotals = programs.map((_, i) =>
      roomAllocations.reduce((s, r) => s + (r.allocated[i] || 0), 0)
    );

    setAllocationResult({
      rooms: roomAllocations,
      summary: { totalStudents, allocatedTotals, remaining },
      programs: programs.map((p) => p.name),
    });
  }

  // UI helpers
  const selectedSpaces = useMemo(() => {
    const map = new Map(selectableSpaces.map((x) => [x.key, x]));
    return Array.from(selected).map((k) => map.get(k)).filter(Boolean);
  }, [selected, selectableSpaces]);

  const totalSelectedCapacity = useMemo(
    () => selectedSpaces.reduce((s, x) => s + x.capacity, 0),
    [selectedSpaces]
  );
  const totalRequestedStudents = useMemo(() => {
  return programs.reduce((sum, p) => sum + Math.max(0, Math.floor(Number(p.count) || 0)), 0);
}, [programs]);

const capacityDiff = totalSelectedCapacity - totalRequestedStudents;
const capacityOk = capacityDiff >= 0;


  // Select all visible (filtered buildings + search)
  function selectAllVisible() {
    const keys = [];
    for (const b of filteredBuildingNames) keys.push(...keysForBuilding(b));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
  }

  function clearAllVisible() {
    const keys = [];
    for (const b of filteredBuildingNames) keys.push(...keysForBuilding(b));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });
  }

  return (
    <div className="app-container">
      <h1 className="app-title">Space Allocation Tool</h1>

      {/* ---------- Allocation Parameters (TOP) ---------- */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Allocation Parameters</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ color: "#6b7280" }}>
            Rooms loaded: <b>{baseRooms.length}</b> &nbsp;|&nbsp; Zones loaded: <b>{zones.length}</b>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            <input
              type="checkbox"
              checked={useZones}
              onChange={(e) => setUseZones(e.target.checked)}
            />
            Use Combined Zones
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>Course Name</label>
          <input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            placeholder="e.g., Course 1"
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "10px 0" }}>Programs (5)</h3>

          {programs.map((p, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <input
                value={p.name}
                onChange={(e) =>
                  setPrograms((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], name: e.target.value };
                    return next;
                  })
                }
                style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />

              <input
                type="number"
                min="0"
                value={p.count}
                onChange={(e) =>
                  setPrograms((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], count: Number(e.target.value || 0) };
                    return next;
                  })
                }
                style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={runAllocation}>Run Allocation</button>

          <button className="secondary" onClick={() => setAllocationResult(null)}>
            Reset Result
          </button>

          <button
            disabled={!allocationResult}
            onClick={() => {
              const csv = buildAllocationCsv({ courseName, programs, allocationResult });
              const safeCourse = (courseName || "course").replace(/[^a-z0-9-_]+/gi, "_");
              downloadTextFile(`allocation_${safeCourse}.csv`, csv);
            }}
          >
            Export CSV
          </button>
        </div>
        
        <div
  style={{
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    border: "1px solid",
    borderColor: capacityOk ? "#bbf7d0" : "#fecaca",
    background: capacityOk ? "#f0fdf4" : "#fef2f2",
    color: capacityOk ? "#166534" : "#991b1b",
    fontWeight: 600,
  }}
>
  {capacityOk ? (
    <>
      ✅ Capacity OK — You have <b>{capacityDiff}</b> extra seats.
    </>
  ) : (
    <>
      ⚠️ Not enough capacity — You need <b>{Math.abs(capacityDiff)}</b> more seats.
    </>
  )}
</div>


        <div className="info-box">
          <div>
            Selected spaces: <b>{selectedSpaces.length}</b>
          </div>
          <div>
            Total capacity selected: <b>{totalSelectedCapacity}</b>
          </div>
        </div>
      </div>

      {/* ---------- Room Selection (BELOW) ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Room Selection</h2>

        {/* Controls row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr auto",
            gap: 10,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          >
            <option value="ALL">All Buildings</option>
            <option value="Design North (DN)">Design North (DN)</option>
            <option value="Design South (DS)">Design South (DS)</option>
          </select>

          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search rooms / levels / zones (e.g., 265, Level - 2, DN-265-283)..."
            style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="secondary" onClick={selectAllVisible}>Select Visible</button>
            <button className="secondary" onClick={clearAllVisible}>Clear Visible</button>
          </div>
        </div>

        <div style={{ color: "#6b7280", marginBottom: 10 }}>
          Tip: Buildings and levels are dropdowns. Expand what you need and select rooms/zones.
        </div>

        {/* Buildings */}
        <div style={{ display: "grid", gap: 12 }}>
          {filteredBuildingNames.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No rooms found for the selected filter.</div>
          ) : (
            filteredBuildingNames.map((building) => {
              const levels = roomsByBuilding[building] || {};
              const { cap, selectedCap, zonesCount } = buildingStatsVisible(building);
              const buildingKeys = keysForBuilding(building);
              const allBuildingSelected = buildingKeys.length > 0 && buildingKeys.every((k) => selected.has(k));

              // Hide building entirely if search yields nothing inside
              if (q && cap === 0 && (!useZones || zonesCount === 0)) {
                return null;
              }

              return (
                <details
                  key={building}
                  style={{
                    border: "1px solid #e6efe0",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <summary style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                    <div style={{ fontWeight: 800 }}>{building}</div>

                    <span
                      style={{
                        background: "#eef7ee",
                        color: "#166534",
                        padding: "6px 10px",
                        borderRadius: 999,
                        fontSize: 13,
                      }}
                    >
                      {selectedCap} / {cap} capacity included
                    </span>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ color: "#6b7280", fontSize: 13 }}>
                        {useZones ? `${zonesCount} zone${zonesCount !== 1 ? "s" : ""}` : "Zones off"}
                      </div>

                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={allBuildingSelected}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedKeys(buildingKeys, true);
                            else setSelectedKeys(buildingKeys, false);
                          }}
                        />
                        <span style={{ fontSize: 13 }}>Use</span>
                      </label>
                    </div>
                  </summary>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {/* Zones */}
                    {useZones && (zonesByBuilding[building] || []).some((z) => matchesSearch(`${z.label} ${z.building}`)) && (
                      <div style={{ padding: 10, border: "1px dashed #e5e7eb", borderRadius: 10, background: "#fbfffb" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Combined Zones</div>

                        <div style={{ display: "grid", gap: 8 }}>
                          {(zonesByBuilding[building] || [])
                            .filter((z) => matchesSearch(`${z.label} ${z.building}`))
                            .map((z) => (
                              <div
                                key={z.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: 10,
                                  borderRadius: 10,
                                  background: "#fff",
                                  border: "1px solid #eef2f7",
                                }}
                              >
                                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={selected.has(z.key)}
                                    onChange={() => toggleSelect(z.key)}
                                  />
                                  <div style={{ fontWeight: 700 }}>{z.label}</div>
                                </div>
                                <div style={{ fontSize: 13, color: "#2563eb" }}>{z.capacity} seats</div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Levels (dropdowns) */}
                    {Object.keys(levels).map((level) => {
                      const levelKeys = keysForLevel(building, level);
                      const visibleRooms = (levels[level] || []).filter((r) =>
                        matchesSearch(`${r.building} ${r.level} ${r.room}`)
                      );

                      if (visibleRooms.length === 0) return null;

                      const levelSelected = levelKeys.length > 0 && levelKeys.every((k) => selected.has(k));
                      const levelSeats = visibleRooms.reduce((s, r) => s + r.capacity, 0);

                      return (
                        <details
                          key={level}
                          style={{
                            border: "1px solid #eef2ff",
                            borderRadius: 10,
                            padding: 10,
                            background: "#fff",
                          }}
                        >
                          <summary style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                            <div style={{ fontWeight: 700 }}>{level}</div>

                            <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                              <div style={{ color: "#6b7280", fontSize: 13 }}>{levelSeats} seats</div>

                              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={levelSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedKeys(levelKeys, true);
                                    else setSelectedKeys(levelKeys, false);
                                  }}
                                />
                                <span style={{ fontSize: 13 }}>Use level</span>
                              </label>
                            </div>
                          </summary>

                          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                            {visibleRooms.map((r) => {
                              const disabled = useZones && roomsInsideSelectedZones.has(r.id);

                              return (
                                <div
                                  key={r.key}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 12px",
                                    borderRadius: 10,
                                    background: disabled ? "#f8fafc" : "#ffffff",
                                    border: "1px solid #eef2f7",
                                    opacity: disabled ? 0.55 : 1,
                                  }}
                                >
                                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                    <input
                                      type="checkbox"
                                      checked={selected.has(r.key)}
                                      disabled={disabled}
                                      onChange={() => toggleSelect(r.key)}
                                    />
                                    <div>
                                      <div style={{ fontWeight: 700 }}>{`Room ${r.room}`}</div>
                                      <div style={{ fontSize: 13, color: "#6b7280" }}>{r.building}</div>
                                    </div>
                                  </div>

                                  <div style={{ fontSize: 13, color: "#2563eb" }}>{r.capacity} seats</div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>

      {/* ---------- Allocation results ---------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Allocation Results</h2>

        {!allocationResult ? (
          <p>
            No allocation run yet. Click <b>Run Allocation</b>.
          </p>
        ) : (
          <>
            <h3>Summary</h3>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                Total students: <b>{allocationResult.summary.totalStudents}</b>
              </div>
              <div>
                Allocated total:{" "}
                <b>{allocationResult.summary.allocatedTotals.reduce((a, b) => a + b, 0)}</b>
              </div>
              <div>
                Unallocated (remaining):{" "}
                <b>{allocationResult.summary.remaining.reduce((a, b) => a + b, 0)}</b>
              </div>
            </div>

            <h3 style={{ marginTop: 12 }}>Per-program totals</h3>
            <table>
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Requested</th>
                  <th>Allocated</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {allocationResult.programs.map((name, i) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{programs[i].count}</td>
                    <td>{allocationResult.summary.allocatedTotals[i]}</td>
                    <td>{allocationResult.summary.remaining[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 12 }}>Room allocations</h3>
            <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee", borderRadius: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>Space</th>
                    <th>Cap</th>
                    <th>Total Alloc</th>
                    {allocationResult.programs.map((p) => (
                      <th key={p}>{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocationResult.rooms.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{r.capacity}</td>
                      <td>{r.totalAllocated}</td>
                      {r.allocated.map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
