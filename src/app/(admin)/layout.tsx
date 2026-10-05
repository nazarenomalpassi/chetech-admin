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
    <div className="admin-shell min-h-svh px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-3 lg:py-4 lg:pr-5 lg:pl-2">
      <MobileNavigation role={profile.role} />
      <div className="grid min-h-[calc(100svh-1.5rem)] w-full gap-3 pt-3 xl:grid-cols-[248px_minmax(0,1fr)] xl:gap-4 xl:pt-0 2xl:grid-cols-[268px_minmax(0,1fr)]">
        <div className="admin-sidebar hidden xl:block xl:h-[calc(100svh-2rem)] xl:w-[248px] 2xl:w-[268px]">
          <div className="fixed left-2 top-4 z-30 h-[calc(100svh-2rem)] w-[248px] 2xl:w-[268px]">
            <Sidebar role={profile.role} />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="admin-topbar hidden xl:block">
            <Topbar />
          </div>
          <main className="admin-main page-shell">{children}</main>
        </div>
      </div>
    </div>
  );
}
