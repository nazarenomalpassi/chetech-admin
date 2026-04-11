import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireUser } from "@/lib/auth";

export default async function AdminLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireUser();

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[280px_1fr]">
        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <Sidebar />
        </div>
        <div className="space-y-4">
          <Topbar />
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
