-- Add MACD color change hard filter toggle
ALTER TABLE public.indicator_config 
ADD COLUMN macd_color_change_hard_filter boolean DEFAULT false;