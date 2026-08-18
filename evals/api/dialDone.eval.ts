import { describe, expect, it, vi } from "vitest";

// The dial-done callback is the second half of a transfer: marker set ->
// dial the human with our own line as caller ID; no marker (every normal
// call end) -> hang up, same as before the callback existed. The marker is
// takeTransfer'd exactly once per request.

const { takeTransfer } = vi.hoisted(() => ({
  takeTransfer: vi.fn(async (): Promise<string | null> => null),
}));
vi.mock("@/lib/telephony/transferStore", () => ({ takeTransfer }));

import { POST } from "@/app/api/telephony/dial-done/route";

const post = (qs: string) =>
  POST(
    new Request(`https://www.kiconsult.no/api/telephony/dial-done?${qs}`, {
      method: "POST",
      headers: { host: "www.kiconsult.no", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ DialCallStatus: "completed" }),
    }),
  );

describe("dial-done", () => {
  it("no marker -> hangup", async () => {
    takeTransfer.mockResolvedValueOnce(null);
    const body = await (await post("client=c1&dialed=%2B4723509651&key=k1")).text();
    expect(body).toContain("<Hangup/>");
    expect(body).not.toContain("<Dial");
    expect(takeTransfer).toHaveBeenCalledWith("k1");
  });

  it("marker set -> dials the human with the line as caller ID", async () => {
    takeTransfer.mockResolvedValueOnce("+4798252356");
    const body = await (await post("client=c1&dialed=%2B4723509651&key=k1")).text();
    expect(body).toContain('<Dial callerId="+4723509651">+4798252356</Dial>');
    expect(body).not.toContain("Hangup");
  });

  it("marker without a dialed number still dials, without callerId", async () => {
    takeTransfer.mockResolvedValueOnce("+4798252356");
    const body = await (await post("key=k1")).text();
    expect(body).toContain("<Dial>+4798252356</Dial>");
  });
});
