import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { startPreviewServer } from "./preview-server.js";

const fakeSource = () => {
  const listeners = new Set();
  const pixels = new Uint8Array(4 * 2);
  pixels[0] = 1;
  return {
    snapshot: () => ({ width: 4, height: 2, pixels, on: true, inverted: false, contrast: 0x8f }),
    onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    fire: () => listeners.forEach((fn) => fn()),
  };
};

const get = (url, method = "GET", headers = {}) =>
  new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });

const start = async (opts = {}) => {
  const keys = [];
  const src = fakeSource();
  const srv = await startPreviewServer({ source: src, port: 0, onKey: (k) => keys.push(k), keys: () => [{ key: "1", label: "Left" }], ...opts });
  return { srv, src, keys };
};

test("serves_page_png_and_keys", async () => {
  const { srv, keys } = await start();
  try {
    const page = await get(srv.url);
    assert.equal(page.status, 200);
    assert.match(page.body.toString(), /<canvas/);
    const png = await get(`${srv.url}frame.png?scale=3`);
    assert.equal(png.type, "image/png");
    assert.equal(png.body.readUInt32BE(16), 12);
    const k = await get(`${srv.url}keys`);
    assert.deepEqual(JSON.parse(k.body), [{ key: "1", label: "Left" }]);
    assert.equal((await get(`${srv.url}key?name=1`, "POST")).status, 204);
    assert.equal((await get(`${srv.url}key?name=zz!`, "POST")).status, 400);
    assert.deepEqual(keys, ["1"]);
  } finally {
    await srv.close();
  }
});

test("streams_frames_over_sse", async () => {
  const { srv, src } = await start();
  try {
    const frames = await new Promise((resolve, reject) => {
      const got = [];
      const req = request(`${srv.url}events`, (res) => {
        assert.equal(res.headers["content-type"], "text/event-stream");
        let buf = "";
        res.on("data", (c) => {
          buf += c;
          const events = buf.split("\n\n").filter((e) => e.startsWith("data: "));
          if (events.length === 1 && got.length === 0) {
            got.push(1);
            src.fire(); // a change after connect pushes a second frame
          }
          if (events.length >= 2) {
            req.destroy();
            resolve(events.map((e) => JSON.parse(e.slice(6))));
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(frames[0].width, 4);
    assert.equal(frames[0].on, true);
    assert.equal(Buffer.from(frames[0].pixels, "base64")[0], 1);
  } finally {
    await srv.close();
  }
});

test("falls_forward_when_port_taken", async () => {
  const a = await start({ port: 0 });
  const port = Number(new URL(a.srv.url).port);
  const b = await start({ port });
  try {
    assert.notEqual(new URL(b.srv.url).port, String(port));
  } finally {
    await a.srv.close();
    await b.srv.close();
  }
});

test("key_presses_only_from_its_own_page", async () => {
  const { srv, keys } = await start();
  try {
    const own = new URL(srv.url).origin;
    assert.equal((await get(`${srv.url}key?name=1`, "POST", { origin: own })).status, 204);
    assert.equal((await get(`${srv.url}key?name=1`, "POST", { origin: "https://evil.example" })).status, 403);
    assert.equal((await get(`${srv.url}key?name=1`, "POST", { origin: "null" })).status, 403);
    assert.deepEqual(keys, ["1"]);
  } finally {
    await srv.close();
  }
});

test("refuses_requests_addressed_to_a_foreign_host_name", async () => {
  const { srv, keys } = await start();
  try {
    assert.equal((await get(srv.url, "GET", { host: "evil.example:8130" })).status, 403);
    assert.equal((await get(`${srv.url}key?name=1`, "POST", { host: "evil.example" })).status, 403);
    assert.equal((await get(srv.url, "GET", { host: `localhost:${new URL(srv.url).port}` })).status, 200);
    assert.deepEqual(keys, []);
  } finally {
    await srv.close();
  }
});

test("accepts_named_keys_like_space_and_up", async () => {
  const { srv, keys } = await start();
  try {
    assert.equal((await get(`${srv.url}key?name=space`, "POST")).status, 204);
    assert.equal((await get(`${srv.url}key?name=up`, "POST")).status, 204);
    assert.equal((await get(`${srv.url}key?name=${"x".repeat(17)}`, "POST")).status, 400);
    assert.deepEqual(keys, ["space", "up"]);
  } finally {
    await srv.close();
  }
});
