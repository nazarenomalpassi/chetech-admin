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

const WORKSHOP_VALIDATION_MESSAGES: Record<string, string> = {
  "Registra una autorizacion vigente del cliente antes de marcar listo para retirar.":
    'Falta la confirmacion del cliente. Mostrador debe registrarla con "Cliente confirmo" para este presupuesto antes de marcar listo para retirar.',
  "Primero registra la autorizacion del cliente.":
    'Falta la confirmacion del cliente. Mostrador debe registrarla con "Cliente confirmo" antes de avanzar con la reparacion.',
  "Completa el control de calidad antes de marcar listo para retirar.":
    "Falta el control de calidad. Marca la casilla de verificacion despues de probar el equipo y guarda nuevamente.",
  "Completa o cancela los repuestos pendientes antes de marcar listo para retirar.":
    "Hay repuestos pendientes de recibir. Mostrador debe completar su recepcion o cancelar las solicitudes que no correspondan antes de marcar listo para retirar."
};

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
  if (error.code === "23514" && Object.hasOwn(WORKSHOP_VALIDATION_MESSAGES, message)) return WORKSHOP_VALIDATION_MESSAGES[message];
  if (SAFE_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;

  return fallback;
}
