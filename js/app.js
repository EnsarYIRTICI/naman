// js/app.js

const APP_VERSION = "2.0";

let data = [];
let orderChannels = [];

function normalize(s) {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/I/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C");
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

function render() {
  const input = document.getElementById("q");
  const results = document.getElementById("results");
  const count = document.getElementById("count");

  const raw = input.value.trim();
  const q = normalize(raw);
  const filtered = q
    ? data.filter((d) => normalize(d.n).includes(q) || d.c.includes(raw))
    : data;

  count.textContent = q
    ? `${filtered.length} sonuç bulundu`
    : `${data.length} ürün listeleniyor`;

  if (filtered.length === 0) {
    results.innerHTML = '<div class="empty">Sonuç bulunamadı</div>';
    return;
  }

  let html = "";
  let lastGroup = null;
  filtered.forEach((d) => {
    if (d.g !== lastGroup) {
      html += `<div class="group-title">${d.g}</div><ul>`;
      lastGroup = d.g;
    }
    html += `<li><span class="name">${highlight(d.n, q)}</span><span class="code">${highlight(d.c, raw)}</span></li>`;
  });
  html += "</ul>";
  results.innerHTML = html;
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
  } catch (err) {
    count.textContent = "Veri yüklenemedi: " + err.message;
    console.error("products.json yüklenirken hata:", err);
    return;
  }

  renderChannels();
  render();
  input.addEventListener("input", render);
}

document.addEventListener("DOMContentLoaded", init);
