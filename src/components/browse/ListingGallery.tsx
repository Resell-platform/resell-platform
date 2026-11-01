import { getPrimaryImage } from "../../data/store";
import type { Listing } from "../../data/types";
import { ListingImagePlaceholder } from "./ListingImagePlaceholder";

export function ListingGallery({ listing }: { listing: Listing }) {
  const primaryImage = getPrimaryImage(listing);
  return (
    <div className="gallery">
      {primaryImage ? (
        <img className="hero-image" src={primaryImage} alt="" />
      ) : (
        <ListingImagePlaceholder className="hero-image" />
      )}
      {listing.images.length > 0 && (
        <div className="thumb-row">
          {listing.images.map((image) => (
            <img key={image.id} src={image.dataUrl} alt="" />
          ))}
        </div>
      )}
    </div>
  );
}
