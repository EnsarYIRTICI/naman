// js/app.js

const APP_VERSION = "2.3";

let data = [];
let orderChannels = [];
let actions = [];
let activeCat = "tumu";

const CATEGORIES = [
  { key: "tumu", label: "Tümü" },
  { key: "sebze", label: "🥬 Sebze" },
  { key: "meyve", label: "🍎 Meyve" },
  { key: "kasap", label: "🥩 Kasap" },
  { key: "sarkuteri", label: "🧀 Şarküteri" },
];

function normalize(s) {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
}

// JSON'daki "g" alanından kategori anahtarını üretir
function getCategory(group) {
  const g = normalize(group || "");
  if (g.startsWith("KASAP")) return "kasap";
  if (g.startsWith("SARKUTERI")) return "sarkuteri";
  if (g.includes("MEYVE")) return "meyve";
  if (g.includes("SEBZE")) return "sebze";
  return "diger";
}

function highlight(text, q) {
  if (!q) return text;
  const idx = normalize(text).indexOf(q);
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    "<mark>" +
    text.slice(idx, idx + q.length) +
    "</mark>" +
    text.slice(idx + q.length)
  );
}

function renderChannels() {
  const box = document.getElementById("channelBox");
  const rows = orderChannels
    .map(
      (o) =>
        `<div class="row"><span>${o.kanal}</span><span class="code">${o.kod}</span></div>`,
    )
    .join("");
  box.innerHTML = `
    <div class="title">📦 Sipariş Kanalı Kodları</div>
    ${rows}
    <div class="note">Not: Önce müşteri girilir, sonra kod enter'lanır.</div>
  `;
}

function renderChips() {
  const box = document.getElementById("categoryChips");
  box.innerHTML = CATEGORIES.map(
    (c) =>
      `<button class="chip${c.key === activeCat ? " active" : ""}" data-cat="${c.key}">${c.label}</button>`,
  ).join("");
  box.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      activeCat = chip.dataset.cat;
      renderChips();
      render();
    });
  });
}

function render() {
  const input = document.getElementById("q");
  const results = document.getElementById("results");
  const count = document.getElementById("count");

  const raw = input.value.trim();
  const q = normalize(raw);
  const filtered = data.filter((d) => {
    if (activeCat !== "tumu" && getCategory(d.g) !== activeCat) return false;
    if (!q) return true;
    return normalize(d.n).includes(q) || d.c.includes(raw);
  });

  count.textContent = q
    ? `${filtered.length} sonuç bulundu`
    : `${filtered.length} ürün listeleniyor`;

  if (filtered.length === 0) {
    results.innerHTML = '<div class="empty">Sonuç bulunamadı</div>';
    return;
  }

  let html = "";
  let lastGroup = null;
  filtered.forEach((d) => {
    const cat = getCategory(d.g);
    if (d.g !== lastGroup) {
      if (lastGroup !== null) html += "</ul>";
      html += `<div class="group-title" data-cat="${cat}">${d.g}</div><ul>`;
      lastGroup = d.g;
    }
    html += `<li data-cat="${cat}"><span class="name">${highlight(d.n, q)}</span><span class="code">${highlight(d.c, raw)}</span></li>`;
  });
  html += "</ul>";
  results.innerHTML = html;
}

function renderBarcodes() {
  const panel = document.getElementById("barkodlarPanel");
  if (!actions.length) {
    panel.innerHTML = '<div class="empty">Barkod bulunamadı</div>';
    return;
  }
  panel.innerHTML = actions
    .map(
      (a, i) => `
    <div class="barcode-row" data-idx="${i}">
      <span>${a.ad}</span>
      <span class="code">${a.kod}</span>
    </div>`,
    )
    .join("");

  panel.querySelectorAll(".barcode-row").forEach((row) => {
    row.addEventListener("click", () => openModal(actions[row.dataset.idx]));
  });
}

function openModal(action) {
  document.getElementById("modalLabel").textContent = action.ad;
  document.getElementById("barcodeModal").style.display = "flex";
  JsBarcode("#modalBarcode", action.kod, {
    format: "CODE128",
    width: 4,
    height: 160,
    displayValue: true,
    fontSize: 22,
  });
}

function closeModal() {
  document.getElementById("barcodeModal").style.display = "none";
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isUrun = tab.dataset.tab === "urunler";
      document.getElementById("urunlerPanel").style.display = isUrun
        ? ""
        : "none";
      document.getElementById("barkodlarPanel").style.display = isUrun
        ? "none"
        : "";
    });
  });
}

async function init() {
  const input = document.getElementById("q");
  const count = document.getElementById("count");

  document.getElementById("versionBadge").textContent = `v${APP_VERSION}`;
  document.getElementById("versionFooter").textContent = APP_VERSION;

  try {
    const res = await fetch("data/products.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    data = json.products || [];
    orderChannels = json.channels || [];
    actions = json.actions || [];
  } catch (err) {
    count.textContent = "Veri yüklenemedi: " + err.message;
    console.error("products.json yüklenirken hata:", err);
    return;
  }

  renderChannels();
  renderChips();
  render();
  setupTabs();
  renderBarcodes();

  input.addEventListener("input", render);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("barcodeModal").addEventListener("click", (e) => {
    if (e.target.id === "barcodeModal") closeModal();
  });
}

document.addEventListener("DOMContentLoaded", init);
