export function localDateForRequest(request: Request): string {
  const url = new URL(request.url);
  const timeZone = url.searchParams.get("tz") || request.headers.get("x-vercel-ip-timezone") || "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}
