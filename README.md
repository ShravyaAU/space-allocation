# 🏫 Space Allocation Tool

A web-based planning tool that allocates first-year students from multiple academic programs into available rooms while respecting room capacities and combined-space constraints. Designed to automate and simplify the manual process of distributing students across buildings, levels, and rooms.

🔗 **Live Demo:** https://space-allocation-khaki.vercel.app

---

## 🚀 Features

- Allocate students from **multiple programs** into shared rooms  
- Support for **Combined Zones** (multiple rooms treated as one space)  
- Hierarchical navigation: **Building → Level → Room / Zone**  
- Real-time **capacity validation** with warnings  
- Fair, proportional allocation across programs  
- Export final allocation as a **CSV file**  
- Clean, responsive, admin-friendly UI  

---

## 🔄 How It Works

### **1. Input Parameters**
- Enter **course name**
- Enter **student intake** for each program
- Enable/disable **Combined Zones**
- The capacity banner instantly shows whether selected rooms can accommodate all students

---

### **2. Room Selection**
Rooms are organized in a clear hierarchy:
Building └── Level └── Rooms / Combined Zones


You can:
- Filter by building  
- Search by room number, level, or zone ID  
- Select or clear rooms in bulk  
- Expand only the sections you need  

---

### **3. Run Allocation**
Click **Run Allocation** to generate a proportional distribution of students across selected rooms.

The output includes:
- Per-program totals  
- Per-room breakdown  
- Remaining capacity (if any)  

---

### **4. Export CSV**
Download a CSV file containing:
- Course summary  
- Room-by-room allocations  
- Program-wise student counts  

---

## 📁 CSV Data Sources

Room and zone data are loaded from:
public/data/ ├── space_division.csv └── combined_spaces.csv


These files define:
- Room capacities  
- Combined zone mappings  
- Building/level hierarchy  

---

## 🛠️ Tech Stack

- **React + Vite** — frontend framework & build tool  
- **JavaScript** — allocation logic  
- **PapaParse** — CSV parsing  
- **Vercel** — deployment  

---

## 📂 Repository Structure
space-allocation/ │ ├── public/ │   └── data/ │       ├── space_division.csv │       └── combined_spaces.csv │ ├── src/ │   ├── assets/ │   ├── App.jsx │   ├── App.css │   ├── index.css │   └── main.jsx │ ├── index.html ├── eslint.config.js ├── README.md └── package.json


---

## 🧪 Local Development

Install dependencies:
npm install


Run the development server:
npm run dev


---

## 🚀 Deployment

The app is deployed on **Vercel**.  
Any push to the `main` branch triggers an automatic redeployment.

---

## 📜 License

This project is intended for academic and planning use.

