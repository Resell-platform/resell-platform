import { getOptionalCurrentUser } from "../_shared/auth";
import { readState, type Env } from "../_shared/db";
import { handleApi, jsonResponse } from "../_shared/http";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await getOptionalCurrentUser(request, env);
    return jsonResponse(await readState(env.DB, user));
  });
