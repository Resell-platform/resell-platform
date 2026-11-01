import { Search } from "lucide-react";

export function ListingImagePlaceholder({ className }: { className?: string }) {
  return (
    <div className={className ? `listing-image-placeholder ${className}` : "listing-image-placeholder"}>
      <Search size={28} />
    </div>
  );
}
