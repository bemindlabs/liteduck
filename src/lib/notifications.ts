// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

export type NotificationType = "github" | "system";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  icon?: string;
}

// ---------------------------------------------------------------------------
// Store implementation (useSyncExternalStore-compatible)
// ---------------------------------------------------------------------------

type Listener = () => void;

class NotificationStore {
  private notifications: Notification[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  // -- Subscription -----------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): Notification[] {
    return this.notifications;
  }

  private notify() {
    // Return a new array reference so React re-renders
    this.notifications = [...this.notifications];
    this.listeners.forEach((l) => l());
  }

  // -- Mutations --------------------------------------------------------------

  addNotification(
    type: NotificationType,
    title: string,
    message: string,
    icon?: string,
  ): Notification {
    const notification: Notification = {
      id: String(this.nextId++),
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
      icon,
    };
    this.notifications = [notification, ...this.notifications];
    this.notify();
    return notification;
  }

  markRead(id: string): void {
    const idx = this.notifications.findIndex((n) => n.id === id);
    if (idx === -1 || this.notifications[idx].read) return;
    const updated = [...this.notifications];
    updated[idx] = { ...updated[idx], read: true };
    this.notifications = updated;
    this.notify();
  }

  markAllRead(): void {
    if (this.notifications.every((n) => n.read)) return;
    this.notifications = this.notifications.map((n) => (n.read ? n : { ...n, read: true }));
    this.notify();
  }

  clearAll(): void {
    if (this.notifications.length === 0) return;
    this.notifications = [];
    this.notify();
  }

  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const notificationStore = new NotificationStore();

export const { addNotification, markRead, markAllRead, clearAll, getUnreadCount } = {
  addNotification: notificationStore.addNotification.bind(notificationStore),
  markRead: notificationStore.markRead.bind(notificationStore),
  markAllRead: notificationStore.markAllRead.bind(notificationStore),
  clearAll: notificationStore.clearAll.bind(notificationStore),
  getUnreadCount: notificationStore.getUnreadCount.bind(notificationStore),
};

// No demo seeds — notifications are created by real app events.
