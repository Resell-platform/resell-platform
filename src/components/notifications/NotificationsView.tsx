import { Bell, CheckCircle2 } from "lucide-react";
import type { AppState } from "../../data/types";
import { statusLabel, type Copy, type Locale } from "../../i18n";

export function NotificationsView({
  state,
  activeUserId,
  markAllRead,
  enableBrowserAlerts,
  canEnableBrowserAlerts,
  text,
  locale
}: {
  state: AppState;
  activeUserId: string;
  markAllRead: () => void;
  enableBrowserAlerts: () => void;
  canEnableBrowserAlerts: boolean;
  text: Copy;
  locale: Locale;
}) {
  const unreadNotifications = state.notifications.filter(
    (notification) => notification.userId === activeUserId && !notification.readAt
  );

  return (
    <section className="workspace">
      <div className="panel">
        <div className="section-header">
          <div>
            <p className="eyebrow">{text.notifications}</p>
            <h1>{text.notificationsHeading}</h1>
          </div>
          <div className="button-row">
            {canEnableBrowserAlerts && (
              <button className="secondary" onClick={enableBrowserAlerts}>
                <Bell size={16} />
                {text.enableAlerts}
              </button>
            )}
            <button className="secondary" disabled={unreadNotifications.length === 0} onClick={markAllRead}>
              <CheckCircle2 size={16} />
              {text.markRead}
            </button>
          </div>
        </div>
        <div className="notifications">
          {unreadNotifications.map((notification) => (
            <article className="notice unread" key={notification.id}>
              <span className={`badge ${notification.type}`}>{statusLabel(notification.type, locale)}</span>
              <h2>{notification.title}</h2>
              <p>{notification.body}</p>
              <time>{new Date(notification.createdAt).toLocaleString()}</time>
            </article>
          ))}
          {unreadNotifications.length === 0 && <p className="muted">{text.noUnread}</p>}
        </div>
      </div>
    </section>
  );
}
