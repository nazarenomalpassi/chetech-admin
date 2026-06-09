import { Sidebar } from "@/components/layout/sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireUser();

  return (
    <div className="admin-shell min-h-svh px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-3 lg:py-4 lg:pr-5 lg:pl-2">
      <MobileNavigation />
      <div className="grid min-h-[calc(100svh-1.5rem)] w-full gap-3 pt-3 xl:grid-cols-[292px_minmax(0,1fr)] xl:gap-4 xl:pt-0">
        <div className="admin-sidebar hidden xl:block xl:h-[calc(100svh-2rem)] xl:w-[292px]">
          <div className="fixed left-2 top-4 z-30 h-[calc(100svh-2rem)] w-[292px]">
            <Sidebar />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="admin-topbar">
            <Topbar />
          </div>
          <main className="admin-main page-shell">{children}</main>
        </div>
      </div>
    </div>
  );
}
