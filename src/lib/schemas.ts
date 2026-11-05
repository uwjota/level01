import { z } from 'zod';
const date = z.iso.date(),
  time = z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .nullable()
    .optional(),
  uuid = z.uuid();
const text = z.string().trim().min(1).max(300),
  optional = z.string().max(20000).default('');
const amount = z.number().int().min(1).max(9_000_000_000_000);
export const ruleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  end_date: date.nullable().optional(),
});
const envelope = z.object({
  ciphertext: z.string().min(20).max(200000),
  initialization_vector: z.string().length(16),
  encryption_version: z.literal(1),
});
export const schemas = {
  tasks: z.object({
    title: text,
    description: optional,
    scheduled_on: date,
    scheduled_time: time,
    priority: z.enum(['low', 'medium', 'high']),
    status: z.enum(['pending', 'completed', 'cancelled']),
    recurrence: ruleSchema.nullable(),
    reminder_minutes: z.number().int().min(0).max(10080).default(30),
  }),
  task_occurrences: z.object({
    task_id: uuid,
    occurrence_date: date,
    status: z.enum(['pending', 'completed', 'cancelled']),
    override_data: z
      .object({
        title: text.optional(),
        scheduled_on: date.optional(),
        scheduled_time: time,
        description: optional.optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      })
      .default({}),
    completed_at: z.iso.datetime().nullable().optional(),
  }),
  financial_accounts: z.object({
    name: text,
    type: z.enum(['checking', 'digital', 'cash', 'savings', 'other']),
    opening_balance_minor: z.number().int().min(-9_000_000_000_000).max(9_000_000_000_000),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#2563eb'),
    archived_at: z.iso.datetime().nullable().default(null),
  }),
  financial_categories: z.object({
    name: text,
    type: z.enum(['income', 'expense']),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#2563eb'),
    icon: z.string().max(40).default('tag'),
  }),
  transactions: z
    .object({
      type: z.enum(['income', 'expense', 'transfer']),
      description: text,
      amount_minor: amount,
      account_id: uuid,
      destination_account_id: uuid.nullable().default(null),
      category_id: uuid.nullable().default(null),
      occurred_on: date,
      status: z.enum(['planned', 'confirmed']),
      notes: optional,
      recurrence_rule_id: uuid.nullable().default(null),
    })
    .refine(
      (x) =>
        x.type === 'transfer'
          ? Boolean(
              x.destination_account_id &&
              x.destination_account_id !== x.account_id &&
              !x.category_id,
            )
          : !x.destination_account_id,
      { message: 'Confira conta de destino e categoria.' },
    ),
  financial_recurrence_rules: z.object({
    description: text,
    type: z.enum(['income', 'expense']),
    amount_minor: amount,
    account_id: uuid,
    category_id: uuid.nullable().default(null),
    start_date: date,
    recurrence: ruleSchema,
    active: z.boolean().default(true),
  }),
  goals: z.object({
    title: text,
    description: optional,
    category: z.string().max(100).default('Pessoal'),
    target_value: z.number().positive().max(1e12),
    current_value: z.number().nonnegative().max(1e12),
    target_date: date.nullable().default(null),
    start_date: date,
    status: z.enum(['active', 'completed', 'paused']),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#2563eb'),
  }),
  notes: z.object({
    title: text,
    content: optional,
    category: z.string().max(100).default('Pessoal'),
    tags: z.array(z.string().max(60)).max(30).default([]),
    favorite: z.boolean().default(false),
  }),
  study_collections: z.object({
    kind: z.enum(['book', 'subject']),
    title: text,
    author: z.string().max(300).default(''),
    description: optional,
    status: z.enum(['planned', 'in_progress', 'completed']).default('in_progress'),
  }),
  study_notes: z.object({
    collection_id: uuid,
    title: text,
    content: optional,
    source_url: z.union([z.literal(''), z.url({ protocol: /^https?$/ }).max(2000)]).default(''),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  }),
  vault_configs: z.object({
    encrypted_data_key: envelope,
    kdf_parameters: z.object({
      algorithm: z.literal('PBKDF2-SHA256'),
      iterations: z.number().int().min(600000).max(2000000),
      salt: z.string().length(24),
    }),
    encryption_version: z.literal(1),
  }),
  vault_items: envelope.extend({ item_type: z.literal('credential') }),
  settings: z.object({
    weather_location: z
      .object({
        label: z.string().min(1).max(200),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        source: z.enum(['device', 'manual']),
      })
      .nullable()
      .optional(),
    display_name: z.string().max(100),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    theme: z.enum(['light', 'dark', 'system']),
    week_starts_on: z.number().int().min(0).max(1),
    vault_timeout_minutes: z.number().int().min(1).max(30),
    notification_preferences: z.object({
      tasks: z.boolean(),
      finance: z.boolean(),
      goals: z.boolean(),
      advance_minutes: z.number().int().min(0).max(10080),
    }),
  }),
  notifications: z.object({
    type: z.enum(['task', 'finance', 'goal']),
    message: text,
    scheduled_at: z.iso.datetime(),
    read_at: z.iso.datetime().nullable(),
    idempotency_key: z.string().max(300),
  }),
} as const;
export type Entity = keyof typeof schemas;
export const entities = Object.keys(schemas) as Entity[];
export const backupTables = [
  'settings',
  'tasks',
  'task_occurrences',
  'financial_accounts',
  'financial_categories',
  'financial_recurrence_rules',
  'transactions',
  'goals',
  'notes',
  'study_collections',
  'study_notes',
  'vault_configs',
  'vault_items',
  'notifications',
] as const;
export const backupSchema = z.object({
  version: z.literal(1),
  exported_at: z.iso.datetime(),
  user_id: uuid,
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  attachments: z.array(z.record(z.string(), z.unknown())).default([]),
});
