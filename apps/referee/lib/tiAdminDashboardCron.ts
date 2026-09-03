export type TiAdminCronSyncOutcome<T> = T | { error: "booking_sync_failed" };

export async function executeTiAdminDashboardCron<TSync, TEmail>(dependencies: {
  syncBookings: () => Promise<TSync>;
  sendEmail: () => Promise<TEmail>;
  logSyncFailure?: () => void;
}): Promise<
  | { ok: true; bookingSync: TiAdminCronSyncOutcome<TSync>; email: TEmail }
  | { ok: false; bookingSync: TiAdminCronSyncOutcome<TSync>; error: "admin_email_failed" }
> {
  let bookingSync: TiAdminCronSyncOutcome<TSync>;
  try {
    bookingSync = await dependencies.syncBookings();
  } catch {
    dependencies.logSyncFailure?.();
    bookingSync = { error: "booking_sync_failed" };
  }

  try {
    return { ok: true, bookingSync, email: await dependencies.sendEmail() };
  } catch {
    return { ok: false, bookingSync, error: "admin_email_failed" };
  }
}
