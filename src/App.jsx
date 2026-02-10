import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

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

  // One summary row at top
  lines.push(
    ["course", "row_type", "total_students", ...programNames].map(csvEscape).join(",")
  );

  lines.push(
    [
      courseName,
      "course_summary",
      allocationResult.summary.totalStudents,
      ...programs.map((p) => Math.max(0, Math.floor(Number(p.count) || 0))),
    ].map(csvEscape).join(",")
  );

  // Header for room rows
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
      ].map(csvEscape).join(",")
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


/* Proportional allocation for one room:
   Inputs:
     - capacity: number of seats in the room
     - progRemaining: array of remaining students per program (numbers)
   Returns:
     - alloc: array of allocated counts per program (same length)
   Algorithm:
     - compute ideal = progRem[i] * capacity / totalRem
     - take floor(ideal)
     - distribute leftover seats one-by-one to programs with largest fractional remainder,
       but never exceed progRemaining[i].
*/
function allocateForRoom(capacity, progRemaining) {
  const n = progRemaining.length;
  const totalRem = progRemaining.reduce((s, x) => s + x, 0);
  if (totalRem === 0 || capacity === 0) return new Array(n).fill(0);

  // ideal fractional
  const ideal = progRemaining.map((r) => (r / totalRem) * capacity);
  const base = ideal.map((v) => Math.floor(v));
  let allocated = base.slice();
  let used = allocated.reduce((s, x) => s + x, 0);
  let leftover = capacity - used;

  // compute fractional remainders with index
  const fracs = ideal.map((v, i) => ({ i, frac: v - Math.floor(v) }));

  // sort by fractional desc, tie-break by larger remaining students
  fracs.sort((a, b) => b.frac - a.frac);

  // distribute leftovers
  for (let k = 0; k < fracs.length && leftover > 0; ++k) {
    const i = fracs[k].i;
    const canTake = Math.min(leftover, progRemaining[i] - allocated[i]);
    if (canTake > 0) {
      allocated[i] += canTake;
      leftover -= canTake;
    }
  }

  // If still leftover (edge cases where some programs already exhausted), distribute to any with remaining
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

  // programs: default 5
  const [programs, setPrograms] = useState([
    { name: "Program 1", count: 80 },
    { name: "Program 2", count: 70 },
    { name: "Program 3", count: 60 },
    { name: "Program 4", count: 50 },
    { name: "Program 5", count: 40 },
  ]);
  const [courseName, setCourseName] = useState("Course 1");

  // allocation result object
  const [allocationResult, setAllocationResult] = useState(null);

  


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

  /* Build selectable spaces (zones + rooms) as before */
  const baseRooms = useMemo(() => {
    return spaceRows.map((r) => ({
      key: `room:${r.building}:${r.room}`,
      id: r.room,
      label: `${r.building} ${r.room}`,
      building: r.building,
      level: r.level,
      capacity: r.capacity,
      kind: "room",
      members: [r.room],
    }));
  }, [spaceRows]);

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

  const zonedRoomIds = useMemo(() => {
    const s = new Set();
    for (const z of zones) for (const m of z.members) s.add(m);
    return s;
  }, [zones]);

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

  // Adjust selected when toggle changes
  useEffect(() => {
    setSelected((prev) => {
      const allowed = new Set(selectableSpaces.map((x) => x.key));
      const next = new Set();
      for (const k of prev) if (allowed.has(k)) next.add(k);
      return next;
    });
  }, [useZones, selectableSpaces]);

  function toggleSelect(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /* ---- Allocation logic over all selected spaces ---- */
  function runAllocation() {
    // Prepare selected spaces in sensible order (zones first already)
    const map = new Map(selectableSpaces.map((s) => [s.key, s]));
    const selectedList = Array.from(selected).map((k) => map.get(k)).filter(Boolean);

    // Starting remaining students per program
    const progRemaining = programs.map((p) => Math.max(0, Math.floor(Number(p.count) || 0)));
    const totalStudents = progRemaining.reduce((s, x) => s + x, 0);

    const roomAllocations = [];

    for (const s of selectedList) {
      if (progRemaining.reduce((a, b) => a + b, 0) === 0) break; // nothing left

      const alloc = allocateForRoom(s.capacity, progRemaining);

      // store and subtract
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

    // final remaining per program & summary
    const remaining = progRemaining.slice();
    const allocatedTotals = programs.map((_, i) =>
      roomAllocations.reduce((s, r) => s + (r.allocated[i] || 0), 0)
    );
    const summary = {
      totalStudents,
      allocatedTotals,
      remaining,
    };

    setAllocationResult({ rooms: roomAllocations, summary, programs: programs.map((p) => p.name) });
  }

  /* UI helpers */
  const selectedSpaces = useMemo(() => {
    const map = new Map(selectableSpaces.map((x) => [x.key, x]));
    return Array.from(selected)
      .map((k) => map.get(k))
      .filter(Boolean);
  }, [selected, selectableSpaces]);

  const totalSelectedCapacity = useMemo(() => selectedSpaces.reduce((s, x) => s + x.capacity, 0), [selectedSpaces]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Space Allocation Tool</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* left column: data + program inputs */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Data & Settings</h2>
          <p style={{ margin: 0 }}>
            Rooms: <b>{baseRooms.length}</b> &nbsp;|&nbsp; Zones: <b>{zones.length}</b>
          </p>

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={useZones}
              onChange={(e) => setUseZones(e.target.checked)}
            />
            Use Combined Zones
          </label>

        {/* Course name */}
        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Course Name</label>
          <input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            style={{ width: "100%", padding: 8 }}
            placeholder="e.g., ENG101"
            />
        </div>

        {/* Programs */}
        <div style={{ marginTop: 12 }}>
          <h3 style={{ margin: "8px 0" }}>Programs (5)</h3>

          {programs.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={p.name}
                onChange={(e) =>
                  setPrograms((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], name: e.target.value };
                    return next;
                  })
                }
                style={{ flex: 1, padding: 8 }}
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
                style={{ width: 120, padding: 8 }}
              />
            </div>
          ))}
      </div>

  {/* Buttons */}
  <div style={{ marginTop: 12 }}>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button onClick={runAllocation} style={{ padding: "10px 14px", borderRadius: 8 }}>
        Run Allocation
      </button>

      <button
        onClick={() => setAllocationResult(null)}
        style={{ padding: "10px 14px", borderRadius: 8 }}
      >
        Reset Result
      </button>

      <button
        disabled={!allocationResult}
        onClick={() => {
          const csv = buildAllocationCsv({ courseName, programs, allocationResult });
          const safeCourse = (courseName || "course").replace(/[^a-z0-9-_]+/gi, "_");
          downloadTextFile(`allocation_${safeCourse}.csv`, csv);
        }}
        style={{ padding: "10px 14px", borderRadius: 8 }}
      >
        Export CSV
      </button>
    </div>

    <div style={{ marginTop: 12, padding: 12, background: "#111", borderRadius: 10, color: "white" }}>
      <div>
        Selected spaces: <b>{selectedSpaces.length}</b>
      </div>
      <div>
        Total capacity selected: <b>{totalSelectedCapacity}</b>
      </div>
    </div>
  </div>
</div>


        {/* right column: select spaces */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Select Spaces</h2>
          <div style={{ maxHeight: 520, overflow: "auto", border: "1px solid #eee", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Use</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Type</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Building</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Space</th>
                  <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #eee" }}>Capacity</th>
                </tr>
              </thead>
              <tbody>
                {selectableSpaces.map((s) => {
                  const isRoomInZone = useZones && s.kind === "room" && zonedRoomIds.has(s.id);
                  const disabled = isRoomInZone;
                  return (
                    <tr key={s.key} style={{ opacity: disabled ? 0.45 : 1 }}>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f3f3" }}>
                        <input type="checkbox" checked={selected.has(s.key)} disabled={disabled} onChange={() => toggleSelect(s.key)} />
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f3f3" }}>{s.kind}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f3f3" }}>{s.building}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f3f3" }}>{s.label}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f3f3" }}>{s.capacity}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Allocation results */}
      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Allocation Results</h2>

        {!allocationResult ? (
          <p>No allocation run yet. Click <b>Run Allocation</b>.</p>
        ) : (
          <>
            <h3>Summary</h3>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>Total students: <b>{allocationResult.summary.totalStudents}</b></div>
              <div>Allocated total: <b>{allocationResult.summary.allocatedTotals.reduce((a,b)=>a+b,0)}</b></div>
              <div>Unallocated (remaining): <b>{allocationResult.summary.remaining.reduce((a,b)=>a+b,0)}</b></div>
            </div>

            <h3 style={{ marginTop: 12 }}>Per-program totals</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Program</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Requested</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Allocated</th>
                  <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {allocationResult.programs.map((name, i) => (
                  <tr key={name}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{name}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{programs[i].count}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{allocationResult.summary.allocatedTotals[i]}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{allocationResult.summary.remaining[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 style={{ marginTop: 12 }}>Room allocations</h3>
            <div style={{ maxHeight: 380, overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Space</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Cap</th>
                    <th style={{ padding: 8, borderBottom: "1px solid #eee" }}>Total Alloc</th>
                    {allocationResult.programs.map((p) => <th key={p} style={{ padding: 8, borderBottom: "1px solid #eee" }}>{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {allocationResult.rooms.map((r) => (
                    <tr key={r.key}>
                      <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.label}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.capacity}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.totalAllocated}</td>
                      {r.allocated.map((v, i) => <td key={i} style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{v}</td>)}
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
