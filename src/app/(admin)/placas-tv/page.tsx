import { BoardsView } from "@/features/tv-boards/components/boards-view";
import { getTvBoards } from "@/features/tv-boards/queries";
import { requirePermission } from "@/lib/auth";

export default async function PlacasTvPage({
  searchParams
}: {
  searchParams: Promise<{
    search?: string;
    boardType?: "all" | "fuente" | "main" | "tcom" | "placa_unica";
    status?: "all" | "active" | "inactive" | "sold" | "pending_release" | "released";
  }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("boards.manage");
  const boards = await getTvBoards(params);

  return <BoardsView boards={boards} canManage={profile.role === "admin"} />;
}
