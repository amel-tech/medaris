// MDRS-151: the İletişim form posts here. Where these messages go (an inbox,
// a ticket system) is not decided yet, so this answers 503 and the form shows
// the canvas's error state, keeping what the visitor wrote. It never pretends
// a message was delivered.
export const dynamic = "force-dynamic";

export function POST() {
  console.error(
    "İletişim form: no delivery target is configured; message not sent"
  );
  return Response.json(
    { error: "contact-delivery-not-configured" },
    { status: 503 }
  );
}
