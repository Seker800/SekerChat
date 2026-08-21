-- Preserve the publication-time recipient denominator even if a user deletion is attempted.
ALTER TABLE "SubscriptionPostRecipient"
DROP CONSTRAINT "SubscriptionPostRecipient_userId_fkey";

ALTER TABLE "SubscriptionPostRecipient"
ADD CONSTRAINT "SubscriptionPostRecipient_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
