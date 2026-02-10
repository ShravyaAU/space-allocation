# Space Allocation Tool

A web-based planning tool to allocate first-year students from multiple programs into shared classrooms while respecting room capacities and combined space constraints.

🔗 **Live Demo:** https://space-allocation-khaki.vercel.app  


---

## Features

- Allocate students from **multiple programs** into shared spaces
- Support for **combined zones** (multiple rooms treated as one space)
- **Building → Level → Room** hierarchical selection
- Live **capacity validation** with warnings
- Fair, proportional allocation across programs
- Export allocation results as **CSV**
- Clean, admin-friendly UI

---

## How It Works

### 1. Allocation Parameters
- Enter the **course name**
- Enter student counts for each program
- Enable or disable **Combined Zones**

A capacity banner will immediately tell you if selected spaces can accommodate all students.

---

### 2. Room Selection
Rooms are organized by:
Building
└─ Level
└─ Rooms / Combined Zones


You can:
- Filter by building
- Search by room number, level, or zone ID
- Select or clear rooms in bulk
- Expand only the sections you need

---

### 3. Run Allocation
Click **Run Allocation** to distribute students proportionally across selected spaces.

The results include:
- Per-program totals
- Per-room breakdowns
- Remaining capacity (if any)

---

### 4. Export CSV
Click **Export CSV** to download a file containing:
- Course summary
- Room-by-room student allocations
- Program-wise counts

---

## CSV Data Sources

The app reads room data from CSV files located in:
public/data/
├─ space_division.csv
└─ combined_spaces.csv

## Tech Stack

React + Vite
JavaScript
PapaParse (CSV parsing)
Vercel (deployment)

## Local Development
npm install
npm run dev

## Deployment

The app is deployed using Vercel.
Any push to the main branch automatically triggers a new deployment.

## License

This project is for academic and planning use.

### 3.3 Commit & push README
```bash
git add README.md
git commit -m "Add project README"
git push