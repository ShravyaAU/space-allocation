import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function toNum(x) {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export default function App() {
  const [spaceRows, setSpaceRows] = useState([]);
  const [combinedRows, setCombinedRows] = useState([]);

  const [useZones, setUseZones] = useState(true);
  const [selected, setSelected] = useState(() => new Set());

  // Load space_division.csv
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

  // Load combined_spaces.csv
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

  // Base rooms
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

  // For disabling rooms that are inside any zone (when useZones is ON)
  const zonedRoomIds = useMemo(() => {
    const s = new Set();
    for (const z of zones) for (const m of z.members) s.add(m);
    return s;
  }, [zones]);

  // The list we display for selection
  const selectableSpaces = useMemo(() => {
    const list = useZones ? [...zones, ...baseRooms] : [...baseRooms];
    // Sort: building then kind then id
    return list.sort((a, b) => {
      const ab = a.building.localeCompare(b.building);
      if (ab !== 0) return ab;
      const ak = a.kind.localeCompare(b.kind);
      if (ak !== 0) return ak;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [useZones, zones, baseRooms]);

  // Auto-select everything on first load (when data arrives)
  useEffect(() => {
    if (selectableSpaces.length === 0) return;
    setSelected(new Set(selectableSpaces.map((x) => x.key)));
  }, [selectableSpaces.length]); // run once when populated

  // If zones toggle changes, clean invalid selections
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

  const selectedSpaces = useMemo(() => {
    const map = new Map(selectableSpaces.map((x) => [x.key, x]));
    return Array.from(selected)
      .map((k) => map.get(k))
      .filter(Boolean);
  }, [selected, selectableSpaces]);

  const totalSelectedCapacity = useMemo(() => {
    return selectedSpaces.reduce((sum, x) => sum + x.capacity, 0);
  }, [selectedSpaces]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Space Allocation Tool</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Data Loaded</h2>
          <p style={{ margin: 0, opacity: 0.85 }}>
            Rooms: <b>{baseRooms.length}</b> &nbsp;|&nbsp; Zones: <b>{zones.length}</b>
          </p>

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={useZones}
              onChange={(e) => setUseZones(e.target.checked)}
            />
            Use Combined Zones (recommended)
          </label>

          <p style={{ marginTop: 10, opacity: 0.75 }}>
            When zones are ON, rooms that belong to a zone will be disabled to avoid double counting.
          </p>

          <div style={{ marginTop: 12, padding: 12, background: "#111", borderRadius: 12 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>Selected spaces: <b>{selectedSpaces.length}</b></div>
              <div>Total capacity selected: <b>{totalSelectedCapacity}</b></div>
            </div>
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Select Spaces</h2>

          <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid #eee", borderRadius: 10 }}>
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
                        <input
                          type="checkbox"
                          checked={selected.has(s.key)}
                          disabled={disabled}
                          onChange={() => toggleSelect(s.key)}
                        />
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

          <p style={{ marginTop: 10, opacity: 0.75 }}>
            Tip: keep “Use Combined Zones” ON if you want DS-320-321 etc. to act as one space.
          </p>
        </div>
      </div>
    </div>
  );
}
