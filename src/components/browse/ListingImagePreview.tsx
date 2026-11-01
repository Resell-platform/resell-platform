import { getPrimaryImage } from "../../data/store";
import type { Listing } from "../../data/types";
import { ListingImagePlaceholder } from "./ListingImagePlaceholder";

export function ListingImagePreview({ listing }: { listing: Listing }) {
  const primaryImage = getPrimaryImage(listing);
  if (primaryImage) return <img src={primaryImage} alt="" />;
  return <ListingImagePlaceholder />;
}
