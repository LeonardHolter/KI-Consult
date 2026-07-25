import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recording webhook downloads a URL from the request body and stores it.
// What matters: both Telnyx payload shapes (TeXML recordingStatusCallback and
// native call.recording.saved) store as phone recordings, retries are
// idempotent, and a non-Telnyx URL is never fetched (SSRF guard).

const { saveRecording, listRecordings } = vi.hoisted(() => ({
  saveRecording: vi.fn(async () => ({})),
  listRecordings: vi.fn(async () => [] as { id: string }[]),
}));
vi.mock("@/lib/voiceRecordings", () => ({ saveRecording, listRecordings }));
vi.mock("@/lib/telephony/config", () => ({ PHONE_CLIENT_ID: "handz-on" }));

import { POST } from "@/app/api/telephony/telnyx-recording/route";

const postJson = (body: unknown) =>
  POST(new Request("http://test/api/telephony/telnyx-recording", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

const postForm = (fields: Record<string, string>) =>
  POST(new Request("http://test/api/telephony/telnyx-recording", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  }));

// Shape 1: what our <Dial record recordingStatusCallback> actually sends.
const texmlCallback = (url: string) => ({
  AccountSid: "acc-1",
  CallSid: "v3:abc",
  RecordingChannels: 2,
  RecordingDuration: "95",
  RecordingSid: "rec-123",
  RecordingSource: "DialVerb",
  RecordingStatus: "completed",
  RecordingUrl: url,
});

// Shape 2: Telnyx-native number-level recording event.
const nativeEvent = (mp3: string) => ({
  data: {
    event_type: "call.recording.saved",
    payload: {
      recording_started_at: "2026-07-25T14:00:00.000Z",
      recording_ended_at: "2026-07-25T14:02:00.000Z",
      recording_urls: { mp3 },
    },
  },
});

beforeEach(() => {
  saveRecording.mockClear();
  listRecordings.mockClear();
  listRecordings.mockResolvedValue([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("telnyx-recording webhook", () => {
  it("stores a TeXML recordingStatusCallback (JSON) as a phone recording", async () => {
    const res = await postJson(texmlCallback("https://api.telnyx.com/v2/recordings/rec-123/download"));
    expect(res.status).toBe(200);
    expect(saveRecording).toHaveBeenCalledWith(
      "handz-on",
      expect.objectContaining({
        id: "phone-rec-123",
        recordedBy: "phone",
        durationSeconds: 95,
        mimeType: "audio/mpeg",
      }),
      expect.any(Buffer),
    );
  });

  it("stores the form-encoded variant of the same callback", async () => {
    const res = await postForm({
      RecordingSid: "rec-form",
      RecordingStatus: "completed",
      RecordingDuration: "12",
      RecordingUrl: "https://recordings.telnyx.com/x.mp3",
    });
    expect(res.status).toBe(200);
    expect(saveRecording).toHaveBeenCalledWith(
      "handz-on",
      expect.objectContaining({ id: "phone-rec-form", durationSeconds: 12 }),
      expect.any(Buffer),
    );
  });

  it("is idempotent: a webhook retry for an already-stored recording acks without re-downloading", async () => {
    listRecordings.mockResolvedValue([{ id: "phone-rec-123" }]);
    const res = await postJson(texmlCallback("https://api.telnyx.com/v2/recordings/rec-123/download"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it("stores a native call.recording.saved event", async () => {
    const res = await postJson(nativeEvent("https://recordings.telnyx.com/abc.mp3"));
    expect(res.status).toBe(200);
    expect(saveRecording).toHaveBeenCalledWith(
      "handz-on",
      expect.objectContaining({ recordedBy: "phone", durationSeconds: 120, mimeType: "audio/mpeg" }),
      expect.any(Buffer),
    );
  });

  it("refuses to fetch a non-Telnyx URL (SSRF guard) for both shapes", async () => {
    expect((await postJson(texmlCallback("https://evil.example.com/steal.mp3"))).status).toBe(400);
    expect((await postJson(nativeEvent("https://evil.example.com/steal.mp3"))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it("acks unrelated/in-progress events without storing anything", async () => {
    expect((await postJson({ data: { event_type: "call.answered", payload: {} } })).status).toBe(200);
    expect(
      (
        await postForm({
          RecordingSid: "rec-x",
          RecordingStatus: "in-progress",
          RecordingUrl: "https://recordings.telnyx.com/x.mp3",
        })
      ).status,
    ).toBe(200);
    expect(saveRecording).not.toHaveBeenCalled();
  });
});
