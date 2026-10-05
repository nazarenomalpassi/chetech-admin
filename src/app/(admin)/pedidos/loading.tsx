import { Card } from "@/components/ui/card";

export default function PedidosLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando pedidos">
      <Card className="h-48 animate-pulse bg-white/70" />
      <Card className="h-96 animate-pulse bg-white/70" />
    </div>
  );
}
