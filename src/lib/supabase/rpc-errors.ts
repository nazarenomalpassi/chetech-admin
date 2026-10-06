type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const SAFE_MESSAGE_PREFIXES = [
  "Agrega ",
  "La sesion ",
  "La sesión ",
  "La orden ",
  "La suma ",
  "No se encontro ",
  "No se encontró ",
  "No se encontraron ",
  "Revisa ",
  "Solo un administrador ",
  "Stock insuficiente "
];

export function isMissingDatabaseFunctionError(error: DatabaseErrorLike | null | undefined, functionName: string) {
  if (!error) return false;
  if (error.code === "PGRST202") return true;

  const message = String(error.message ?? "").toLowerCase();
  const normalizedName = functionName.toLowerCase();

  return (
    error.code === "42883" ||
    (message.includes(normalizedName) &&
      (message.includes("does not exist") || message.includes("not found") || message.includes("could not find")))
  );
}

export function getFriendlyDatabaseError(error: DatabaseErrorLike | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "Ya existe un registro con esos datos.";
  if (error.code === "23503") return "El registro esta relacionado con otros datos y no se puede modificar de esa manera.";

  const message = String(error.message ?? "").trim();
  if (SAFE_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;

  return fallback;
}
