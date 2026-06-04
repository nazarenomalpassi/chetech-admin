delete from public.movimientos_caja
where referencia_tabla = 'invoices';

delete from public.invoice_payments;

update public.invoices
set
  paid_total = total,
  balance = 0,
  status = 'pagado',
  updated_at = now()
where status <> 'anulado';
