"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BoardFilters } from "@/features/tv-boards/components/board-filters";
import { BoardClaimsSection } from "@/features/tv-boards/components/board-claims-section";
import { BoardClaimDialog } from "@/features/tv-boards/components/board-claim-dialog";
import { BoardFormDialog } from "@/features/tv-boards/components/board-form-dialog";
import { BoardSaleDialog } from "@/features/tv-boards/components/board-sale-dialog";
import { BoardTable } from "@/features/tv-boards/components/board-table";
import { BoxFormDialog } from "@/features/tv-boards/components/box-form-dialog";
import { BoxGrid } from "@/features/tv-boards/components/box-grid";
import { deleteTvBoardBoxAction } from "@/features/tv-boards/box-actions";
import { confirmThen } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import type { TvBoardFormValues } from "@/features/tv-boards/schemas";
import { formatCurrency } from "@/lib/utils";
import type { TvBoardBox, TvBoardFinancialSummary, TvBoardRow } from "@/features/tv-boards/model";

type BoardsFilters = {
  search?: string;
  brand?: string;
  boardType?: string;
  status?: string;
  caja?: string;
};

export function BoardsView({
  boards,
  claims,
  summary,
  canManage,
  boxes = [],
  boxesReady = false,
  selectedBox = null,
  unboxedCount = 0,
  brands = [],
  filters = {}
}: {
  boards: TvBoardRow[];
  claims: TvBoardRow[];
  summary: TvBoardFinancialSummary;
  canManage: boolean;
  boxes?: TvBoardBox[];
  /** La base tiene el organizador por cajas. Sin él, la sección se ve como antes. */
  boxesReady?: boolean;
  selectedBox?: TvBoardBox | null;
  unboxedCount?: number;
  brands?: Array<{ value: string; label: string }>;
  filters?: BoardsFilters;
}) {
  const [boxDialog, setBoxDialog] = useState<{ box: TvBoardBox | null } | null>(null);
  const boxNumbers = useMemo(() => new Map(boxes.map((box) => [box.id, box.number])), [boxes]);
  const nextBoxNumber = (boxes.at(-1)?.number ?? 0) + 1;
  const inBox = boxesReady && Boolean(filters.caja);
  const searching =
    boxesReady &&
    !inBox &&
    Boolean(
      filters.search ||
      filters.brand ||
      (filters.boardType && filters.boardType !== "all") ||
      (filters.status && filters.status !== "all")
    );
  const overview = boxesReady && !inBox && !searching;
  const pendingSales = boards.filter(
    (board) => board.isSold && board.saleStatus === "pending_release"
  );
  const storedCount = boxes.reduce((total, box) => total + box.inStock, 0) + unboxedCount;
  const [open, setOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<TvBoardFormValues | null>(null);
  const [selectedSaleBoard, setSelectedSaleBoard] = useState<{
    id: string;
    brand: string;
    model: string;
    price: number;
  } | null>(null);
  const [claimDialog, setClaimDialog] = useState<{
    board: TvBoardRow;
    mode: "start" | "resolve";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [updatedVersions, setUpdatedVersions] = useState<Record<string, number>>({});

  function recordSaleChange(id: string, recordVersion: number | undefined, message: string) {
    if (recordVersion !== undefined) {
      setUpdatedVersions((previous) => ({
        ...previous,
        [id]: Math.max(previous[id] ?? 0, recordVersion)
      }));
    }
    setNotice(message);
  }

  function openNewBoard() {
    setSelectedBoard(null);
    setOpen(true);
  }

  const financeCard = (
    <Card>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Neto de ventas</dt>
          <dd className="mt-1 wrap-break-word">
            <span className="text-xl font-semibold text-foreground tabular-nums">
              {formatCurrency(summary.salesNetAmount)}
            </span>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Incluye dinero retenido; excluye ventas anuladas.
            </p>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-muted-foreground">Pendiente de confirmar</dt>
          <dd className="mt-1 wrap-break-word">
            <span className="text-xl font-semibold text-foreground tabular-nums">
              {formatCurrency(summary.pendingAmount)}
            </span>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ventas sin reclamos abiertos.
            </p>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-warning">Dinero retenido</dt>
          <dd className="mt-1 wrap-break-word">
            <span className="text-xl font-semibold text-warning tabular-nums">
              {formatCurrency(summary.heldAmount)}
            </span>
            <p className="mt-1 text-xs leading-5 text-warning">Reclamos abiertos; no disponible.</p>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-success">Liberación confirmada</dt>
          <dd className="mt-1 wrap-break-word">
            <span className="text-xl font-semibold text-success tabular-nums">
              {formatCurrency(summary.releasedAmount)}
            </span>
            <p className="mt-1 text-xs leading-5 text-success">Confirmada manualmente.</p>
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted-foreground">
        Totales globales, independientes de los filtros. Una fecha prevista no confirma un depósito
        ni mueve caja.
      </p>
      <details className="mt-1">
        <summary className="flex min-h-11 w-fit cursor-pointer items-center rounded-lg px-2 text-sm font-medium text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
          Ver margen directo
        </summary>
        <div className="space-y-1 pb-3 text-sm text-muted-foreground">
          <p>
            Margen con costos conocidos: {formatCurrency(summary.knownMargin)}. No es utilidad neta
            del local.
          </p>
          <p>El margen excluye reclamos abiertos y ventas anuladas.</p>
          <p>
            {summary.incompleteCosts
              ? `${summary.incompleteCosts} venta(s) con costo o neto incompleto, excluidas del margen.`
              : "Costos completos para las ventas incluidas en el margen."}
          </p>
        </div>
      </details>
    </Card>
  );

  function renderTable(list: TvBoardRow[], options: { showBox?: boolean; empty?: string } = {}) {
    return (
      <BoardTable
        boards={list}
        boxNumbers={boxesReady && options.showBox !== false ? boxNumbers : undefined}
        emptyMessage={options.empty}
        canManage={canManage}
        onSaleChanged={recordSaleChange}
        updatedVersions={updatedVersions}
        onStartClaim={(id) => {
          const board = boards.find((item) => item.id === id);
          if (
            !canManage ||
            !board ||
            !board.isSold ||
            board.claimStatus !== "none" ||
            board.releasedAt ||
            board.releaseEvidence === "confirmed"
          )
            return;
          setNotice("");
          setClaimDialog({ board, mode: "start" });
        }}
        onEdit={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedBoard({
            id: board.id,
            brand: board.brand,
            model: board.model,
            boardType: board.boardType,
            price: board.price,
            acquisitionCost: board.acquisitionCost,
            isActive: board.isActive,
            boxId: board.boxId
          });
          setOpen(true);
        }}
        onSell={(id) => {
          const board = boards.find((item) => item.id === id);
          if (!board) return;
          setSelectedSaleBoard({
            id: board.id,
            brand: board.brand,
            model: board.model,
            price: board.price
          });
          setSaleOpen(true);
        }}
      />
    );
  }

  const claimsSection = (
    <BoardClaimsSection
      claims={claims}
      canManage={canManage}
      updatedVersions={updatedVersions}
      onResolve={(board) => {
        setNotice("");
        setClaimDialog({ board, mode: "resolve" });
      }}
    />
  );

  const finder = (
    <Card className="p-3 sm:p-4">
      <BoardFilters
        brands={brands}
        placeholder={inBox ? "Buscar en esta caja por modelo o marca" : undefined}
      />
    </Card>
  );

  return (
    <div className="space-y-4">
      {inBox ? (
        <BoxHeader
          box={selectedBox}
          canManage={canManage}
          caja={filters.caja!}
          onAddBoard={openNewBoard}
          onEdit={(box) => setBoxDialog({ box })}
        />
      ) : (
        <PageHeader
          actions={
            canManage ? (
              <>
                {boxesReady ? (
                  <Button onClick={() => setBoxDialog({ box: null })} variant="secondary">
                    <Plus className="h-4 w-4" />
                    Nueva caja
                  </Button>
                ) : null}
                <Button onClick={openNewBoard}>
                  <PackagePlus className="h-4 w-4" />
                  Nueva placa
                </Button>
              </>
            ) : null
          }
          description={
            boxesReady
              ? boxes.length
                ? `${storedCount === 1 ? "1 placa guardada" : `${storedCount} placas guardadas`} en ${boxes.length === 1 ? "1 caja" : `${boxes.length} cajas`}. ${summary.activeCount} disponibles, ${summary.inactiveCount} dadas de baja.`
                : `Creá una caja por cada caja del local y cargá adentro las placas que guarda. ${summary.activeCount} disponibles, ${summary.inactiveCount} dadas de baja.`
              : `${summary.activeCount} disponibles, ${summary.inactiveCount} dadas de baja. Valor publicado: ${formatCurrency(summary.activeValue)}.`
          }
          title="Placas de televisores"
        />
      )}

      {boxesReady ? finder : null}
      {!boxesReady ? (
        <>
          {financeCard}
          <Card className="p-3 sm:p-4">
            <BoardFilters brands={brands} />
          </Card>
        </>
      ) : null}

      {notice ? (
        <p className="status-banner" role="status">
          {notice}
        </p>
      ) : null}

      {!boxesReady ? claimsSection : null}

      {overview ? (
        <>
          <section aria-labelledby="cajas-title" className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground" id="cajas-title">
              Cajas
            </h2>
            {boxes.length || unboxedCount || canManage ? (
              <BoxGrid
                boxes={boxes}
                canManage={canManage}
                onCreate={() => setBoxDialog({ box: null })}
                unboxedCount={unboxedCount}
              />
            ) : (
              <p className="empty-panel">Todavía no hay cajas cargadas.</p>
            )}
          </section>

          <section aria-labelledby="mercado-libre-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground" id="mercado-libre-title">
                Ventas por Mercado Libre
              </h2>
              <Link
                className={buttonVariants({ variant: "ghost", size: "sm" })}
                href={"/placas-tv?status=sold" as Route}
              >
                Ver todas las vendidas
              </Link>
            </div>
            {financeCard}
            {claimsSection}
            {pendingSales.length ? (
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-foreground">
                  Liberaciones por confirmar
                </h3>
                {renderTable(pendingSales)}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {searching ? (
        <section aria-labelledby="resultados-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground" id="resultados-title">
              {boards.length === 1 ? "1 placa encontrada" : `${boards.length} placas encontradas`}
            </h2>
            <Link
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              href={"/placas-tv" as Route}
            >
              Volver a las cajas
            </Link>
          </div>
          {renderTable(boards)}
        </section>
      ) : null}

      {inBox
        ? renderTable(boards, {
            // Dentro de la caja, repetir "Caja N" en cada placa no suma.
            showBox: false,
            empty:
              filters.search || filters.brand || filters.boardType || filters.status
                ? "No hay placas en esta caja con estos filtros."
                : canManage
                  ? "Esta caja está vacía. Usá Agregar placa para cargar la primera."
                  : "Esta caja está vacía."
          })
        : null}

      {!boxesReady ? renderTable(boards) : null}

      {canManage ? (
        <BoardFormDialog
          board={selectedBoard}
          boxes={boxesReady ? boxes : undefined}
          defaultBoxId={selectedBox?.id ?? null}
          onClose={() => {
            setOpen(false);
            setSelectedBoard(null);
          }}
          open={open}
        />
      ) : null}
      {canManage && claimDialog ? (
        <BoardClaimDialog
          board={claimDialog.board}
          key={`${claimDialog.mode}-${claimDialog.board.id}`}
          mode={claimDialog.mode}
          onClose={() => setClaimDialog(null)}
          onSaved={(message, recordVersion) => {
            recordSaleChange(claimDialog.board.id, recordVersion, message);
            setClaimDialog(null);
          }}
        />
      ) : null}
      {canManage ? (
        <BoardSaleDialog
          board={selectedSaleBoard}
          onClose={() => {
            setSaleOpen(false);
            setSelectedSaleBoard(null);
          }}
          open={saleOpen}
        />
      ) : null}
      {canManage && boxDialog ? (
        <BoxFormDialog
          box={boxDialog.box}
          nextNumber={nextBoxNumber}
          onClose={() => setBoxDialog(null)}
          open
        />
      ) : null}
    </div>
  );
}

function BoxHeader({
  box,
  caja,
  canManage,
  onAddBoard,
  onEdit
}: {
  box: TvBoardBox | null;
  caja: string;
  canManage: boolean;
  onAddBoard: () => void;
  onEdit: (box: TvBoardBox) => void;
}) {
  const router = useRouter();
  const [deleting, startDeleting] = useTransition();
  function deleteBox(box: TvBoardBox) {
    confirmThen(
      {
        title: `¿Eliminar la caja ${box.number}?`,
        description: "La caja está vacía. Las demás cajas conservan su número.",
        confirmLabel: "Eliminar caja",
        tone: "danger"
      },
      () =>
        startDeleting(async () => {
          const result = await deleteTvBoardBoxAction(box.id);
          if (!result.success) {
            toast.error(result.message);
            return;
          }
          toast.success(result.message);
          router.push("/placas-tv" as Route);
        })
    );
  }

  const unboxed = caja === "sin";
  const title = unboxed ? "Placas sin caja" : box ? `Caja ${box.number}` : `Caja ${caja}`;
  const description = unboxed
    ? "Placas guardadas que todavía no tienen caja. Asignales una desde Editar."
    : box
      ? [box.label, box.inStock === 1 ? "1 placa guardada." : `${box.inStock} placas guardadas.`]
          .filter(Boolean)
          .join(". ")
      : "Esta caja no existe o se eliminó.";

  return (
    <div className="space-y-3">
      <Link
        className="-ml-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        href={"/placas-tv" as Route}
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Todas las cajas
      </Link>
      <PageHeader
        actions={
          canManage && box ? (
            <>
              <Button onClick={() => onEdit(box)} variant="secondary">
                <Pencil className="h-4 w-4" />
                Editar caja
              </Button>
              {box.inStock === 0 ? (
                <Button loading={deleting} onClick={() => deleteBox(box)} variant="secondary">
                  <Trash2 className="h-4 w-4" />
                  Eliminar caja
                </Button>
              ) : null}
              <Button onClick={onAddBoard}>
                <PackagePlus className="h-4 w-4" />
                Agregar placa
              </Button>
            </>
          ) : null
        }
        description={description}
        title={title}
      />
    </div>
  );
}
