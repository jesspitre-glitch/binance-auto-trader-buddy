CREATE POLICY "Users can delete their own trade history"
ON public.trade_history
FOR DELETE
USING (auth.uid() = user_id);