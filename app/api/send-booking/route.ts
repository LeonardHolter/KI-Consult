export const dynamic = "force-dynamic";

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

    const emailBody = `
Ny demobooking fra KI Consult:

Bedrift: ${company}
Telefon: ${phone}
Ønsket tidspunkt: ${formattedDate}

Vennligst kontakt bedriften for å bekrefte demoen.
    `.trim();

    // For now, just return success (email sending would require env setup)
    // In production, integrate with Resend, SendGrid, or nodemailer here
    console.log("Booking received:", { company, phone, dateTime });

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
