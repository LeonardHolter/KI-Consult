// Shared types for the voice-demo tuner — same shape as the handzon-voice-lab
// tuning lab, since this panel is that lab's controls ported into the portal.

export type TurnDetectionConfig =
  | { type: "semantic_vad"; eagerness: "auto" | "low" | "medium" | "high"; interrupt_response: boolean }
  | {
      type: "server_vad";
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
      interrupt_response: boolean;
    };

export type VoiceDemoSettings = {
  model: string;
  voice: string;
  speed: number;
  turnDetection: TurnDetectionConfig;
  noiseReduction: "near_field" | "far_field" | "off";
  transcriptionModel: string;
  transcriptionLanguage: string;
};

export type PromptSnapshot = {
  instructions: string;
  savedAt: string;
};

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; at: number }
  | { kind: "assistant"; id: string; text: string; at: number; done: boolean; clipped?: boolean }
  | { kind: "system"; id: string; text: string; at: number };

export type CallEvent = {
  at: number;
  dir: "in" | "out";
  type: string;
  payload: unknown;
};
