import type { PurchaseOrder, Supplier } from '@pcaarb/shared';
import { formatCentsToBRL } from '@/lib/currency';

interface PurchaseOrderPrintProps {
  order: PurchaseOrder;
  companyName: string;
  supplier: Supplier | undefined;
}

// Elemento só existe pra ser impresso/exportado como PDF (ver .print-target
// em globals.css) — nunca aparece na tela normal de Compras. Layout de
// documento comercial (largura cheia, não o recibo estreito do PDV): é o
// que o dono da loja manda pro fornecedor, precisa parecer um pedido de
// compra de verdade.
export function PurchaseOrderPrint({ order, companyName, supplier }: PurchaseOrderPrintProps) {
  const createdAt = new Date(order.createdAt);

  return (
    <div className="print-target w-[700px] p-8 text-sm text-black">
      <div className="flex items-start justify-between border-b border-black pb-4">
        <div>
          <p className="text-lg font-bold">{companyName}</p>
          <p className="text-muted">Pedido de compra</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">Nº {order.id.slice(0, 8)}</p>
          <p>{createdAt.toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="font-semibold">Fornecedor</p>
        <p>{supplier?.name ?? '—'}</p>
        {supplier?.document && <p>CPF/CNPJ: {supplier.document}</p>}
        {supplier?.email && <p>{supplier.email}</p>}
        {supplier?.phone && <p>{supplier.phone}</p>}
      </div>

      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5">Produto</th>
            <th className="py-1.5 text-right">Qtd.</th>
            <th className="py-1.5 text-right">Custo unit.</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-300">
              <td className="py-1.5">{item.productName}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">{formatCentsToBRL(item.unitCostCents)}</td>
              <td className="py-1.5 text-right">{formatCentsToBRL(item.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex justify-end">
        <p className="font-bold">Total: {formatCentsToBRL(order.totalCents)}</p>
      </div>

      {order.notes && (
        <div className="mt-4 border-t border-black pt-2">
          <p className="font-semibold">Observações</p>
          <p>{order.notes}</p>
        </div>
      )}
    </div>
  );
}
