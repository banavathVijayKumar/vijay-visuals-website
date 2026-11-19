export async function onRequestPost({ request, env }) {
  try {
    // Webhook secret must be configured in Cloudflare
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return new Response("Webhook secret not configured", {
        status: 500,
      });
    }

    // Read the original raw request body
    const rawBody = await request.arrayBuffer();

    const receivedSignature = request.headers.get(
      "X-Razorpay-Signature"
    );

    if (!receivedSignature) {
      return new Response("Missing signature", {
        status: 400,
      });
    }

    // Generate HMAC-SHA256 signature
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      rawBody
    );

    const expectedSignature = Array.from(
      new Uint8Array(signatureBuffer)
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures safely
    if (
      receivedSignature.length !== expectedSignature.length
    ) {
      return new Response("Invalid signature", {
        status: 401,
      });
    }

    let isValid = true;

    for (let i = 0; i < expectedSignature.length; i++) {
      if (
        receivedSignature[i] !== expectedSignature[i]
      ) {
        isValid = false;
      }
    }

    if (!isValid) {
      return new Response("Invalid signature", {
        status: 401,
      });
    }

    // Parse only after signature verification
    const payload = JSON.parse(
      new TextDecoder().decode(rawBody)
    );

    const event = payload.event || "unknown";
    const eventId = request.headers.get(
      "x-razorpay-event-id"
    );

    // Acknowledge verified webhook
    return Response.json({
      success: true,
      message: "Webhook received and signature verified",
      event,
      eventId,
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "Webhook processing failed",
      },
      { status: 400 }
    );
  }
}
