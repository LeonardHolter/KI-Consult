import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recording webhook downloads a URL from the request body and stores it,
// so the two things that matter are: it stores real Telnyx recordings as
// phone recordings, and it refuses to fetch a non-Telnyx URL (SSRF guard).

const { saveRecording } = vi.hoisted(() => ({ saveRecording: vi.fn(async () => ({})) }));
vi.mock("@/lib/voiceRecordings", () => ({ saveRecording }));
vi.mock("@/lib/telephony/config", () => ({ PHONE_CLIENT_ID: "handz-on" }));

import { POST } from "@/app/api/telephony/telnyx-recording/route";

const post = (body: unknown) =>
  POST(new Request("http://test/api/telephony/telnyx-recording", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

const savedEvent = (mp3: string) => ({
  data: {
    event_type: "call.recording.saved",
    payload: {
      recording_started_at: "2026-07-24T14:00:00.000Z",
      recording_ended_at: "2026-07-24T14:02:00.000Z",
      recording_urls: { mp3 },
    },
  },
});

beforeEach(() => {
  saveRecording.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("telnyx-recording webhook", () => {
  it("downloads a Telnyx recording and stores it tagged as a phone call", async () => {
    const res = await post(savedEvent("https://recordings.telnyx.com/abc.mp3"));
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://recordings.telnyx.com/abc.mp3", expect.anything());
    expect(saveRecording).toHaveBeenCalledWith(
      "handz-on",
      expect.objectContaining({ recordedBy: "phone", durationSeconds: 120, mimeType: "audio/mpeg" }),
      expect.any(Buffer),
    );
  });

  it("refuses to fetch a non-Telnyx URL (SSRF guard)", async () => {
    const res = await post(savedEvent("https://evil.example.com/steal.mp3"));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it("acks unrelated events without storing anything", async () => {
    const res = await post({ data: { event_type: "call.answered", payload: {} } });
    expect(res.status).toBe(200);
    expect(saveRecording).not.toHaveBeenCalled();
  });
});
