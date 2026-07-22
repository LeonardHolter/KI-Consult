// Browser-side upload planning for call recordings — extracted from
// VoiceAgentCard so the decision logic is unit-testable. A live incident
// motivated this: a client-dashboard call produced NO saved recording and
// NO error, because every skip path was silent. The planner returns a
// reason for every "no upload" decision so the caller can log it.

export type RecordingUploadPlan = {
  url: string;
  contentType: string;
  blob: Blob;
  durationSeconds: number;
};

export type RecordingUploadDecision =
  | { plan: RecordingUploadPlan; reason?: undefined }
  | { plan: null; reason: string };

/** Below this the capture is container headers, not a conversation. */
export const MIN_RECORDING_BYTES = 20 * 1024;

export function planRecordingUpload(opts: {
  chunks: Blob[];
  mimeType: string;
  startedAt: number;
  clientId?: string;
  minBytes?: number;
  now?: number;
}): RecordingUploadDecision {
  const { chunks, mimeType, startedAt, clientId } = opts;
  const minBytes = opts.minBytes ?? MIN_RECORDING_BYTES;
  if (!startedAt) return { plan: null, reason: "call never connected (no start timestamp)" };
  if (chunks.length === 0) {
    return {
      plan: null,
      reason:
        "no audio chunks captured — recorder produced zero data (suspended AudioContext?)",
    };
  }
  const contentType = mimeType || "audio/webm";
  const blob = new Blob(chunks, { type: contentType });
  if (blob.size < minBytes) {
    return { plan: null, reason: `capture too small (${blob.size} B < ${minBytes} B)` };
  }
  const now = opts.now ?? Date.now();
  const durationSeconds = (now - startedAt) / 1000;
  const params = new URLSearchParams({
    startedAt: new Date(startedAt).toISOString(),
    durationSeconds: String(durationSeconds),
  });
  if (clientId) params.set("clientId", clientId);
  return {
    plan: {
      url: `/api/portal/voice-agent/recordings?${params}`,
      contentType,
      blob,
      durationSeconds,
    },
  };
}
