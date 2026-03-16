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
      daily_balance_snapshots: {
        Row: {
          created_at: string
          futures_balance: number
          id: string
          snapshot_date: string
          unrealized_pnl: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          futures_balance?: number
          id?: string
          snapshot_date: string
          unrealized_pnl?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          futures_balance?: number
          id?: string
          snapshot_date?: string
          unrealized_pnl?: number | null
          user_id?: string
        }
        Relationships: []
      }
      exit_profiles: {
        Row: {
          be_enabled: boolean | null
          be_ratchet_only: boolean | null
          be_stop_over_entry_pct: number | null
          be_trigger_profit_pct: number | null
          created_at: string | null
          hard_sl_override_enabled: boolean | null
          hard_sl_pct: number | null
          id: string
          max_duration_enabled: boolean | null
          max_duration_minutes: number | null
          name: string
          peaklock_activate_profit_pct: number | null
          peaklock_distance_from_peak_pct: number | null
          peaklock_enabled: boolean | null
          peaklock_min_profit_floor_pct: number | null
          peaklock_ratchet_only: boolean | null
          trailing_activation_atr_mult: number | null
          trailing_activation_enabled: boolean | null
          trailing_enabled: boolean | null
          trailing_stop_atr_mult: number | null
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          be_enabled?: boolean | null
          be_ratchet_only?: boolean | null
          be_stop_over_entry_pct?: number | null
          be_trigger_profit_pct?: number | null
          created_at?: string | null
          hard_sl_override_enabled?: boolean | null
          hard_sl_pct?: number | null
          id?: string
          max_duration_enabled?: boolean | null
          max_duration_minutes?: number | null
          name: string
          peaklock_activate_profit_pct?: number | null
          peaklock_distance_from_peak_pct?: number | null
          peaklock_enabled?: boolean | null
          peaklock_min_profit_floor_pct?: number | null
          peaklock_ratchet_only?: boolean | null
          trailing_activation_atr_mult?: number | null
          trailing_activation_enabled?: boolean | null
          trailing_enabled?: boolean | null
          trailing_stop_atr_mult?: number | null
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          be_enabled?: boolean | null
          be_ratchet_only?: boolean | null
          be_stop_over_entry_pct?: number | null
          be_trigger_profit_pct?: number | null
          created_at?: string | null
          hard_sl_override_enabled?: boolean | null
          hard_sl_pct?: number | null
          id?: string
          max_duration_enabled?: boolean | null
          max_duration_minutes?: number | null
          name?: string
          peaklock_activate_profit_pct?: number | null
          peaklock_distance_from_peak_pct?: number | null
          peaklock_enabled?: boolean | null
          peaklock_min_profit_floor_pct?: number | null
          peaklock_ratchet_only?: boolean | null
          trailing_activation_atr_mult?: number | null
          trailing_activation_enabled?: boolean | null
          trailing_enabled?: boolean | null
          trailing_stop_atr_mult?: number | null
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: []
      }
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
          candle_close_entry_window_seconds: number | null
          candle_momentum_enabled: boolean | null
          cci_enabled: boolean | null
          cci_hard_filter: boolean | null
          cci_overbought: number | null
          cci_oversold: number | null
          cci_period: number | null
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
          hard_sl_pct: number | null
          hard_sl_pct_enabled: boolean | null
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
          obv_enabled: boolean | null
          obv_hard_filter: boolean | null
          obv_lookback: number | null
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
          psar_af_increment: number | null
          psar_af_max: number | null
          psar_af_start: number | null
          psar_enabled: boolean | null
          psar_hard_filter: boolean | null
          psar_trailing_enabled: boolean | null
          regime_adx_threshold: number | null
          regime_atr_pct_threshold: number | null
          regime_if_false: string | null
          regime_if_true: string | null
          regime_lock_at_entry: boolean | null
          regime_method: string | null
          regime_operator: string | null
          regime_range_exit_profile_id: string | null
          regime_router_enabled: boolean | null
          regime_trend_exit_profile_id: string | null
          risk_per_trade_percent: number | null
          rollover_d_min_long: number | null
          rollover_d_min_short: number | null
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
          signal_timing_mode: string
          stochrsi_d_period: number | null
          stochrsi_enabled: boolean | null
          stochrsi_hard_filter: boolean | null
          stochrsi_k_period: number | null
          stochrsi_long_mode: string
          stochrsi_overbought: number | null
          stochrsi_overbought_d: number | null
          stochrsi_overbought_k: number | null
          stochrsi_oversold: number | null
          stochrsi_oversold_d: number | null
          stochrsi_oversold_k: number | null
          stochrsi_period: number | null
          stochrsi_short_mode: string
          strategy_params_changed_at: string | null
          supertrend_enabled: boolean | null
          supertrend_hard_filter: boolean | null
          supertrend_multiplier: number | null
          supertrend_period: number | null
          trailing_stop_activation_atr: number | null
          trailing_stop_activation_enabled: boolean | null
          trend_timeframe: string | null
          trend_timeframe_enabled: boolean | null
          updated_at: string | null
          user_id: string
          volume_avg_period: number | null
          volume_enabled: boolean | null
          volume_hard_filter: boolean | null
          volume_mode_short: string
          volume_multiplier: number | null
          volume_multiplier_short: number
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
          candle_close_entry_window_seconds?: number | null
          candle_momentum_enabled?: boolean | null
          cci_enabled?: boolean | null
          cci_hard_filter?: boolean | null
          cci_overbought?: number | null
          cci_oversold?: number | null
          cci_period?: number | null
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
          hard_sl_pct?: number | null
          hard_sl_pct_enabled?: boolean | null
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
          obv_enabled?: boolean | null
          obv_hard_filter?: boolean | null
          obv_lookback?: number | null
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
          psar_af_increment?: number | null
          psar_af_max?: number | null
          psar_af_start?: number | null
          psar_enabled?: boolean | null
          psar_hard_filter?: boolean | null
          psar_trailing_enabled?: boolean | null
          regime_adx_threshold?: number | null
          regime_atr_pct_threshold?: number | null
          regime_if_false?: string | null
          regime_if_true?: string | null
          regime_lock_at_entry?: boolean | null
          regime_method?: string | null
          regime_operator?: string | null
          regime_range_exit_profile_id?: string | null
          regime_router_enabled?: boolean | null
          regime_trend_exit_profile_id?: string | null
          risk_per_trade_percent?: number | null
          rollover_d_min_long?: number | null
          rollover_d_min_short?: number | null
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
          signal_timing_mode?: string
          stochrsi_d_period?: number | null
          stochrsi_enabled?: boolean | null
          stochrsi_hard_filter?: boolean | null
          stochrsi_k_period?: number | null
          stochrsi_long_mode?: string
          stochrsi_overbought?: number | null
          stochrsi_overbought_d?: number | null
          stochrsi_overbought_k?: number | null
          stochrsi_oversold?: number | null
          stochrsi_oversold_d?: number | null
          stochrsi_oversold_k?: number | null
          stochrsi_period?: number | null
          stochrsi_short_mode?: string
          strategy_params_changed_at?: string | null
          supertrend_enabled?: boolean | null
          supertrend_hard_filter?: boolean | null
          supertrend_multiplier?: number | null
          supertrend_period?: number | null
          trailing_stop_activation_atr?: number | null
          trailing_stop_activation_enabled?: boolean | null
          trend_timeframe?: string | null
          trend_timeframe_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
          volume_avg_period?: number | null
          volume_enabled?: boolean | null
          volume_hard_filter?: boolean | null
          volume_mode_short?: string
          volume_multiplier?: number | null
          volume_multiplier_short?: number
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
          candle_close_entry_window_seconds?: number | null
          candle_momentum_enabled?: boolean | null
          cci_enabled?: boolean | null
          cci_hard_filter?: boolean | null
          cci_overbought?: number | null
          cci_oversold?: number | null
          cci_period?: number | null
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
          hard_sl_pct?: number | null
          hard_sl_pct_enabled?: boolean | null
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
          obv_enabled?: boolean | null
          obv_hard_filter?: boolean | null
          obv_lookback?: number | null
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
          psar_af_increment?: number | null
          psar_af_max?: number | null
          psar_af_start?: number | null
          psar_enabled?: boolean | null
          psar_hard_filter?: boolean | null
          psar_trailing_enabled?: boolean | null
          regime_adx_threshold?: number | null
          regime_atr_pct_threshold?: number | null
          regime_if_false?: string | null
          regime_if_true?: string | null
          regime_lock_at_entry?: boolean | null
          regime_method?: string | null
          regime_operator?: string | null
          regime_range_exit_profile_id?: string | null
          regime_router_enabled?: boolean | null
          regime_trend_exit_profile_id?: string | null
          risk_per_trade_percent?: number | null
          rollover_d_min_long?: number | null
          rollover_d_min_short?: number | null
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
          signal_timing_mode?: string
          stochrsi_d_period?: number | null
          stochrsi_enabled?: boolean | null
          stochrsi_hard_filter?: boolean | null
          stochrsi_k_period?: number | null
          stochrsi_long_mode?: string
          stochrsi_overbought?: number | null
          stochrsi_overbought_d?: number | null
          stochrsi_overbought_k?: number | null
          stochrsi_oversold?: number | null
          stochrsi_oversold_d?: number | null
          stochrsi_oversold_k?: number | null
          stochrsi_period?: number | null
          stochrsi_short_mode?: string
          strategy_params_changed_at?: string | null
          supertrend_enabled?: boolean | null
          supertrend_hard_filter?: boolean | null
          supertrend_multiplier?: number | null
          supertrend_period?: number | null
          trailing_stop_activation_atr?: number | null
          trailing_stop_activation_enabled?: boolean | null
          trend_timeframe?: string | null
          trend_timeframe_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
          volume_avg_period?: number | null
          volume_enabled?: boolean | null
          volume_hard_filter?: boolean | null
          volume_mode_short?: string
          volume_multiplier?: number | null
          volume_multiplier_short?: number
          vwap_enabled?: boolean | null
          vwap_hard_filter?: boolean | null
          vwap_period?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicator_config_regime_range_exit_profile_id_fkey"
            columns: ["regime_range_exit_profile_id"]
            isOneToOne: false
            referencedRelation: "exit_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_config_regime_trend_exit_profile_id_fkey"
            columns: ["regime_trend_exit_profile_id"]
            isOneToOne: false
            referencedRelation: "exit_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          low_price: number | null
          open_reason: string | null
          opened_at: string | null
          peak_price: number | null
          quantity: number
          side: string
          slot_id: string | null
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
          low_price?: number | null
          open_reason?: string | null
          opened_at?: string | null
          peak_price?: number | null
          quantity: number
          side: string
          slot_id?: string | null
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
          low_price?: number | null
          open_reason?: string | null
          opened_at?: string | null
          peak_price?: number | null
          quantity?: number
          side?: string
          slot_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "positions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "strategy_slots"
            referencedColumns: ["id"]
          },
        ]
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
          slot_id: string | null
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
          slot_id?: string | null
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
          slot_id?: string | null
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "strategy_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      scanner_status: {
        Row: {
          created_at: string
          id: string
          interval_ms: number
          is_active: boolean
          last_heartbeat_at: string | null
          last_scan_at: string | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_ms?: number
          is_active?: boolean
          last_heartbeat_at?: string | null
          last_scan_at?: string | null
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_ms?: number
          is_active?: boolean
          last_heartbeat_at?: string | null
          last_scan_at?: string | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategy_slots: {
        Row: {
          capital_percent: number
          config_id: string | null
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          slot_number: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          capital_percent?: number
          config_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slot_number: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          capital_percent?: number
          config_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slot_number?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_slots_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "indicator_config"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_history: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          created_at: string | null
          duration_minutes: number | null
          entry_fee: number | null
          entry_price: number
          exit_fee: number | null
          exit_price: number
          fees_data_missing: boolean | null
          fees_pct_of_notional: number | null
          fees_pending: boolean | null
          fees_reconciled_at: string | null
          funding_fee: number | null
          id: string
          indicators_snapshot: Json | null
          leverage_used: number | null
          low_price: number | null
          mae: number | null
          mae_percent: number | null
          net_pnl: number | null
          notional: number | null
          open_reason: string | null
          opened_at: string
          pnl: number
          pnl_after_fees: number | null
          pnl_percent: number
          quantity: number
          side: string
          slot_id: string | null
          strategy_hash: string | null
          symbol: string
          total_fee: number | null
          user_id: string
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          entry_fee?: number | null
          entry_price: number
          exit_fee?: number | null
          exit_price: number
          fees_data_missing?: boolean | null
          fees_pct_of_notional?: number | null
          fees_pending?: boolean | null
          fees_reconciled_at?: string | null
          funding_fee?: number | null
          id?: string
          indicators_snapshot?: Json | null
          leverage_used?: number | null
          low_price?: number | null
          mae?: number | null
          mae_percent?: number | null
          net_pnl?: number | null
          notional?: number | null
          open_reason?: string | null
          opened_at: string
          pnl: number
          pnl_after_fees?: number | null
          pnl_percent: number
          quantity: number
          side: string
          slot_id?: string | null
          strategy_hash?: string | null
          symbol: string
          total_fee?: number | null
          user_id: string
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          entry_fee?: number | null
          entry_price?: number
          exit_fee?: number | null
          exit_price?: number
          fees_data_missing?: boolean | null
          fees_pct_of_notional?: number | null
          fees_pending?: boolean | null
          fees_reconciled_at?: string | null
          funding_fee?: number | null
          id?: string
          indicators_snapshot?: Json | null
          leverage_used?: number | null
          low_price?: number | null
          mae?: number | null
          mae_percent?: number | null
          net_pnl?: number | null
          notional?: number | null
          open_reason?: string | null
          opened_at?: string
          pnl?: number
          pnl_after_fees?: number | null
          pnl_percent?: number
          quantity?: number
          side?: string
          slot_id?: string | null
          strategy_hash?: string | null
          symbol?: string
          total_fee?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_history_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "strategy_slots"
            referencedColumns: ["id"]
          },
        ]
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
