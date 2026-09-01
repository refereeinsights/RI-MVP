export function isPublicSmsOptInEnabled(value = process.env.CORRALIO_SMS_OPT_IN_ENABLED): boolean {
  return value === "true";
}
