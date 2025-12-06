// script.js (module)
import {
  ref,
  onValue,
  onChildAdded,
  push,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Ensure firebase db was initialized in the global scope (window.appDb)
const db = window.appDb;
if (!db) {
  console.warn("Firebase DB not found on window.appDb. Make sure firebase is initialized before loading script.js");
}

// DOM elements
const hrText = document.getElementById("hr");
const spo2Text = document.getElementById("spo2");
const tempText = document.getElementById("temp");

const hrCard = document.getElementById("hrCard");
const spo2Card = document.getElementById("spo2Card");
const tempCard = document.getElementById("tempCard");

const riskText = document.getElementById("riskText");
const recommendText = document.getElementById("recommendText");

const alertSound = document.getElementById("alertSound");

const alertList = document.getElementById("alertList");
const alertCount = document.getElementById("alertCount");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

// ---------- Chart.js setup ----------
const hrChart = new Chart(document.getElementById("hrChart"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Heart Rate (bpm)", data: [] }] },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    elements: { point: { radius: 0 } },
    tension: 0.25
  }
});

const spo2Chart = new Chart(document.getElementById("spo2Chart"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "SpO₂ (%)", data: [] }] },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    elements: { point: { radius: 0 } },
    tension: 0.25
  }
});

const tempChart = new Chart(document.getElementById("tempChart"), {
  type: "line",
  data: { labels: [], datasets: [{ label: "Temperature (°C)", data: [] }] },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    elements: { point: { radius: 0 } },
    tension: 0.25
  }
});

let popupShown = false;

// ---------- Listen for vitals ----------
const patientRef = ref(db, "patients/patient1");

onValue(patientRef, (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  const hr = Number(data.heartRate ?? data.heart_rate ?? 0);
  const spo2 = Number(data.spo2 ?? 0);
  const temp = Number(data.temperature ?? 0);

  const timeLabel = new Date().toLocaleTimeString();

  // UI numbers
  hrText.textContent = hr;
  spo2Text.textContent = spo2;
  tempText.textContent = isNaN(temp) ? "--" : temp.toFixed(1);

  // Charts
  appendPoint(hrChart, timeLabel, hr);
  appendPoint(spo2Chart, timeLabel, spo2);
  appendPoint(tempChart, timeLabel, temp);

  // Clear previous alert styles
  [hrCard, spo2Card, tempCard].forEach(c => c.classList.remove("alert"));

  // ---------- ALERT TRIGGER CONDITIONS ----------
  let alertTriggered = false;
  let hazardReasons = [];

  // High heart rate
  if (hr > 120) {
    hrCard.classList.add("alert");
    alertTriggered = true;
    hazardReasons.push("❤️ High heart rate (>120 bpm)");
  }
  // Low heart rate
  else if (hr < 60) {
    hrCard.classList.add("alert");
    alertTriggered = true;
    hazardReasons.push("❤️ Low heart rate (<60 bpm)");
  }

  // Low SpO₂
  if (spo2 < 92) {
    spo2Card.classList.add("alert");
    alertTriggered = true;
    hazardReasons.push("🫁 Low SpO₂ (<92%)");
  }

  // High temperature
  if (temp > 38) {
    tempCard.classList.add("alert");
    alertTriggered = true;
    hazardReasons.push("🌡 High temperature (>38°C)");
  }
  // Low temperature
  else if (temp < 36) {
    tempCard.classList.add("alert");
    alertTriggered = true;
    hazardReasons.push("🌡 Low temperature (<36°C)");
  }

  // ---------- AI RISK SCORING ----------
  let score = 0;

  // HR scoring
  if (hr > 120) score += 2;
  else if (hr >= 100) score += 1;
  else if (hr < 60) score += 2;

  // SpO₂ scoring
  if (spo2 < 92) score += 3;
  else if (spo2 < 95) score += 1;

  // Temperature scoring (high + low)
  if (temp > 38) score += 2;
  else if (temp >= 37.5) score += 1;
  else if (temp < 36) score += 2;

  // ---------- RISK LABEL ----------
  riskText.classList.remove("risk-normal", "risk-warning", "risk-critical");

  let riskLabel = "Normal";
  if (score <= 1) {
    riskLabel = "Normal";
    riskText.classList.add("risk-normal");
  } else if (score <= 3) {
    riskLabel = "Warning";
    riskText.classList.add("risk-warning");
  } else {
    riskLabel = "Critical";
    riskText.classList.add("risk-critical");
  }
  riskText.textContent = `${riskLabel} (${score})`;

  // ---------- PERSONALIZED RECOMMENDATIONS ----------
  const rec = [];

  if (hr > 120) rec.push("❤️ High heart rate — sit down, breathe slowly, and avoid physical strain.");
  if (hr < 60) rec.push("❤️ Low heart rate — potential bradycardia; rest and consult a doctor if persistent.");
  if (spo2 < 92) rec.push("🫁 Low oxygen — try deep breathing or move to fresh, open air.");
  if (temp > 38) rec.push("🌡 Fever — rest, drink water, and check for other symptoms.");
  if (temp < 36) rec.push("🌡 Low body temperature — keep warm, add clothing, and monitor condition.");

  if (rec.length === 0) {
    rec.push("💚 Everything looks fine — keep hydrated and maintain regular sleep.");
  }

  recommendText.innerHTML = rec.join("<br>");

  // ----- Popup + Sound + Firebase alert logging -----
  if (alertTriggered && !popupShown) {
    // Play sound if available
    try {
      alertSound?.play();
    } catch (e) {
      // autoplay might be blocked by browser—ignore
    }
    popupShown = true;

    const message =
      "⚠️ Health Alert Detected:\n" + hazardReasons.map(r => "• " + r).join("\n");
    // simple browser alert
    alert(message);

    // Log alert to Firebase
    logAlertToFirebase({
      level: riskLabel,
      hr,
      spo2,
      temp,
      reasons: hazardReasons
    });
  }
  if (!alertTriggered) {
    popupShown = false;
  }
});

// Append chart data (keep last 20 points)
function appendPoint(chart, label, value) {
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(value);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  chart.update();
}

// Helper: clear charts (reset labels & data and update)
function clearCharts() {
  const charts = [hrChart, spo2Chart, tempChart];
  charts.forEach((c) => {
    c.data.labels = [];
    c.data.datasets.forEach(d => (d.data = []));
    c.update();
  });
}

// ---------- Firebase Alert History ----------
const alertsRef = ref(db, "alerts");

function logAlertToFirebase({ level, hr, spo2, temp, reasons }) {
  const now = new Date();
  const payload = {
    level,
    hr,
    spo2,
    temperature: temp,
    reasons,
    createdAt: now.toISOString()
  };
  push(alertsRef, payload);
}

// Render alerts as they are added
let alertCounter = 0;

onChildAdded(alertsRef, (snap) => {
  const alertData = snap.val();
  if (!alertData) return;

  alertCounter++;
  alertCount.textContent = `${alertCounter} event${alertCounter > 1 ? "s" : ""}`;

  const level = (alertData.level || "Warning").toLowerCase();

  const wrapper = document.createElement("div");
  wrapper.className =
    "alert-item alert-" +
    (level === "critical"
      ? "critical"
      : level === "normal"
      ? "normal"
      : "warning");

  const date = new Date(alertData.createdAt || Date.now());

  wrapper.innerHTML = `
    <div class="alert-header-line">
      <span class="alert-level-pill">${(alertData.level || "ALERT").toUpperCase()}</span>
      <span class="alert-time">${date.toLocaleString()}</span>
    </div>
    <div class="alert-body">
      ${Array.isArray(alertData.reasons) ? alertData.reasons.join(", ") : (alertData.reasons || "Some vitals are outside normal range.")}
    </div>
    <div class="alert-vitals" aria-hidden="true">
      HR: ${alertData.hr} bpm &nbsp;&nbsp;
      SpO₂: ${alertData.spo2}% &nbsp;&nbsp;
      Temp: ${alertData.temperature}°C
    </div>
  `;

  // Newest alert on top
  alertList.insertBefore(wrapper, alertList.firstChild);
});

// ---------- Clear all history functionality ----------
clearHistoryBtn?.addEventListener("click", () => {
  // simple confirm dialog
  const ok = confirm("Delete ALL alert history? This action cannot be undone.");
  if (!ok) return;

  // disable button while deleting
  clearHistoryBtn.disabled = true;
  clearHistoryBtn.textContent = "Clearing...";

  // remove entire 'alerts' node
  remove(alertsRef)
    .then(() => {
      // Clear UI
      alertList.innerHTML = "";
      alertCounter = 0;
      alertCount.textContent = "0 events";

      // Clear charts so they don't show prior data
      clearCharts();

      // re-enable button
      clearHistoryBtn.disabled = false;
      clearHistoryBtn.textContent = "Clear History";

      // Optionally notify user
      try { alert("Alert history cleared."); } catch (e) {}
    })
    .catch((err) => {
      console.error("Failed to clear alerts:", err);
      clearHistoryBtn.disabled = false;
      clearHistoryBtn.textContent = "Clear History";
      try { alert("Failed to clear alert history. Check console for details."); } catch (e) {}
    });
});
