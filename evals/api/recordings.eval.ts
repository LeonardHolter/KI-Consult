import { beforeEach, describe, expect, it, vi } from "vitest";

// End-to-end tests of the recordings API — the full save/list/play/delete
// chain for BOTH roles, exercising the real route handlers with an
// in-memory blob store and a switchable auth profile. Motivated by a live
// incident where a client-dashboard call left no recording anywhere; these
// prove the server side of that chain cannot be the silent link.

const blobStore = new Map<string, Buffer | string>();

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (key: string) => {
    if (!blobStore.has(key)) return null;
    const val = blobStore.get(key)!;
    const body = typeof val === "string" ? val : new Uint8Array(val);
    return { statusCode: 200, stream: new Response(body).body };
  }),
  put: vi.fn(async (key: string, body: Buffer | string) => {
    blobStore.set(key, body);
    return { url: `https://blob.test/${key}` };
  }),
  del: vi.fn(async (key: string) => {
    blobStore.delete(key);
  }),
}));

// Switchable auth: each test decides who is calling.
let currentProfile: { role: "admin" | "client"; client_id: string | null } | null = null;
vi.mock("@/lib/portal/data", () => ({
  getProfile: vi.fn(async () => currentProfile),
}));

import { GET as LIST, POST as UPLOAD } from "@/app/api/portal/voice-agent/recordings/route";
import {
  DELETE as DELETE_ONE,
  GET as PLAY,
} from "@/app/api/portal/voice-agent/recordings/[id]/route";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";
const asAdmin = () => (currentProfile = { role: "admin", client_id: null });
const asClient = () => (currentProfile = { role: "client", client_id: CLIENT_ID });

const AUDIO = Buffer.alloc(30 * 1024, 7);

function uploadReq(query: string) {
  return new Request(`http://test/api/portal/voice-agent/recordings?${query}`, {
    method: "POST",
    headers: { "Content-Type": "audio/webm;codecs=opus" },
    body: new Uint8Array(AUDIO),
  });
}

async function upload(query: string): Promise<{ id: string }> {
  const res = await UPLOAD(uploadReq(query));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  return body.recording;
}

async function list(query = ""): Promise<{ id: string; recordedBy?: string }[]> {
  const res = await LIST(new Request(`http://test/api/portal/voice-agent/recordings?${query}`));
  expect(res.status).toBe(200);
  return (await res.json()).recordings;
}

function play(id: string, query: string, headers: Record<string, string> = {}) {
  return PLAY(
    new Request(`http://test/api/portal/voice-agent/recordings/${id}?${query}`, { headers }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  blobStore.clear();
  currentProfile = null;
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
});

describe("saving", () => {
  it("a client-dashboard upload lands under the client's own id, tagged client — query param ignored", async () => {
    asClient();
    const rec = await upload(
      `clientId=EVIL-OTHER-CLIENT&startedAt=2026-07-22T10:00:00.000Z&durationSeconds=42`,
    );
    expect(rec.id).toBeTruthy();

    // Stored under the AUTH profile's client, not the query param.
    expect([...blobStore.keys()].every((k) => k.startsWith(`${CLIENT_ID}/`))).toBe(true);

    const mine = await list();
    expect(mine).toHaveLength(1);
    expect(mine[0].recordedBy).toBe("client");
  });

  it("an admin upload is tagged admin and stored under the chosen client", async () => {
    asAdmin();
    await upload(`clientId=${CLIENT_ID}&startedAt=2026-07-22T11:00:00.000Z&durationSeconds=30`);
    const all = await list(`clientId=${CLIENT_ID}`);
    expect(all).toHaveLength(1);
    expect(all[0].recordedBy).toBe("admin");
  });

  it("rejects an unauthenticated upload and an empty body", async () => {
    currentProfile = null;
    expect((await UPLOAD(uploadReq("startedAt=2026-07-22T10:00:00.000Z&durationSeconds=1"))).status).toBe(403);

    asClient();
    const empty = new Request(
      "http://test/api/portal/voice-agent/recordings?startedAt=2026-07-22T10:00:00.000Z&durationSeconds=1",
      { method: "POST", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array(0) },
    );
    expect((await UPLOAD(empty)).status).toBe(400);
  });
});

describe("visibility — the both-dashboards contract", () => {
  it("a client call shows on BOTH dashboards; an admin test call only on the admin's", async () => {
    asClient();
    const clientRec = await upload(`startedAt=2026-07-22T10:00:00.000Z&durationSeconds=42`);
    asAdmin();
    const adminRec = await upload(
      `clientId=${CLIENT_ID}&startedAt=2026-07-22T11:00:00.000Z&durationSeconds=30`,
    );

    const adminSees = await list(`clientId=${CLIENT_ID}`);
    expect(adminSees.map((r) => r.id).sort()).toEqual([clientRec.id, adminRec.id].sort());

    asClient();
    const clientSees = await list();
    expect(clientSees.map((r) => r.id)).toEqual([clientRec.id]);
  });

  it("playback follows the same rule — a client gets 404 on an admin recording", async () => {
    asAdmin();
    const adminRec = await upload(
      `clientId=${CLIENT_ID}&startedAt=2026-07-22T11:00:00.000Z&durationSeconds=30`,
    );
    asClient();
    const clientRec = await upload(`startedAt=2026-07-22T10:00:00.000Z&durationSeconds=42`);

    expect((await play(clientRec.id, "")).status).toBe(200);
    expect((await play(adminRec.id, "")).status).toBe(404);

    asAdmin();
    expect((await play(adminRec.id, `clientId=${CLIENT_ID}`)).status).toBe(200);
  });

  it("playback sends Content-Length and honors Range (the seekable-scrubber contract)", async () => {
    asAdmin();
    const rec = await upload(
      `clientId=${CLIENT_ID}&startedAt=2026-07-22T11:00:00.000Z&durationSeconds=30`,
    );

    const full = await play(rec.id, `clientId=${CLIENT_ID}`);
    expect(full.headers.get("Content-Length")).toBe(String(AUDIO.byteLength));
    expect(full.headers.get("Accept-Ranges")).toBe("bytes");
    expect(full.headers.get("Content-Type")).toBe("audio/webm;codecs=opus");

    const partial = await play(rec.id, `clientId=${CLIENT_ID}`, { range: "bytes=100-199" });
    expect(partial.status).toBe(206);
    expect(partial.headers.get("Content-Range")).toBe(`bytes 100-199/${AUDIO.byteLength}`);
    expect((await partial.arrayBuffer()).byteLength).toBe(100);

    const beyond = await play(rec.id, `clientId=${CLIENT_ID}`, {
      range: `bytes=${AUDIO.byteLength}-`,
    });
    expect(beyond.status).toBe(416);
  });
});

describe("deletion", () => {
  it("only an admin can delete; the recording is then gone for everyone", async () => {
    asClient();
    const rec = await upload(`startedAt=2026-07-22T10:00:00.000Z&durationSeconds=42`);

    const denied = await DELETE_ONE(
      new Request(`http://test/api/portal/voice-agent/recordings/${rec.id}?clientId=${CLIENT_ID}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: rec.id }) },
    );
    expect(denied.status).toBe(403);

    asAdmin();
    const ok = await DELETE_ONE(
      new Request(`http://test/api/portal/voice-agent/recordings/${rec.id}?clientId=${CLIENT_ID}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: rec.id }) },
    );
    expect(ok.status).toBe(200);

    expect(await list(`clientId=${CLIENT_ID}`)).toHaveLength(0);
    expect((await play(rec.id, `clientId=${CLIENT_ID}`)).status).toBe(404);
  });
});
