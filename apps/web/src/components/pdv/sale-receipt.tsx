import type { Sale, PaymentMethod } from '@pcaarb/shared';
import { formatCentsToBRL } from '@/lib/currency';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
};

interface SaleReceiptProps {
  sale: Sale;
  companyName: string;
  storeName?: string;
}

// Elemento só existe pra ser impresso (ver .print-target em globals.css) —
// nunca aparece na tela normal do PDV. Layout estreito (largura de
// impressora térmica de recibo), fonte monoespaçada, sem nenhum componente
// do design system (Card/Badge) de propósito: é um documento pra entregar
// ao cliente, não uma tela do painel.
export function SaleReceipt({ sale, companyName, storeName }: SaleReceiptProps) {
  const createdAt = new Date(sale.createdAt);

  return (
    <div className="print-target w-[300px] p-2 font-mono text-xs text-black">
      <div className="text-center">
        <p className="font-bold">{companyName}</p>
        {storeName && <p>{storeName}</p>}
        <p>Comprovante de venda</p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>{createdAt.toLocaleDateString('pt-BR')}</span>
        <span>{createdAt.toLocaleTimeString('pt-BR')}</span>
      </div>
      <p>Venda: {sale.id.slice(0, 8)}</p>

      <div className="my-2 border-t border-dashed border-black" />

      {sale.items.map((item) => (
        <div key={item.id} className="mb-1">
          <p>{item.productName}</p>
          <div className="flex justify-between">
            <span>
              {item.quantity} x {formatCentsToBRL(item.unitPriceCents)}
            </span>
            <span>{formatCentsToBRL(item.totalCents)}</span>
          </div>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-black" />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatCentsToBRL(sale.subtotalCents)}</span>
      </div>
      {sale.discountCents > 0 && (
        <div className="flex justify-between">
          <span>Desconto</span>
          <span>-{formatCentsToBRL(sale.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>{formatCentsToBRL(sale.totalCents)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      {sale.payments.map((payment) => (
        <div key={payment.id} className="flex justify-between">
          <span>{PAYMENT_LABELS[payment.method]}</span>
          <span>{formatCentsToBRL(payment.amountCents)}</span>
        </div>
      ))}

      {sale.fiscalDocument?.status === 'authorized' && sale.fiscalDocument.accessKey && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="break-all">NFC-e: {sale.fiscalDocument.accessKey}</p>
        </>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">Obrigado pela preferência!</p>
    </div>
  );
}
