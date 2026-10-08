import { Sidebar } from "@/components/layout/sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentProfile } from "@/lib/auth";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getCurrentProfile();

  return (
    <div className="admin-shell min-h-svh px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-3 lg:py-3 lg:pr-5 lg:pl-2">
      <a className="skip-link" href="#main-content">Ir al contenido</a>
      <MobileNavigation role={profile.role} />
      <div className="grid min-h-[calc(100svh-1.5rem)] w-full gap-3 pt-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5 lg:pt-0 xl:grid-cols-[236px_minmax(0,1fr)]">
        <div className="admin-sidebar hidden lg:block lg:h-[calc(100svh-1.5rem)] lg:w-[220px] xl:w-[236px]">
          <div className="fixed left-2 top-3 z-30 h-[calc(100svh-1.5rem)] w-[220px] xl:w-[236px]">
            <Sidebar role={profile.role} />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="admin-topbar hidden lg:block">
            <Topbar />
          </div>
          <main className="admin-main page-shell outline-none" id="main-content" tabIndex={-1}>{children}</main>
        </div>
      </div>
    </div>
  );
}
