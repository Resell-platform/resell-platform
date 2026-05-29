import type { AppState } from "./types";

const now = new Date();
const pastDue = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
const futureDue = new Date(now.getTime() + 21 * 60 * 60 * 1000).toISOString();

export const seedState: AppState = {
  users: [
    { id: "seller-1", name: "Avery Chen", role: "seller" },
    { id: "buyer-1", name: "Jordan Lee", role: "buyer" },
    { id: "buyer-2", name: "Mina Patel", role: "buyer" }
  ],
  activeUserId: "seller-1",
  profiles: [
    {
      userId: "seller-1",
      displayName: "Avery Chen",
      bio: "Curates furniture, electronics, and home finds around New York.",
      location: "Brooklyn, NY",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      userId: "buyer-1",
      displayName: "Jordan Lee",
      bio: "",
      location: "Queens, NY",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      userId: "buyer-2",
      displayName: "Mina Patel",
      bio: "",
      location: "New York, NY",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ],
  accounts: [],
  listings: [
    {
      id: "listing-1",
      sellerId: "seller-1",
      title: "Walnut writing desk",
      description: "Compact desk with two drawers. Minor wear on the top edge.",
      price: 180,
      category: "Furniture",
      condition: "good",
      location: "Brooklyn pickup",
      status: "available",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      items: [
        {
          id: "listing-1-item-1",
          listingId: "listing-1",
          name: "Walnut writing desk",
          price: 180,
          condition: "good",
          notes: "Compact desk with two drawers. Minor wear on the top edge.",
          position: 0,
          createdAt: now.toISOString()
        }
      ],
      images: [
        {
          id: "image-1",
          name: "desk",
          primary: true,
          createdAt: now.toISOString(),
          dataUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 480'%3E%3Crect width='640' height='480' fill='%23f2efe8'/%3E%3Crect x='90' y='190' width='460' height='70' rx='8' fill='%23845b3f'/%3E%3Crect x='125' y='260' width='45' height='150' fill='%236b4731'/%3E%3Crect x='470' y='260' width='45' height='150' fill='%236b4731'/%3E%3Crect x='215' y='275' width='210' height='95' rx='6' fill='%239b7150'/%3E%3Ccircle cx='320' cy='323' r='9' fill='%23d7be8d'/%3E%3C/svg%3E"
        }
      ]
    },
    {
      id: "listing-2",
      sellerId: "seller-1",
      title: "Mirrorless camera kit",
      description: "Body, 35mm lens, battery, and strap. Great starter kit.",
      price: 520,
      category: "Electronics",
      condition: "like_new",
      location: "Ships from Queens",
      status: "reserved",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      items: [
        {
          id: "listing-2-item-1",
          listingId: "listing-2",
          name: "Mirrorless camera body",
          price: 430,
          condition: "like_new",
          notes: "Camera body with battery and strap.",
          position: 0,
          createdAt: now.toISOString()
        },
        {
          id: "listing-2-item-2",
          listingId: "listing-2",
          name: "35mm lens",
          price: 90,
          condition: "like_new",
          notes: "Starter prime lens included in the kit.",
          position: 1,
          createdAt: now.toISOString()
        }
      ],
      images: [
        {
          id: "image-2",
          name: "camera",
          primary: true,
          createdAt: now.toISOString(),
          dataUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 480'%3E%3Crect width='640' height='480' fill='%23e9eef2'/%3E%3Crect x='150' y='165' width='340' height='210' rx='28' fill='%232a3137'/%3E%3Crect x='210' y='130' width='115' height='55' rx='14' fill='%2339434a'/%3E%3Ccircle cx='320' cy='272' r='86' fill='%230e151a'/%3E%3Ccircle cx='320' cy='272' r='55' fill='%23526f7e'/%3E%3Ccircle cx='440' cy='205' r='18' fill='%23f2c14e'/%3E%3C/svg%3E"
        }
      ]
    }
  ],
  reservations: [
    {
      id: "reservation-1",
      listingId: "listing-2",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      status: "awaiting_payment",
      paymentDueAt: pastDue,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ],
  messages: [
    {
      id: "message-1",
      reservationId: "reservation-1",
      senderId: "buyer-1",
      body: "I can pay today and pick up tomorrow.",
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
    },
    {
      id: "message-2",
      reservationId: "reservation-1",
      senderId: "seller-1",
      body: `Sounds good. Please send payment by ${new Date(futureDue).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}.`,
      createdAt: new Date(now.getTime() - 3.5 * 60 * 60 * 1000).toISOString()
    }
  ],
  notifications: []
};
