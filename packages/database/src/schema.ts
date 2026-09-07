import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 } from 'uuid';
export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().$defaultFn(v7),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

