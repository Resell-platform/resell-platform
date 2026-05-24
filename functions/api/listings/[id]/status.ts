import { requireCurrentUser } from "../../../_shared/auth";
import { readState, updateListingStatusInDb, type Env } from "../../../_shared/db";
import { handleApi, jsonResponse, readJson } from "../../../_shared/http";
import type { ListingStatus } from "../../../../src/data/types";

type UpdateListingStatusBody = {
  status: ListingStatus;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<UpdateListingStatusBody>(request);
    await updateListingStatusInDb(env.DB, String(params.id), user.id, body.status);
    return jsonResponse(await readState(env.DB, user));
  });
