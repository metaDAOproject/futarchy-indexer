import { pgTable, text } from 'drizzle-orm/pg-core';

export const proposals = pgTable('proposals', {
    id: text('id').primaryKey(),
});
