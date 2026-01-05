export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      funding_fees: {
        Row: {
          asset: string
          binance_time: number
          created_at: string
          id: string
          income: number
          income_type: string
          symbol: string
          transaction_id: number | null
          user_id: string
        }
        Insert: {
          asset?: string
          binance_time: number
          created_at?: string
          id?: string
          income: number
          income_type?: string
          symbol: string
          transaction_id?: number | null
          user_id: string
        }
        Update: {
          asset?: string
          binance_time?: number
          created_at?: string
          id?: string
          income?: number
          income_type?: string
          symbol?: string
          transaction_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      indicator_config: {
        Row: {
          adaptive_adx_enabled: boolean | null
          adaptive_atr_enabled: boolean | null
          adx_base_min: number | null
          adx_ceiling: number | null
          adx_enabled: boolean | null
          adx_floor: number | null
          adx_hard_filter: boolean | null
          adx_period: number | null
          adx_threshold: number | null
          atr_base_min: number | null
          atr_ceiling: number | null
          atr_enabled: boolean | null
          atr_floor: number | null
          atr_hard_filter: boolean | null
          atr_period: number | null
          atr_stop_loss_multiplier: number | null
          atr_take_profit_multiplier: number | null
          atr_trailing_stop_multiplier: number | null
          auto_exit_enabled: boolean | null
          bb_enabled: boolean | null
          bb_hard_filter: boolean | null
          bb_period: number | null
          bb_std_dev: number | null
          break_even_atr: number | null
          break_even_atr_enabled: boolean | null
          break_even_atr_stop_offset: number | null
          break_even_enabled: boolean | null
          break_even_profit_pct_enabled: boolean | null
          break_even_profit_pct_stop_over_entry: number | null
          break_even_profit_pct_trigger: number | null
          break_even_ratchet_only: boolean | null
          candle_momentum_enabled: boolean | null
          conditional_time_exit_enabled: boolean | null
          created_at: string | null
          daily_loss_limit_percent: number | null
          ema_enabled: boolean | null
          ema_fast: number | null
          ema_hard_filter: boolean | null
          ema_medium: number | null
          ema_medium_trend: number | null
          ema_slow: number | null
          ema_trend_hard_filter: boolean | null
          enabled: boolean | null
          higher_trend_enabled: boolean | null
          higher_trend_hard_filter: boolean | null
          higher_trend_timeframe: string | null
          histogram_momentum_enabled: boolean | null
          histogram_momentum_periods: number | null
          id: string
          klines_limit: number | null
          leverage: number | null
          macd_color_change_hard_filter: boolean | null
          macd_direction_enabled: boolean | null
          macd_enabled: boolean | null
          macd_fast: number | null
          macd_hard_filter: boolean | null
          macd_histogram_threshold: number | null
          macd_signal: number | null
          macd_slow: number | null
          max_ema_spread_percent: number | null
          max_exposure_percent: number | null
          max_open_positions: number | null
          max_position_duration_minutes: number | null
          max_sl_after_mfe_activate_pct: number | null
          max_sl_after_mfe_enabled: boolean | null
          max_sl_after_mfe_max_dist_pct: number | null
          max_sl_after_mfe_pct: number | null
          min_atr: number | null
          min_atr_percent: number | null
          min_candle_body_percent: number | null
          min_ema_spread_percent: number | null
          name: string
          peak_lock_activate_profit_pct: number | null
          peak_lock_distance_pct: number | null
          peak_lock_enabled: boolean | null
          peak_lock_min_profit_floor_pct: number | null
          peak_lock_ratchet_only: boolean | null
          pivot_points_enabled: boolean | null
          pivot_points_hard_filter: boolean | null
          pivot_points_lookback: number | null
          pivot_points_near_threshold: number | null
          pivot_points_timeframe: string | null
          position_size_percent: number | null
          risk_per_trade_percent: number | null
          rsi_enabled: boolean | null
          rsi_hard_filter: boolean | null
          rsi_max_short: number | null
          rsi_min_long: number | null
          rsi_momentum_periods: number | null
          rsi_overbought: number | null
          rsi_oversold: number | null
          rsi_period: number | null
          rsi_zone_width: number | null
          scan_interval: string | null
          signal_conditions_required: number | null
          stochrsi_d_period: number | null
          stochrsi_enabled: boolean | null
          stochrsi_hard_filter: boolean | null
          stochrsi_k_period: number | null
          stochrsi_overbought: number | null
          stochrsi_oversold: number | null
          stochrsi_period: number | null
          trailing_stop_activation_atr: number | null
          trailing_stop_activation_enabled: boolean | null
          trend_timeframe: string | null
          updated_at: string | null
          user_id: string
          volume_avg_period: number | null
          volume_enabled: boolean | null
          volume_hard_filter: boolean | null
          volume_multiplier: number | null
          vwap_enabled: boolean | null
          vwap_hard_filter: boolean | null
          vwap_period: number | null
        }
        Insert: {
          adaptive_adx_enabled?: boolean | null
          adaptive_atr_enabled?: boolean | null
          adx_base_min?: number | null
          adx_ceiling?: number | null
          adx_enabled?: boolean | null
          adx_floor?: number | null
          adx_hard_filter?: boolean | null
          adx_period?: number | null
          adx_threshold?: number | null
          atr_base_min?: number | null
          atr_ceiling?: number | null
          atr_enabled?: boolean | null
          atr_floor?: number | null
          atr_hard_filter?: boolean | null
          atr_period?: number | null
          atr_stop_loss_multiplier?: number | null
          atr_take_profit_multiplier?: number | null
          atr_trailing_stop_multiplier?: number | null
          auto_exit_enabled?: boolean | null
          bb_enabled?: boolean | null
          bb_hard_filter?: boolean | null
          bb_period?: number | null
          bb_std_dev?: number | null
          break_even_atr?: number | null
          break_even_atr_enabled?: boolean | null
          break_even_atr_stop_offset?: number | null
          break_even_enabled?: boolean | null
          break_even_profit_pct_enabled?: boolean | null
          break_even_profit_pct_stop_over_entry?: number | null
          break_even_profit_pct_trigger?: number | null
          break_even_ratchet_only?: boolean | null
          candle_momentum_enabled?: boolean | null
          conditional_time_exit_enabled?: boolean | null
          created_at?: string | null
          daily_loss_limit_percent?: number | null
          ema_enabled?: boolean | null
          ema_fast?: number | null
          ema_hard_filter?: boolean | null
          ema_medium?: number | null
          ema_medium_trend?: number | null
          ema_slow?: number | null
          ema_trend_hard_filter?: boolean | null
          enabled?: boolean | null
          higher_trend_enabled?: boolean | null
          higher_trend_hard_filter?: boolean | null
          higher_trend_timeframe?: string | null
          histogram_momentum_enabled?: boolean | null
          histogram_momentum_periods?: number | null
          id?: string
          klines_limit?: number | null
          leverage?: number | null
          macd_color_change_hard_filter?: boolean | null
          macd_direction_enabled?: boolean | null
          macd_enabled?: boolean | null
          macd_fast?: number | null
          macd_hard_filter?: boolean | null
          macd_histogram_threshold?: number | null
          macd_signal?: number | null
          macd_slow?: number | null
          max_ema_spread_percent?: number | null
          max_exposure_percent?: number | null
          max_open_positions?: number | null
          max_position_duration_minutes?: number | null
          max_sl_after_mfe_activate_pct?: number | null
          max_sl_after_mfe_enabled?: boolean | null
          max_sl_after_mfe_max_dist_pct?: number | null
          max_sl_after_mfe_pct?: number | null
          min_atr?: number | null
          min_atr_percent?: number | null
          min_candle_body_percent?: number | null
          min_ema_spread_percent?: number | null
          name: string
          peak_lock_activate_profit_pct?: number | null
          peak_lock_distance_pct?: number | null
          peak_lock_enabled?: boolean | null
          peak_lock_min_profit_floor_pct?: number | null
          peak_lock_ratchet_only?: boolean | null
          pivot_points_enabled?: boolean | null
          pivot_points_hard_filter?: boolean | null
          pivot_points_lookback?: number | null
          pivot_points_near_threshold?: number | null
          pivot_points_timeframe?: string | null
          position_size_percent?: number | null
          risk_per_trade_percent?: number | null
          rsi_enabled?: boolean | null
          rsi_hard_filter?: boolean | null
          rsi_max_short?: number | null
          rsi_min_long?: number | null
          rsi_momentum_periods?: number | null
          rsi_overbought?: number | null
          rsi_oversold?: number | null
          rsi_period?: number | null
          rsi_zone_width?: number | null
          scan_interval?: string | null
          signal_conditions_required?: number | null
          stochrsi_d_period?: number | null
          stochrsi_enabled?: boolean | null
          stochrsi_hard_filter?: boolean | null
          stochrsi_k_period?: number | null
          stochrsi_overbought?: number | null
          stochrsi_oversold?: number | null
          stochrsi_period?: number | null
          trailing_stop_activation_atr?: number | null
          trailing_stop_activation_enabled?: boolean | null
          trend_timeframe?: string | null
          updated_at?: string | null
          user_id: string
          volume_avg_period?: number | null
          volume_enabled?: boolean | null
          volume_hard_filter?: boolean | null
          volume_multiplier?: number | null
          vwap_enabled?: boolean | null
          vwap_hard_filter?: boolean | null
          vwap_period?: number | null
        }
        Update: {
          adaptive_adx_enabled?: boolean | null
          adaptive_atr_enabled?: boolean | null
          adx_base_min?: number | null
          adx_ceiling?: number | null
          adx_enabled?: boolean | null
          adx_floor?: number | null
          adx_hard_filter?: boolean | null
          adx_period?: number | null
          adx_threshold?: number | null
          atr_base_min?: number | null
          atr_ceiling?: number | null
          atr_enabled?: boolean | null
          atr_floor?: number | null
          atr_hard_filter?: boolean | null
          atr_period?: number | null
          atr_stop_loss_multiplier?: number | null
          atr_take_profit_multiplier?: number | null
          atr_trailing_stop_multiplier?: number | null
          auto_exit_enabled?: boolean | null
          bb_enabled?: boolean | null
          bb_hard_filter?: boolean | null
          bb_period?: number | null
          bb_std_dev?: number | null
          break_even_atr?: number | null
          break_even_atr_enabled?: boolean | null
          break_even_atr_stop_offset?: number | null
          break_even_enabled?: boolean | null
          break_even_profit_pct_enabled?: boolean | null
          break_even_profit_pct_stop_over_entry?: number | null
          break_even_profit_pct_trigger?: number | null
          break_even_ratchet_only?: boolean | null
          candle_momentum_enabled?: boolean | null
          conditional_time_exit_enabled?: boolean | null
          created_at?: string | null
          daily_loss_limit_percent?: number | null
          ema_enabled?: boolean | null
          ema_fast?: number | null
          ema_hard_filter?: boolean | null
          ema_medium?: number | null
          ema_medium_trend?: number | null
          ema_slow?: number | null
          ema_trend_hard_filter?: boolean | null
          enabled?: boolean | null
          higher_trend_enabled?: boolean | null
          higher_trend_hard_filter?: boolean | null
          higher_trend_timeframe?: string | null
          histogram_momentum_enabled?: boolean | null
          histogram_momentum_periods?: number | null
          id?: string
          klines_limit?: number | null
          leverage?: number | null
          macd_color_change_hard_filter?: boolean | null
          macd_direction_enabled?: boolean | null
          macd_enabled?: boolean | null
          macd_fast?: number | null
          macd_hard_filter?: boolean | null
          macd_histogram_threshold?: number | null
          macd_signal?: number | null
          macd_slow?: number | null
          max_ema_spread_percent?: number | null
          max_exposure_percent?: number | null
          max_open_positions?: number | null
          max_position_duration_minutes?: number | null
          max_sl_after_mfe_activate_pct?: number | null
          max_sl_after_mfe_enabled?: boolean | null
          max_sl_after_mfe_max_dist_pct?: number | null
          max_sl_after_mfe_pct?: number | null
          min_atr?: number | null
          min_atr_percent?: number | null
          min_candle_body_percent?: number | null
          min_ema_spread_percent?: number | null
          name?: string
          peak_lock_activate_profit_pct?: number | null
          peak_lock_distance_pct?: number | null
          peak_lock_enabled?: boolean | null
          peak_lock_min_profit_floor_pct?: number | null
          peak_lock_ratchet_only?: boolean | null
          pivot_points_enabled?: boolean | null
          pivot_points_hard_filter?: boolean | null
          pivot_points_lookback?: number | null
          pivot_points_near_threshold?: number | null
          pivot_points_timeframe?: string | null
          position_size_percent?: number | null
          risk_per_trade_percent?: number | null
          rsi_enabled?: boolean | null
          rsi_hard_filter?: boolean | null
          rsi_max_short?: number | null
          rsi_min_long?: number | null
          rsi_momentum_periods?: number | null
          rsi_overbought?: number | null
          rsi_oversold?: number | null
          rsi_period?: number | null
          rsi_zone_width?: number | null
          scan_interval?: string | null
          signal_conditions_required?: number | null
          stochrsi_d_period?: number | null
          stochrsi_enabled?: boolean | null
          stochrsi_hard_filter?: boolean | null
          stochrsi_k_period?: number | null
          stochrsi_overbought?: number | null
          stochrsi_oversold?: number | null
          stochrsi_period?: number | null
          trailing_stop_activation_atr?: number | null
          trailing_stop_activation_enabled?: boolean | null
          trend_timeframe?: string | null
          updated_at?: string | null
          user_id?: string
          volume_avg_period?: number | null
          volume_enabled?: boolean | null
          volume_hard_filter?: boolean | null
          volume_multiplier?: number | null
          vwap_enabled?: boolean | null
          vwap_hard_filter?: boolean | null
          vwap_period?: number | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          binance_order_id: string | null
          break_even_activated: boolean | null
          close_reason: string | null
          closed_at: string | null
          created_at: string | null
          current_price: number | null
          entry_price: number
          id: string
          indicators_snapshot: Json | null
          open_reason: string | null
          opened_at: string | null
          peak_price: number | null
          quantity: number
          side: string
          status: string | null
          stop_loss: number | null
          strategy_hash: string | null
          symbol: string
          take_profit: number | null
          trailing_stop: number | null
          trailing_stop_percent: number | null
          unrealized_pnl: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          binance_order_id?: string | null
          break_even_activated?: boolean | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          entry_price: number
          id?: string
          indicators_snapshot?: Json | null
          open_reason?: string | null
          opened_at?: string | null
          peak_price?: number | null
          quantity: number
          side: string
          status?: string | null
          stop_loss?: number | null
          strategy_hash?: string | null
          symbol: string
          take_profit?: number | null
          trailing_stop?: number | null
          trailing_stop_percent?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          binance_order_id?: string | null
          break_even_activated?: boolean | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          entry_price?: number
          id?: string
          indicators_snapshot?: Json | null
          open_reason?: string | null
          opened_at?: string | null
          peak_price?: number | null
          quantity?: number
          side?: string
          status?: string | null
          stop_loss?: number | null
          strategy_hash?: string | null
          symbol?: string
          take_profit?: number | null
          trailing_stop?: number | null
          trailing_stop_percent?: number | null
          unrealized_pnl?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          change_24h: number | null
          price: number
          symbol: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          change_24h?: number | null
          price: number
          symbol: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          change_24h?: number | null
          price?: number
          symbol?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          action_taken: string | null
          created_at: string
          id: string
          indicators: Json | null
          signal: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          id?: string
          indicators?: Json | null
          signal: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          id?: string
          indicators?: Json | null
          signal?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          user_id?: string
        }
        Relationships: []
      }
      trade_history: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          created_at: string | null
          duration_minutes: number | null
          entry_price: number
          exit_price: number
          id: string
          indicators_snapshot: Json | null
          open_reason: string | null
          opened_at: string
          pnl: number
          pnl_percent: number
          quantity: number
          side: string
          strategy_hash: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          entry_price: number
          exit_price: number
          id?: string
          indicators_snapshot?: Json | null
          open_reason?: string | null
          opened_at: string
          pnl: number
          pnl_percent: number
          quantity: number
          side: string
          strategy_hash?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          entry_price?: number
          exit_price?: number
          id?: string
          indicators_snapshot?: Json | null
          open_reason?: string | null
          opened_at?: string
          pnl?: number
          pnl_percent?: number
          quantity?: number
          side?: string
          strategy_hash?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      trading_session: {
        Row: {
          active_config_id: string | null
          id: string
          is_active: boolean | null
          started_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_config_id?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_config_id?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trading_session_active_config_id_fkey"
            columns: ["active_config_id"]
            isOneToOne: false
            referencedRelation: "indicator_config"
            referencedColumns: ["id"]
          },
        ]
      }
      user_portfolio: {
        Row: {
          created_at: string | null
          futures_capital: number | null
          futures_deposited: number | null
          futures_withdrawn: number | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          futures_capital?: number | null
          futures_deposited?: number | null
          futures_withdrawn?: number | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          futures_capital?: number | null
          futures_deposited?: number | null
          futures_withdrawn?: number | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
