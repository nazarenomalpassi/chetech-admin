import { BrandedLoading } from "@/components/ui/branded-loading";

export function ModulePageLoading({ section }: { section?: string }) {
  return <BrandedLoading message={section ? `Cargando ${section}` : "Cargando sección"} />;
}
