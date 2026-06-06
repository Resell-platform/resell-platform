import type { Env } from "../../_shared/db";
import { getListingImageUrl, parseDataUrl } from "../../_shared/images";
import { errorResponse, handleApi } from "../../_shared/http";

type ListingImagePayloadRow = {
  id: string;
  data_url?: string | null;
  r2_key?: string | null;
};

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) =>
  handleApi(async () => {
    const image = await env.DB.prepare("SELECT id, data_url, r2_key FROM listing_images WHERE id = ?")
      .bind(String(params.id))
      .first<ListingImagePayloadRow>();

    if (!image) {
      return errorResponse("Image not found.", 404);
    }

    if (image.r2_key) {
      return Response.redirect(new URL(getListingImageUrl(image), request.url).toString(), 302);
    }

    if (!image.data_url) {
      return errorResponse("Image data is not available.", 404);
    }

    if (image.data_url.startsWith("/api/images/") || image.data_url.startsWith("http://") || image.data_url.startsWith("https://")) {
      return Response.redirect(new URL(image.data_url, request.url).toString(), 302);
    }

    const parsed = parseDataUrl(image.data_url);
    if (!parsed) {
      return errorResponse("Image data is not available.", 404);
    }

    return new Response(parsed.bytes, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": parsed.contentType
      }
    });
  });
