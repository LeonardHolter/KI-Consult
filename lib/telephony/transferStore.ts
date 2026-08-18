import fs from "fs";
import path from "path";
import { del, get, put } from "@vercel/blob";

// Hand-off marker between the agent leg and the TeXML dial-done callback.
//
// Why this exists: Telnyx does NOT act on SIP REFER from the dialed endpoint
// on TeXML calls — tested live 2026-08-18, the REFER was accepted by OpenAI
// and the call simply died. So transfers happen at the TeXML layer instead:
// the call runner writes a marker keyed by the X-Transfer-Key we minted for
// the call, hangs up the agent leg, and Telnyx's <Dial action> callback
// (/api/telephony/dial-done) finds the marker and dials the human. The
// marker is take-once — read it and it's gone, so a retried callback can't
// double-dial.

const blobPath = (key: string) => `telephony/transfers/${key}.json`;
const filePath = (key: string) =>
  path.join(process.cwd(), "data", "telephony", "transfers", `${key}.json`);

const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Only [a-z0-9-]: the key is minted by us (randomUUID), and anything else
 *  in a query param must not become a blob path. */
const validKey = (key: string) => /^[a-z0-9-]{8,64}$/i.test(key);

/** Records «this call wants to be handed to `target` when the agent leg
 *  ends». Returns false when the marker could not be stored — the caller
 *  should then NOT hang up, and tell the model the transfer failed. */
export async function requestTransfer(key: string, target: string): Promise<boolean> {
  if (!validKey(key)) return false;
  try {
    if (blobConfigured()) {
      await put(blobPath(key), JSON.stringify({ target }), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } else {
      fs.mkdirSync(path.dirname(filePath(key)), { recursive: true });
      fs.writeFileSync(filePath(key), JSON.stringify({ target }));
    }
    return true;
  } catch {
    return false;
  }
}

/** Take-once read: returns the transfer target for the key and removes the
 *  marker, or null when no transfer was requested (the normal call end). */
export async function takeTransfer(key: string | null): Promise<string | null> {
  if (!key || !validKey(key)) return null;
  try {
    if (blobConfigured()) {
      const result = await get(blobPath(key), { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const { target } = JSON.parse(await new Response(result.stream).text()) as { target?: string };
      await del(blobPath(key)).catch(() => undefined);
      return typeof target === "string" && target ? target : null;
    }
    if (!fs.existsSync(filePath(key))) return null;
    const { target } = JSON.parse(fs.readFileSync(filePath(key), "utf-8")) as { target?: string };
    fs.rmSync(filePath(key), { force: true });
    return typeof target === "string" && target ? target : null;
  } catch {
    return null;
  }
}
