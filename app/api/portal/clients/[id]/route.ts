import { getProfile } from "@/lib/portal/data";
import { updateClientBilling } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const profile = await getProfile();
  if (profile?.role !== "admin") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "invalid_body" }, { status: 400 });

  const result = await updateClientBilling(id, {
    plan: body.plan,
    monthlyPriceNok: body.monthlyPriceNok === "" || body.monthlyPriceNok == null ? null : Number(body.monthlyPriceNok),
    status: body.status,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
  });

  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ ok: true });
}
