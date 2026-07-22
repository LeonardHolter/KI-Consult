import { describe, expect, it } from "vitest";
import { planRecordingUpload, MIN_RECORDING_BYTES } from "@/lib/voiceRecordings.client";

// The incident these pin down: a client-dashboard call produced no saved
// recording and no error. Every "don't upload" decision must carry a reason
// (so the console shows WHY), and a healthy capture must produce a correct
// upload plan.

const chunk = (bytes: number) => new Blob([new Uint8Array(bytes)]);

describe("planRecordingUpload", () => {
  it("plans an upload for a healthy capture, with metadata in the URL", () => {
    const startedAt = Date.parse("2026-07-22T10:00:00.000Z");
    const decision = planRecordingUpload({
      chunks: [chunk(MIN_RECORDING_BYTES)],
      mimeType: "audio/webm;codecs=opus",
      startedAt,
      clientId: "client-1",
      now: startedAt + 90_000,
    });

    expect(decision.plan).not.toBeNull();
    const url = new URL(decision.plan!.url, "http://x");
    expect(url.pathname).toBe("/api/portal/voice-agent/recordings");
    expect(url.searchParams.get("startedAt")).toBe("2026-07-22T10:00:00.000Z");
    expect(url.searchParams.get("durationSeconds")).toBe("90");
    expect(url.searchParams.get("clientId")).toBe("client-1");
    expect(decision.plan!.contentType).toBe("audio/webm;codecs=opus");
    expect(decision.plan!.blob.size).toBe(MIN_RECORDING_BYTES);
  });

  it("omits clientId from the URL when not set — the server pins client users itself", () => {
    const decision = planRecordingUpload({
      chunks: [chunk(MIN_RECORDING_BYTES)],
      mimeType: "audio/webm",
      startedAt: Date.now(),
    });
    expect(decision.plan).not.toBeNull();
    expect(decision.plan!.url).not.toContain("clientId");
  });

  it("skips with a reason when the recorder captured zero chunks (suspended AudioContext)", () => {
    const decision = planRecordingUpload({
      chunks: [],
      mimeType: "audio/webm",
      startedAt: Date.now(),
    });
    expect(decision.plan).toBeNull();
    expect(decision.reason).toMatch(/no audio chunks/i);
  });

  it("skips with a reason when the call never connected", () => {
    const decision = planRecordingUpload({
      chunks: [chunk(MIN_RECORDING_BYTES)],
      mimeType: "audio/webm",
      startedAt: 0,
    });
    expect(decision.plan).toBeNull();
    expect(decision.reason).toMatch(/never connected/i);
  });

  it("skips header-only captures below the size floor, stating the sizes", () => {
    const decision = planRecordingUpload({
      chunks: [chunk(1024)],
      mimeType: "audio/webm",
      startedAt: Date.now(),
    });
    expect(decision.plan).toBeNull();
    expect(decision.reason).toMatch(/too small \(1024 B/);
  });

  it("defaults the content type when the recorder reports none", () => {
    const decision = planRecordingUpload({
      chunks: [chunk(MIN_RECORDING_BYTES)],
      mimeType: "",
      startedAt: Date.now(),
    });
    expect(decision.plan!.contentType).toBe("audio/webm");
  });
});
