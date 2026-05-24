import { requireCurrentUser } from "../_shared/auth";
import { readState, sendMessageInDb, type Env } from "../_shared/db";
import { handleApi, jsonResponse, readJson } from "../_shared/http";

type SendMessageBody = {
  reservationId: string;
  body: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<SendMessageBody>(request);
    await sendMessageInDb(env.DB, body.reservationId, user.id, body.body);
    return jsonResponse(await readState(env.DB, user), { status: 201 });
  });
