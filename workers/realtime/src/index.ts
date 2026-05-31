type BroadcastResponse = {
  ok: true;
  delivered: number;
};

type Env = {
  DB: D1Database;
};

export class ChatUserHub {
  private readonly sockets = new Set<WebSocket>();

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return this.acceptSocket(request);
    }

    if (request.method === "POST" && new URL(request.url).pathname === "/broadcast") {
      return this.broadcast(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private acceptSocket(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();
    this.sockets.add(server);

    const removeSocket = () => {
      this.sockets.delete(server);
    };
    server.addEventListener("close", removeSocket);
    server.addEventListener("error", removeSocket);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async broadcast(request: Request): Promise<Response> {
    let message: string;
    try {
      message = JSON.stringify(await request.json());
    } catch {
      return new Response("Request body must be valid JSON", { status: 400 });
    }

    let delivered = 0;
    for (const socket of this.sockets) {
      try {
        socket.send(message);
        delivered += 1;
      } catch {
        this.sockets.delete(socket);
      }
    }

    return Response.json({ ok: true, delivered } satisfies BroadcastResponse);
  }
}

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await expireReservationHolds(env.DB);
  }
};

async function expireReservationHolds(db: D1Database) {
  const now = new Date().toISOString();
  const expiredHolds = await db
    .prepare(
      `SELECT r.id, r.buyer_id, r.seller_id, l.title, u.name AS buyer_name
       FROM reservations r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = r.buyer_id
       WHERE r.status IN ('requested', 'awaiting_payment', 'payment_sent')
         AND r.overdue_notified_at IS NULL
         AND r.payment_due_at <= ?`
    )
    .bind(now)
    .all<{ id: string; buyer_id: string; seller_id: string; title: string; buyer_name: string }>();

  for (const reservation of expiredHolds.results) {
    const updated = await db
      .prepare(
        `UPDATE reservations
         SET status = 'overdue', overdue_notified_at = ?, updated_at = ?
         WHERE id = ? AND status IN ('requested', 'awaiting_payment', 'payment_sent') AND overdue_notified_at IS NULL`
      )
      .bind(now, now, reservation.id)
      .run();

    if (!updated.meta.changes) continue;

    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO notifications (
             id, user_id, type, title, body, entity_id, dedupe_key, created_at
           ) VALUES (?, ?, 'payment_overdue', 'Hold expired', ?, ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.buyer_id,
          `The hold expired for ${reservation.title}.`,
          reservation.id,
          `reservation:${reservation.id}:hold_expired:buyer`,
          now
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO notifications (
             id, user_id, type, title, body, entity_id, dedupe_key, created_at
           ) VALUES (?, ?, 'payment_overdue', 'Hold expired', ?, ?, ?, ?)`
        )
        .bind(
          createId("notification"),
          reservation.seller_id,
          `${reservation.buyer_name} still has an expired hold for ${reservation.title}.`,
          reservation.id,
          `reservation:${reservation.id}:hold_expired:seller`,
          now
        )
    ]);
  }
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
