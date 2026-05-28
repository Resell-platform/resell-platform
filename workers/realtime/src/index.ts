type BroadcastResponse = {
  ok: true;
  delivered: number;
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
  }
};
