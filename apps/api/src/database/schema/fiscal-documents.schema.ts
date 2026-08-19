import { pgTable, uuid, text, timestamp, pgEnum, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { sales } from './sales.schema';

export const fiscalDocumentStatusEnum = pgEnum('fiscal_document_status', [
  'pending',
  'authorized',
  'rejected',
  'canceled',
]);

export const fiscalDocuments = pgTable(
  'fiscal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    status: fiscalDocumentStatusEnum('status').notNull().default('pending'),
    accessKey: text('access_key'),
    documentUrl: text('document_url'),
    rejectionReason: text('rejection_reason'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('fiscal_documents_sale_id_unique').on(table.saleId)],
);

export type FiscalDocumentRow = typeof fiscalDocuments.$inferSelect;
export type NewFiscalDocumentRow = typeof fiscalDocuments.$inferInsert;
