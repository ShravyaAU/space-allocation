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

  // Load space_division.csv
  useEffect(() => {
    Papa.parse("/data/space_division.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        // Carry-forward BUILDING/LEVEL/STUDIO because your CSV leaves them blank for subsequent rows
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

            return {
              building,
              level,
              studio,
              room,
              capacity: cap,
            };
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

  // Build "allocatable spaces"
  // - base rooms from space_division
  // - plus combined zones (each zone has capacity_override and points to member rooms)
  const baseRooms = useMemo(() => {
    return spaceRows.map((r) => ({
      id: `${r.building} | ${r.room}`,
      label: `${r.building} ${r.room}`,
      building: r.building,
      level: r.level,
      room: r.room,
      capacity: r.capacity,
      kind: "room",
      members: [r.room],
    }));
  }, [spaceRows]);

  const combinedZones = useMemo(() => {
    // Determine building prefix from combined_id like "DS-320-321"
    return combinedRows.map((z) => ({
      id: z.combined_id,
      label: z.combined_id,
      building: z.combined_id.startsWith("DS-")
        ? "Design South (DS)"
        : z.combined_id.startsWith("DN-")
        ? "Design North (DN)"
        : "Unknown",
      level: "Combined",
      room: z.combined_id,
      capacity: z.capacity_override,
      kind: "zone",
      members: z.members,
    }));
  }, [combinedRows]);

  const allocatableSpaces = useMemo(() => {
    // For now we show BOTH rooms and zones.
    return [...combinedZones, ...baseRooms];
  }, [combinedZones, baseRooms]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Space Allocation Tool</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Loaded Rooms (from space_division.csv)</h2>
          <p style={{ opacity: 0.8 }}>Count: <b>{baseRooms.length}</b></p>

          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Building</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Room</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Capacity</th>
                </tr>
              </thead>
              <tbody>
                {baseRooms.slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.building}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.room}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{r.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ opacity: 0.7, marginTop: 8 }}>Showing first 50 rows.</p>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Loaded Combined Zones (from combined_spaces.csv)</h2>
          <p style={{ opacity: 0.8 }}>Count: <b>{combinedZones.length}</b></p>

          <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #eee", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Zone</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Capacity</th>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>Members</th>
                </tr>
              </thead>
              <tbody>
                {combinedZones.map((z) => (
                  <tr key={z.id}>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{z.label}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{z.capacity}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid #f3f3f3" }}>{z.members.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Allocatable Spaces (rooms + zones)</h2>
        <p style={{ opacity: 0.8 }}>
          Total: <b>{allocatableSpaces.length}</b> (Zones first, then Rooms)
        </p>
      </div>
    </div>
  );
}
