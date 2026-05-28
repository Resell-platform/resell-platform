import { requireCurrentUser } from "../_shared/auth";
import { readState, sendMessageInDb, type Env, type SendMessageResult } from "../_shared/db";
import { handleApi, jsonResponse, readJson } from "../_shared/http";

type SendMessageBody = {
  reservationId: string;
  body: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<SendMessageBody>(request);
    const result = await sendMessageInDb(env.DB, body.reservationId, user.id, body.body);
    await broadcastMessageCreated(env, result);
    return jsonResponse(await readState(env.DB, user), { status: 201 });
  });

async function broadcastMessageCreated(env: Env, result: SendMessageResult) {
  if (!env.CHAT_USER_HUB) {
    console.error("Realtime chat broadcast skipped: CHAT_USER_HUB binding is missing.");
    return;
  }

  const broadcasts = [...new Set(result.participantUserIds)].map((userId) =>
    env.CHAT_USER_HUB!.getByName(userId)
      .fetch("https://chat-user-hub/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          version: 1,
          type: "message.created",
          message: result.message,
          notification: result.notification.userId === userId ? result.notification : undefined
        })
      })
      .then((response) => {
        if (!response.ok) {
          console.error(`Realtime chat broadcast failed for ${userId}: ${response.status}`);
        }
      })
  );

  const settled = await Promise.allSettled(broadcasts);
  for (const broadcast of settled) {
    if (broadcast.status === "rejected") {
      console.error("Failed to broadcast message.created", broadcast.reason);
    }
  }
}
