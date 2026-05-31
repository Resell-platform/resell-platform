-- Reservation threads are no longer exclusive marketplace holds.
-- Keep the buyer/seller conversation rows, but release legacy listing locks.
UPDATE listings
SET status = 'available',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'reserved'
  AND EXISTS (
    SELECT 1
    FROM reservations
    WHERE reservations.listing_id = listings.id
      AND reservations.status IN ('requested', 'awaiting_payment', 'payment_sent', 'overdue')
  );
