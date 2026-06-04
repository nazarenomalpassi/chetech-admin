import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="admin-shell min-h-screen py-3 pr-3 pl-1 lg:py-4 lg:pr-5 lg:pl-2">
      <div className="grid min-h-[calc(100vh-1.5rem)] w-full gap-3 xl:grid-cols-[292px_minmax(0,1fr)] xl:gap-4">
        <div className="admin-sidebar xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:self-start">
          <Sidebar />
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
