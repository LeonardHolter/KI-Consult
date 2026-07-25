import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recording webhook downloads a URL from the request body and stores it.
// What matters: both Telnyx payload shapes (TeXML recordingStatusCallback and
// native call.recording.saved) store as phone recordings, retries are
// idempotent, and a non-Telnyx URL is never fetched (SSRF guard).
//
// These tests originally used INVENTED urls (recordings.telnyx.com) and so
// passed green while production dropped the very first real recording: Telnyx
// actually delivers a pre-signed s3.amazonaws.com link. Every URL below is now
// the shape Telnyx documents. Do not "tidy" them back into telnyx.com hosts.

const { saveRecording, listRecordings } = vi.hoisted(() => ({
  saveRecording: vi.fn(async () => ({})),
  listRecordings: vi.fn(async () => [] as { id: string }[]),
}));
vi.mock("@/lib/voiceRecordings", () => ({ saveRecording, listRecordings }));
vi.mock("@/lib/telephony/config", () => ({ PHONE_CLIENT_ID: "handz-on" }));

import { POST } from "@/app/api/telephony/telnyx-recording/route";

// Telnyx's documented recording link: pre-signed, bucket telephony-recorder-prod,
// signature in the query string, valid 10 minutes.
const S3_RECORDING =
  "https://s3.amazonaws.com/telephony-recorder-prod/047e057e-cb46-4b11-bb31-37987e753ed7/2026-07-25/" +
  "9977677e-85ae-11ec-826d-02420a0d7e70-1643974566.wav" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=xxx%2Faws4_request&X-Amz-Expires=600&X-Amz-Signature=xxx";

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
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TELNYX_API_KEY;
});

describe("telnyx-recording webhook", () => {
  it("stores a TeXML recordingStatusCallback (JSON) as a phone recording", async () => {
    const res = await postJson(texmlCallback(S3_RECORDING));
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
      RecordingUrl: S3_RECORDING,
    });
    expect(res.status).toBe(200);
    expect(saveRecording).toHaveBeenCalledWith(
      "handz-on",
      expect.objectContaining({ id: "phone-rec-form", durationSeconds: 12 }),
      expect.any(Buffer),
    );
  });

  // S3 rejects a request that carries BOTH a pre-signed query string and an
  // Authorization header, so sending the API key there breaks the download.
  it("sends no Authorization header to a pre-signed S3 link", async () => {
    process.env.TELNYX_API_KEY = "KEY-test";
    await postJson(texmlCallback(S3_RECORDING));
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers).toEqual({});
  });

  it("does send the API key to a telnyx.com download endpoint", async () => {
    process.env.TELNYX_API_KEY = "KEY-test";
    await postJson(nativeEvent("https://api.telnyx.com/v2/recordings/rec-1/download"));
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.headers).toEqual({ Authorization: "Bearer KEY-test" });
  });

  it("is idempotent: a webhook retry for an already-stored recording acks without re-downloading", async () => {
    listRecordings.mockResolvedValue([{ id: "phone-rec-123" }]);
    const res = await postJson(texmlCallback(S3_RECORDING));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(saveRecording).not.toHaveBeenCalled();
  });

  it("stores a native call.recording.saved event", async () => {
    const res = await postJson(nativeEvent(S3_RECORDING.replace(".wav?", ".mp3?")));
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

  // Allowing s3.amazonaws.com wholesale would reopen the SSRF hole: anyone can
  // create a bucket. Only Telnyx's recording bucket is trusted.
  it("refuses an S3 URL from a bucket that is not Telnyx's", async () => {
    const attacker = "https://s3.amazonaws.com/attacker-bucket/x.wav?X-Amz-Signature=xxx";
    const vhost = "https://attacker-bucket.s3.eu-north-1.amazonaws.com/x.wav?X-Amz-Signature=xxx";
    expect((await postJson(texmlCallback(attacker))).status).toBe(400);
    expect((await postJson(texmlCallback(vhost))).status).toBe(400);
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
          RecordingUrl: S3_RECORDING,
        })
      ).status,
    ).toBe(200);
    expect(saveRecording).not.toHaveBeenCalled();
  });
});
