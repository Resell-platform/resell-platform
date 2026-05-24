import { requireCurrentUser } from "../_shared/auth";
import { readState, reserveListingInDb, type Env } from "../_shared/db";
import { handleApi, jsonResponse, readJson } from "../_shared/http";

type CreateReservationBody = {
  listingId: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const user = await requireCurrentUser(request, env);
    const body = await readJson<CreateReservationBody>(request);
    await reserveListingInDb(env.DB, body.listingId, user.id);
    return jsonResponse(await readState(env.DB, user), { status: 201 });
  });
