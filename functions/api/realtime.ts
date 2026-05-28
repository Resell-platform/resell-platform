import { requireCurrentUser } from "../_shared/auth";
import type { Env } from "../_shared/db";
import { ApiError, handleApi } from "../_shared/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    requireWebSocketUpgrade(request);
    requireSameOrigin(request);

    const user = await requireCurrentUser(request, env);
    if (!env.CHAT_USER_HUB) {
      throw new ApiError("Realtime chat is not configured.", 503);
    }
    return env.CHAT_USER_HUB.getByName(user.id).fetch(request);
  });

function requireWebSocketUpgrade(request: Request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw new ApiError("WebSocket upgrade required.", 426);
  }
}

function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError("WebSocket origin is not allowed.", 403);
  }
}
