import { NextResponse } from "next/server"

// Server-side proxy to the Make invoice webhook.
// Avoids browser CORS issues and keeps the webhook URL out of the client bundle.
export async function POST(request: Request) {
  const webhookUrl =
    process.env.INVOICE_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_INVOICE_WEBHOOK_URL

  if (!webhookUrl) {
    return NextResponse.json(
      { ok: false, error: "Webhook no configurado en el servidor" },
      { status: 500 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return NextResponse.json(
        { ok: false, error: `Make respondió ${res.status}`, body },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error de red al contactar Make" },
      { status: 502 }
    )
  }
}
