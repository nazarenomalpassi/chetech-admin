function readRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildDescription(item: any) {
  const product = readRelated(item.products);
  const name = String(product?.name ?? "").trim() || "Producto vendido";
  const sku = String(product?.sku ?? "").trim();
  return sku ? `${name} (${sku})` : name;
}

export function mapInvoiceSaleItems(items: any[]) {
  return items.map((item) => ({
    id: item.id,
    description: buildDescription(item),
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    total: Number(item.total),
    productId: item.product_id
  }));
}
