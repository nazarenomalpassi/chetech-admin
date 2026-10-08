import { CalendarDays } from "lucide-react";

function getArgentinaDateLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date());
}

export function Topbar() {
  const dateLabel = getArgentinaDateLabel();

  return <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line pb-3 text-sm text-slate-600">
    <p>Gestión del local</p>
    <time className="flex shrink-0 items-center gap-2"><CalendarDays aria-hidden="true" className="h-4 w-4" />{dateLabel}</time>
  </header>;
}
