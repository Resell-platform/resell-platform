export type UserRole = "buyer" | "seller";
export type ModerationStatus = "pending" | "approved" | "rejected" | "flagged";
export type TrustBadge = "email_verified" | "phone_verified" | "profile_complete";

export type User = {
  id: string;
  name: string;
  role: UserRole;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  pickupArea?: string;
  bio?: string;
  avatarUrl?: string;
  trustBadges?: TrustBadge[];
};

export type AccountStatus = "active" | "disabled";

export type UserAccount = {
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type UserProfile = {
  userId: string;
  displayName: string;
  bio: string;
  location: string;
  avatarDataUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type ListingStatus = "available" | "reserved" | "sold" | "paused";
export type ListingCondition = "new" | "like_new" | "good" | "fair";

export type ListingImage = {
  id: string;
  name: string;
  dataUrl: string;
  primary: boolean;
  createdAt: string;
};

export const MAX_LISTING_ITEMS = 12;

export type ListingItem = {
  id: string;
  listingId?: string;
  name: string;
  price?: number;
  condition?: ListingCondition;
  notes?: string;
  position: number;
  createdAt: string;
};

export type Listing = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: ListingCondition;
  location: string;
  images: ListingImage[];
  items: ListingItem[];
  status: ListingStatus;
  moderationStatus?: ModerationStatus;
  createdAt: string;
  updatedAt: string;
};

export type ReservationStatus =
  | "requested"
  | "awaiting_payment"
  | "payment_sent"
  | "paid"
  | "overdue"
  | "cancelled"
  | "sold";

export type Reservation = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: ReservationStatus;
  paymentDueAt: string;
  overdueNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  reservationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type NotificationType =
  | "reservation_created"
  | "message_received"
  | "payment_due"
  | "payment_overdue"
  | "payment_paid";

export type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string;
  readAt?: string;
  createdAt: string;
};

export type AppState = {
  users: User[];
  activeUserId: string;
  activeAccountId?: string;
  accounts?: UserAccount[];
  profiles?: UserProfile[];
  listings: Listing[];
  reservations: Reservation[];
  messages: Message[];
  notifications: Notification[];
};

export type ListingDraft = {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: ListingCondition;
  location: string;
  images: ListingImage[];
  items: ListingItem[];
};

export type RegistrationDraft = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  bio?: string;
  location?: string;
  avatarDataUrl?: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type ProfileDraft = {
  displayName: string;
  bio?: string;
  location?: string;
  avatarDataUrl?: string;
};

export type AccountActionError =
  | "invalid_email"
  | "email_taken"
  | "weak_password"
  | "name_required"
  | "invalid_credentials"
  | "account_disabled"
  | "user_not_found";

export type AccountActionResult =
  | {
      ok: true;
      state: AppState;
      user: User;
      profile: UserProfile;
      account?: UserAccount;
    }
  | {
      ok: false;
      state: AppState;
      error: AccountActionError;
      message: string;
    };
