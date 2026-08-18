import { describe, expect, it, vi } from "vitest";

// The notify-test route must be dead without the secret (both unset and
// wrong), and pass the real outcome through when authorized.

const { notifyShop } = vi.hoisted(() => ({
  notifyShop: vi.fn(async () => ({ sent: true, to: "x@y.no" })),
}));
vi.mock("@/lib/notify", () => ({ notifyShop }));

import { POST } from "@/app/api/admin/notify-test/route";

const post = (headers: Record<string, string>) =>
  POST(new Request("https://www.kiconsult.no/api/admin/notify-test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  }));

describe("notify-test", () => {
  it("no secret configured -> 401, notifyShop never called", async () => {
    delete process.env.NOTIFY_TEST_SECRET;
    expect((await post({ "x-notify-test-secret": "anything" })).status).toBe(401);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("wrong secret -> 401", async () => {
    process.env.NOTIFY_TEST_SECRET = "s3cret";
    expect((await post({ "x-notify-test-secret": "wrong" })).status).toBe(401);
    expect(notifyShop).not.toHaveBeenCalled();
  });

  it("right secret -> sends and returns the outcome", async () => {
    process.env.NOTIFY_TEST_SECRET = "s3cret";
    const res = await post({ "x-notify-test-secret": "s3cret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, to: "x@y.no" });
    expect(notifyShop).toHaveBeenCalledTimes(1);
  });
});
