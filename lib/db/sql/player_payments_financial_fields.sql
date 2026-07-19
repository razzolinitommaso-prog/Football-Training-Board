ALTER TABLE player_payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'annual_fee_installment',
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS total_installments integer,
  ADD COLUMN IF NOT EXISTS annual_fee_total real,
  ADD COLUMN IF NOT EXISTS availability_blocking integer NOT NULL DEFAULT 1;
