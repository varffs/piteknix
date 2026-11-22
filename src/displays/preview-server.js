import { createServer } from "node:http";
import { toPng } from "./frame-render.js";

/**
 * Local browser preview of an emulated OLED (virtual mode only).
 * Node built-ins only. Binds to 127.0.0.1 by default.
 *
 *   GET  /            the preview page
 *   GET  /events      server-sent events, one JSON frame per change
 *   GET  /frame.png   current frame (?scale=1..16)
 *   GET  /keys        [{ key, label }] buttons to show
 *   POST /key?name=x  press a virtual key
 *
 * @param {object} o
 * @param {{snapshot: Function, onChange: Function}} o.source  e.g. an SSD1306 emulator
 * @param {(name: string) => void} o.onKey
 * @param {() => Array<{key: string, label: string}>} o.keys
 * @param {number} [o.port=8130]  tries the next 10 ports if taken; 0 = any free port
 */
export const startPreviewServer = async ({ source, onKey, keys, port = 8130, host = "127.0.0.1", title = "piteknix" }) => {
  const frameJson = () => {
    const s = source.snapshot();
    return JSON.stringify({ ...s, pixels: Buffer.from(s.pixels).toString("base64") });
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(page(title));
    }
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const send = () => res.write(`data: ${frameJson()}\n\n`);
      send();
      const off = source.onChange(send);
      req.on("close", off);
      return;
    }
    if (req.method === "GET" && url.pathname === "/frame.png") {
      const scale = Math.min(16, Math.max(1, Number(url.searchParams.get("scale")) || 1));
      res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
      return res.end(toPng(source.snapshot(), { scale }));
    }
    if (req.method === "GET" && url.pathname === "/keys") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(keys()));
    }
    if (req.method === "POST" && url.pathname === "/key") {
      const name = url.searchParams.get("name") ?? "";
      if (!/^[a-z0-9]$/i.test(name)) {
        res.writeHead(400);
        return res.end();
      }
      onKey(name);
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });

  const listen = (p) =>
    new Promise((resolve, reject) => {
      const onErr = (e) => reject(e);
      server.once("error", onErr);
      server.listen(p, host, () => {
        server.off("error", onErr);
        resolve();
      });
    });
  let bound = false;
  for (let i = 0; i <= 10 && !bound; i++) {
    try {
      await listen(port === 0 ? 0 : port + i);
      bound = true;
    } catch (e) {
      if (e.code !== "EADDRINUSE" || i === 10) throw e;
    }
  }

  const sockets = new Set();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  return {
    url: `http://${host}:${server.address().port}/`,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy(); // SSE streams never end on their own
        server.close(() => resolve());
      }),
  };
};

const page = (title) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} preview</title>
<style>
  :root { --bg:#16181c; --panel:#000; --fg:#d8dde3; --muted:#8a929c; --accent:#5aa9ff; --line:#2a2e35; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; display:flex; flex-direction:column; align-items:center; padding:24px 16px; gap:16px; }
  .bezel { background:#0b0c0e; padding:18px; border-radius:10px; box-shadow:0 0 0 1px var(--line), 0 10px 40px #0008; max-width:100%; overflow:auto; }
  canvas { display:block; image-rendering:pixelated; background:var(--panel); }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; justify-content:center; }
  button, select, a.btn { background:#22262d; color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:8px 14px; font:inherit; cursor:pointer; text-decoration:none; }
  button:hover, a.btn:hover { border-color:var(--accent); }
  button.key { min-width:88px; }
  button.key b { color:var(--accent); margin-right:6px; }
  label { color:var(--muted); display:flex; gap:6px; align-items:center; }
  #status { color:var(--muted); min-height:1.4em; }
</style></head><body>
<div class="bezel"><canvas id="c"></canvas></div>
<div id="status">connecting…</div>
<div class="row" id="keys"></div>
<div class="row">
  <label>zoom <input id="zoom" type="range" min="2" max="10" value="6"></label>
  <label><input id="grid" type="checkbox"> pixel grid</label>
  <label>colour <select id="tint">
    <option value="white">white</option><option value="blue">blue</option><option value="duo">yellow/blue</option>
  </select></label>
  <a class="btn" id="png" href="frame.png?scale=8" download="screen.png">save PNG</a>
</div>
<script>
const c = document.getElementById("c"), ctx = c.getContext("2d");
const ui = { zoom: document.getElementById("zoom"), grid: document.getElementById("grid"), tint: document.getElementById("tint"), status: document.getElementById("status") };
const pref = (k, d) => { try { return localStorage.getItem("pv." + k) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem("pv." + k, v); } catch {} };
ui.zoom.value = pref("zoom", "6"); ui.grid.checked = pref("grid", "0") === "1"; ui.tint.value = pref("tint", "white");
let frame = null, hover = null;
const TINTS = { white: () => "#f4f7ff", blue: () => "#7fc8ff", duo: (y) => (y < 16 ? "#ffd24a" : "#7fc8ff") };
function draw() {
  if (!frame) return;
  const z = Number(ui.zoom.value), w = frame.width, h = frame.height;
  c.width = w * z; c.height = h * z;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, c.width, c.height);
  const px = frame.bits;
  ctx.globalAlpha = frame.contrast < 0x20 ? 0.35 : 1;
  for (let y = 0; y < h; y++) {
    ctx.fillStyle = TINTS[ui.tint.value](y);
    for (let x = 0; x < w; x++) {
      const on = frame.on && (px[y * w + x] ^ (frame.inverted ? 1 : 0));
      if (on) ctx.fillRect(x * z, y * z, z, z);
    }
  }
  ctx.globalAlpha = 1;
  if (ui.grid.checked && z >= 4) {
    ctx.strokeStyle = "rgba(120,140,170,0.18)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= w; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, h * z); }
    for (let y = 0; y <= h; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(w * z, y * z + 0.5); }
    ctx.stroke();
  }
  const lit = frame.on ? px.reduce((a, b) => a + (b ^ (frame.inverted ? 1 : 0)), 0) : 0;
  ui.status.textContent = (frame.on ? "" : "[display off] ") + (frame.inverted ? "[inverted] " : "") +
    lit + " px lit" + (hover ? "  ·  x " + hover[0] + ", y " + hover[1] : "");
}
const es = new EventSource("events");
es.onmessage = (e) => { const f = JSON.parse(e.data); f.bits = Uint8Array.from(atob(f.pixels), (ch) => ch.charCodeAt(0)); frame = f; draw(); };
es.onerror = () => { ui.status.textContent = "disconnected — is the app running?"; };
c.addEventListener("mousemove", (e) => { const z = Number(ui.zoom.value), r = c.getBoundingClientRect(); hover = [Math.floor((e.clientX - r.left) / z), Math.floor((e.clientY - r.top) / z)]; draw(); });
c.addEventListener("mouseleave", () => { hover = null; draw(); });
for (const [k, el] of Object.entries({ zoom: ui.zoom, grid: ui.grid, tint: ui.tint })) el.addEventListener("input", () => { save(k, el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value); draw(); });
const press = (k) => fetch("key?name=" + encodeURIComponent(k), { method: "POST" });
let keyList = [];
fetch("keys").then((r) => r.json()).then((ks) => {
  keyList = ks.map((k) => k.key);
  const row = document.getElementById("keys");
  for (const k of ks) { const b = document.createElement("button"); b.className = "key"; const kb = document.createElement("b"); kb.textContent = k.key; b.append(kb, String(k.label)); b.onclick = () => press(k.key); row.append(b); }
});
addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && keyList.includes(e.key)) { e.preventDefault(); press(e.key); } });
</script></body></html>`;
