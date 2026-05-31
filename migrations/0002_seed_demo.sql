INSERT OR IGNORE INTO users (id, name, role, created_at) VALUES
  ('seller-1', 'Avery Chen', 'seller', '2026-05-23T12:00:00.000Z'),
  ('buyer-1', 'Jordan Lee', 'buyer', '2026-05-23T12:00:00.000Z'),
  ('buyer-2', 'Mina Patel', 'buyer', '2026-05-23T12:00:00.000Z');

INSERT OR IGNORE INTO listings (
  id, seller_id, title, description, price, category, condition, location, status, created_at, updated_at
) VALUES
  (
    'listing-1',
    'seller-1',
    'Walnut writing desk',
    'Compact desk with two drawers. Minor wear on the top edge.',
    180,
    'Furniture',
    'good',
    'Brooklyn pickup',
    'available',
    '2026-05-23T12:00:00.000Z',
    '2026-05-23T12:00:00.000Z'
  ),
  (
    'listing-2',
    'seller-1',
    'Mirrorless camera kit',
    'Body, 35mm lens, battery, and strap. Great starter kit.',
    520,
    'Electronics',
    'like_new',
    'Ships from Queens',
    'available',
    '2026-05-23T12:00:00.000Z',
    '2026-05-23T12:00:00.000Z'
  );

INSERT OR IGNORE INTO listing_images (id, listing_id, name, data_url, is_primary, created_at) VALUES
  (
    'image-1',
    'listing-1',
    'desk',
    'data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 640 480''%3E%3Crect width=''640'' height=''480'' fill=''%23f2efe8''/%3E%3Crect x=''90'' y=''190'' width=''460'' height=''70'' rx=''8'' fill=''%23845b3f''/%3E%3Crect x=''125'' y=''260'' width=''45'' height=''150'' fill=''%236b4731''/%3E%3Crect x=''470'' y=''260'' width=''45'' height=''150'' fill=''%236b4731''/%3E%3Crect x=''215'' y=''275'' width=''210'' height=''95'' rx=''6'' fill=''%239b7150''/%3E%3Ccircle cx=''320'' cy=''323'' r=''9'' fill=''%23d7be8d''/%3E%3C/svg%3E',
    1,
    '2026-05-23T12:00:00.000Z'
  ),
  (
    'image-2',
    'listing-2',
    'camera',
    'data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' viewBox=''0 0 640 480''%3E%3Crect width=''640'' height=''480'' fill=''%23e9eef2''/%3E%3Crect x=''150'' y=''165'' width=''340'' height=''210'' rx=''28'' fill=''%232a3137''/%3E%3Crect x=''210'' y=''130'' width=''115'' height=''55'' rx=''14'' fill=''%2339434a''/%3E%3Ccircle cx=''320'' cy=''272'' r=''86'' fill=''%230e151a''/%3E%3Ccircle cx=''320'' cy=''272'' r=''55'' fill=''%23526f7e''/%3E%3Ccircle cx=''440'' cy=''205'' r=''18'' fill=''%23f2c14e''/%3E%3C/svg%3E',
    1,
    '2026-05-23T12:00:00.000Z'
  );

INSERT OR IGNORE INTO reservations (
  id, listing_id, buyer_id, seller_id, status, payment_due_at, created_at, updated_at
) VALUES
  (
    'reservation-1',
    'listing-2',
    'buyer-1',
    'seller-1',
    'requested',
    '2026-05-23T09:00:00.000Z',
    '2026-05-22T09:00:00.000Z',
    '2026-05-22T09:00:00.000Z'
  );

INSERT OR IGNORE INTO messages (id, reservation_id, sender_id, body, created_at) VALUES
  ('message-1', 'reservation-1', 'buyer-1', 'I can pick up tomorrow afternoon.', '2026-05-22T09:30:00.000Z'),
  ('message-2', 'reservation-1', 'seller-1', 'Sounds good. Please confirm pickup by tomorrow morning.', '2026-05-22T10:00:00.000Z');
