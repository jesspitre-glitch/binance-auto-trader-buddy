-- Add indicators_snapshot column to positions table to store indicator values at time of trade
ALTER TABLE positions 
ADD COLUMN indicators_snapshot jsonb;