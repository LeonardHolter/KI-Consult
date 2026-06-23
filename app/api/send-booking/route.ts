import { Resend } from "resend";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { company, phone, dateTime } = await request.json();

    if (!company || !phone || !dateTime) {
      return Response.json(
        { error: "Manglende feltinformasjon" },
        { status: 400 }
      );
    }

    const date = new Date(dateTime);
    const formattedDate = date.toLocaleString("nb-NO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const emailHtml = `
      <h2>Ny demobooking fra KI Consult</h2>
      <p><strong>Bedrift:</strong> ${company}</p>
      <p><strong>Telefon:</strong> ${phone}</p>
      <p><strong>Ønsket tidspunkt:</strong> ${formattedDate}</p>
      <p>Vennligst kontakt bedriften for å bekrefte demoen.</p>
    `;

    await resend.emails.send({
      from: "KI Consult <noreply@resend.dev>",
      to: "leonard@holterholdings.com",
      subject: `Ny demobooking: ${company}`,
      html: emailHtml,
    });

    return Response.json(
      { success: true, message: "Booking registrert. Vi kontakter deg snart." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Booking error:", error);
    return Response.json(
      { error: "Noe gikk galt ved registrering av booking" },
      { status: 500 }
    );
  }
}
