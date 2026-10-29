import { cn } from "@/lib/utils";

export function BrandedLoading({
  message = "Cargando tu espacio de trabajo",
  fullScreen = false
}: {
  message?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={cn("brand-loading", fullScreen && "brand-loading--fullscreen")}
      data-loading-screen={fullScreen ? "app" : "section"}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="brand-loading-content">
        <div className="brand-loading-tv" aria-hidden="true">
          <div className="brand-loading-bezel">
            <div className="brand-loading-screen">
              <img
                src="/brand/chetech-horizontal-white.svg"
                alt=""
                width={176}
                height={52}
                className="brand-loading-logo"
                fetchPriority="high"
              />
            </div>
            <span className="brand-loading-power" />
          </div>
          <div className="brand-loading-stand" />
        </div>
        <p className="brand-loading-message">{message}</p>
        <p className="brand-loading-caption">Preparando la información del local.</p>
        <div className="brand-loading-track" aria-hidden="true">
          <span className="brand-loading-activity" />
        </div>
      </div>
    </div>
  );
}
