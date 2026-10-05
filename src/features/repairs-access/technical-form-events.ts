const changeOnlyInputTypes = new Set(["checkbox", "radio"]);

export function shouldCaptureRepairDraftOnInput(tagName: string, inputType = "") {
  const normalizedTagName = tagName.toUpperCase();

  if (normalizedTagName === "SELECT") return false;

  return !(
    normalizedTagName === "INPUT" &&
    changeOnlyInputTypes.has(inputType.toLowerCase())
  );
}
