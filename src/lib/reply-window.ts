/** Meta only allows a free-form reply within 24h of the member's last inbound
 *  message. Measured from contact.lastInboundAt (distinct from the human-mode
 *  reversion window in contact-mode.ts, which anchors on modeChangedAt). */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isReplyWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < REPLY_WINDOW_MS;
}

/** Whole hours left in the window; 0 when closed or never messaged. */
export function hoursRemaining(lastInboundAt: Date | null, now: Date): number {
  if (!lastInboundAt) return 0;
  const left = REPLY_WINDOW_MS - (now.getTime() - lastInboundAt.getTime());
  return left <= 0 ? 0 : Math.floor(left / (60 * 60 * 1000));
}
