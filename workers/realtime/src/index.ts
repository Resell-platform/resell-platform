import { triageFeedbackSubmissions, type FeedbackTriageResult } from "./feedbackTriage";

type BroadcastResponse = {
  ok: true;
  delivered: number;
};

type Env = {
  DB: D1Database;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  MAINTENANCE_TOKEN?: string;
};

type MaintenanceResult = {
  expiredReservations: number;
  feedback: FeedbackTriageResult | null;
  failures: string[];
};

const MAINTENANCE_PATH = "/internal/maintenance/run";
const WORKER_HEADERS = { "x-resell-worker": "realtime-maintenance-v1" };

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
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === MAINTENANCE_PATH) {
      return runMaintenanceEndpoint(request, env);
    }

    return new Response("Not found", { status: 404, headers: WORKER_HEADERS });
  },
  async scheduled(_controller: ScheduledController, env: Env) {
    await runScheduledMaintenance(env);
  }
};

async function runMaintenanceEndpoint(request: Request, env: Env) {
  if (!env.MAINTENANCE_TOKEN) {
    return new Response("Maintenance is not configured", { status: 503, headers: WORKER_HEADERS });
  }
  if (getBearerToken(request) !== env.MAINTENANCE_TOKEN) {
    return new Response("Unauthorized", { status: 401, headers: WORKER_HEADERS });
  }

  const result = await runScheduledMaintenance(env);
  return Response.json(
    {
      ok: result.failures.length === 0,
      ...result
    },
    { status: result.failures.length ? 500 : 200, headers: WORKER_HEADERS }
  );
}

async function runScheduledMaintenance(env: Env): Promise<MaintenanceResult> {
  const [expiredReservations, feedback] = await Promise.allSettled([
    expireReservationHolds(env.DB),
    triageFeedbackSubmissions(env)
  ]);

  const result: MaintenanceResult = {
    expiredReservations: 0,
    feedback: null,
    failures: []
  };

  if (expiredReservations.status === "fulfilled") {
    result.expiredReservations = expiredReservations.value;
  } else {
    result.failures.push(toErrorMessage(expiredReservations.reason));
  }

  if (feedback.status === "fulfilled") {
    result.feedback = feedback.value;
  } else {
    result.failures.push(toErrorMessage(feedback.reason));
  }

  if (result.failures.length) {
    for (const failure of result.failures) console.error(failure);
  }

  return result;
}

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

  let expiredCount = 0;
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
    expiredCount += updated.meta.changes;

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

  return expiredCount;
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? (token ?? "") : "";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
