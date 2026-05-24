import { verifyEmailCode } from "../../_shared/auth";
import { readState, type Env } from "../../_shared/db";
import { handleApi, jsonResponse, readJson } from "../../_shared/http";

type VerifyCodeBody = {
  email: string;
  code: string;
  displayName?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) =>
  handleApi(async () => {
    const body = await readJson<VerifyCodeBody>(request);
    const result = await verifyEmailCode(
      env,
      body.email,
      body.code,
      body.displayName,
      new URL(request.url).protocol === "https:"
    );
    return jsonResponse(
      {
        user: result.user,
        state: await readState(env.DB, result.user)
      },
      {
        headers: {
          "set-cookie": result.cookie
        }
      }
    );
  });
