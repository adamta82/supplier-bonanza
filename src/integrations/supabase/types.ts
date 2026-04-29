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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agreement_notes: {
        Row: {
          agreement_id: string
          author_name: string
          created_at: string
          id: string
          note_text: string
        }
        Insert: {
          agreement_id: string
          author_name: string
          created_at?: string
          id?: string
          note_text: string
        }
        Update: {
          agreement_id?: string
          author_name?: string
          created_at?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_notes_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "bonus_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_agreements: {
        Row: {
          bonus_payment_type: string
          bonus_status: string | null
          bonus_type: string
          category_filter: string | null
          category_mode: string | null
          created_at: string
          deal_amount: number | null
          document_path: string | null
          exclusions: Json | null
          fixed_amount: number | null
          fixed_percentage: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          period_type: string | null
          series_name: string | null
          supplier_id: string
          target_type: string | null
          updated_at: string
          vat_included: boolean | null
        }
        Insert: {
          bonus_payment_type?: string
          bonus_status?: string | null
          bonus_type: string
          category_filter?: string | null
          category_mode?: string | null
          created_at?: string
          deal_amount?: number | null
          document_path?: string | null
          exclusions?: Json | null
          fixed_amount?: number | null
          fixed_percentage?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          series_name?: string | null
          supplier_id: string
          target_type?: string | null
          updated_at?: string
          vat_included?: boolean | null
        }
        Update: {
          bonus_payment_type?: string
          bonus_status?: string | null
          bonus_type?: string
          category_filter?: string | null
          category_mode?: string | null
          created_at?: string
          deal_amount?: number | null
          document_path?: string | null
          exclusions?: Json | null
          fixed_amount?: number | null
          fixed_percentage?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          series_name?: string | null
          supplier_id?: string
          target_type?: string | null
          updated_at?: string
          vat_included?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_agreements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_tiers: {
        Row: {
          agreement_id: string
          bonus_percentage: number
          created_at: string
          id: string
          target_value: number
          tier_order: number
        }
        Insert: {
          agreement_id: string
          bonus_percentage: number
          created_at?: string
          id?: string
          target_value: number
          tier_order: number
        }
        Update: {
          agreement_id?: string
          bonus_percentage?: number
          created_at?: string
          id?: string
          target_value?: number
          tier_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonus_tiers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "bonus_agreements"
            referencedColumns: ["id"]
          },
        ]
      }
      consolidated_invoice_items: {
        Row: {
          created_at: string
          gr_number: string | null
          id: string
          internal_number: string | null
          invoice_date: string | null
          invoice_number: string | null
          item_code: string | null
          item_description: string | null
          po_number: string | null
          quantity: number | null
          status: string | null
          supplier_name: string | null
          supplier_number: string | null
          total_with_vat: number | null
          unit_price: number | null
          upload_batch: string | null
        }
        Insert: {
          created_at?: string
          gr_number?: string | null
          id?: string
          internal_number?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          po_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Update: {
          created_at?: string
          gr_number?: string | null
          id?: string
          internal_number?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          po_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          created_at: string
          customer_name: string | null
          id: string
          item_code: string | null
          item_description: string | null
          note_date: string | null
          note_number: string | null
          order_number: string | null
          quantity: number | null
          status: string | null
          supplier_name: string | null
          supplier_number: string | null
          total_price: number | null
          upload_batch: string | null
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          note_date?: string | null
          note_number?: string | null
          order_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_price?: number | null
          upload_batch?: string | null
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          note_date?: string | null
          note_number?: string | null
          order_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_price?: number | null
          upload_batch?: string | null
        }
        Relationships: []
      }
      historical_supplier_data: {
        Row: {
          cost_total: number | null
          created_at: string
          id: string
          profit_amount: number | null
          profit_margin: number | null
          purchase_volume: number | null
          record_count: number | null
          sales_volume: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_number: string | null
          year: number
        }
        Insert: {
          cost_total?: number | null
          created_at?: string
          id?: string
          profit_amount?: number | null
          profit_margin?: number | null
          purchase_volume?: number | null
          record_count?: number | null
          sales_volume?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          year: number
        }
        Update: {
          cost_total?: number | null
          created_at?: string
          id?: string
          profit_amount?: number | null
          profit_margin?: number | null
          purchase_volume?: number | null
          record_count?: number | null
          sales_volume?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_supplier_data_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      purchase_records: {
        Row: {
          barcode: string | null
          category: string | null
          created_at: string
          customer_po: string | null
          due_date: string | null
          id: string
          item_code: string | null
          item_description: string | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          quantity: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_number: string | null
          total_amount: number | null
          total_with_vat: number | null
          unit_price: number | null
          upload_batch: string | null
        }
        Insert: {
          barcode?: string | null
          category?: string | null
          created_at?: string
          customer_po?: string | null
          due_date?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_amount?: number | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Update: {
          barcode?: string | null
          category?: string | null
          created_at?: string
          customer_po?: string | null
          due_date?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_amount?: number | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_records_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_approvals: {
        Row: {
          approval_notes: string | null
          created_at: string
          document_type: string
          id: string
          match_key: string
          match_type: string
          matched_value: number | null
          original_value: number | null
        }
        Insert: {
          approval_notes?: string | null
          created_at?: string
          document_type: string
          id?: string
          match_key: string
          match_type: string
          matched_value?: number | null
          original_value?: number | null
        }
        Update: {
          approval_notes?: string | null
          created_at?: string
          document_type?: string
          id?: string
          match_key?: string
          match_type?: string
          matched_value?: number | null
          original_value?: number | null
        }
        Relationships: []
      }
      sales_records: {
        Row: {
          brand: string | null
          category: string | null
          cost_price: number | null
          created_at: string
          customer_name: string | null
          customer_po: string | null
          id: string
          item_code: string | null
          item_description: string | null
          order_number: string | null
          order_status: string | null
          profit_direct: number | null
          quantity: number | null
          sale_date: string | null
          sale_price: number | null
          supplier_id: string | null
          supplier_name: string | null
          upload_batch: string | null
          zabilo_id: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          customer_name?: string | null
          customer_po?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_number?: string | null
          order_status?: string | null
          profit_direct?: number | null
          quantity?: number | null
          sale_date?: string | null
          sale_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          upload_batch?: string | null
          zabilo_id?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost_price?: number | null
          created_at?: string
          customer_name?: string | null
          customer_po?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_number?: string | null
          order_status?: string | null
          profit_direct?: number | null
          quantity?: number | null
          sale_date?: string | null
          sale_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          upload_batch?: string | null
          zabilo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_records_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      shekel_campaign_exclusions: {
        Row: {
          campaign_setting_id: string
          excluded_at: string
          gift_status: string
          id: string
          purchase_record_id: string
        }
        Insert: {
          campaign_setting_id: string
          excluded_at?: string
          gift_status?: string
          id?: string
          purchase_record_id: string
        }
        Update: {
          campaign_setting_id?: string
          excluded_at?: string
          gift_status?: string
          id?: string
          purchase_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shekel_campaign_exclusions_campaign_setting_id_fkey"
            columns: ["campaign_setting_id"]
            isOneToOne: false
            referencedRelation: "shekel_campaign_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shekel_campaign_exclusions_purchase_record_id_fkey"
            columns: ["purchase_record_id"]
            isOneToOne: false
            referencedRelation: "purchase_records"
            referencedColumns: ["id"]
          },
        ]
      }
      shekel_campaign_settings: {
        Row: {
          campaign_name: string
          created_at: string
          double_gift_threshold: number | null
          end_date: string
          id: string
          is_active: boolean
          start_date: string
          supplier_id: string
          supplier_reported_gifts: number | null
          threshold_amount: number
          updated_at: string
        }
        Insert: {
          campaign_name: string
          created_at?: string
          double_gift_threshold?: number | null
          end_date: string
          id?: string
          is_active?: boolean
          start_date: string
          supplier_id: string
          supplier_reported_gifts?: number | null
          threshold_amount?: number
          updated_at?: string
        }
        Update: {
          campaign_name?: string
          created_at?: string
          double_gift_threshold?: number | null
          end_date?: string
          id?: string
          is_active?: boolean
          start_date?: string
          supplier_id?: string
          supplier_reported_gifts?: number | null
          threshold_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shekel_campaign_settings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_items: {
        Row: {
          created_at: string
          id: string
          internal_number: string | null
          invoice_date: string | null
          invoice_number: string | null
          item_code: string | null
          item_description: string | null
          po_number: string | null
          quantity: number | null
          status: string | null
          supplier_name: string | null
          supplier_number: string | null
          total_payment: number | null
          total_with_vat: number | null
          unit_price: number | null
          upload_batch: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          internal_number?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          po_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_payment?: number | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          internal_number?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          item_code?: string | null
          item_description?: string | null
          po_number?: string | null
          quantity?: number | null
          status?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_payment?: number | null
          total_with_vat?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          annual_bonus_status: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          obligo: number | null
          payment_terms: string | null
          reconciliation_date: string | null
          shotef: number | null
          supplier_number: string | null
          updated_at: string
        }
        Insert: {
          annual_bonus_status?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          obligo?: number | null
          payment_terms?: string | null
          reconciliation_date?: string | null
          shotef?: number | null
          supplier_number?: string | null
          updated_at?: string
        }
        Update: {
          annual_bonus_status?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          obligo?: number | null
          payment_terms?: string | null
          reconciliation_date?: string | null
          shotef?: number | null
          supplier_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transaction_bonuses: {
        Row: {
          agreement_id: string | null
          bonus_payment_type: string
          bonus_value: number
          counts_toward_target: boolean | null
          created_at: string
          description: string | null
          id: string
          items_detail: string | null
          supplier_id: string
          total_value: number
          transaction_date: string
        }
        Insert: {
          agreement_id?: string | null
          bonus_payment_type?: string
          bonus_value: number
          counts_toward_target?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          items_detail?: string | null
          supplier_id: string
          total_value: number
          transaction_date: string
        }
        Update: {
          agreement_id?: string | null
          bonus_payment_type?: string
          bonus_value?: number
          counts_toward_target?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          items_detail?: string | null
          supplier_id?: string
          total_value?: number
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_bonuses_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "bonus_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_bonuses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_campaign_groups: {
        Row: {
          campaign_id: string
          created_at: string
          group_name: string
          id: string
          item_codes: string[]
          voucher_value: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          group_name: string
          id?: string
          item_codes?: string[]
          voucher_value?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          group_name?: string
          id?: string
          item_codes?: string[]
          voucher_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "voucher_campaign_groups_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voucher_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_campaign_notes: {
        Row: {
          author_name: string
          campaign_id: string
          created_at: string
          id: string
          note_text: string
        }
        Insert: {
          author_name: string
          campaign_id: string
          created_at?: string
          id?: string
          note_text: string
        }
        Update: {
          author_name?: string
          campaign_id?: string
          created_at?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_campaign_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voucher_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_campaigns: {
        Row: {
          campaign_name: string
          claim_status: string
          claimed_amount: number | null
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          notes: string | null
          report_file_path: string | null
          start_date: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          campaign_name: string
          claim_status?: string
          claimed_amount?: number | null
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          notes?: string | null
          report_file_path?: string | null
          start_date: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          campaign_name?: string
          claim_status?: string
          claimed_amount?: number | null
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          report_file_path?: string | null
          start_date?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_campaigns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_claim_status: {
        Row: {
          campaign_id: string
          created_at: string
          group_id: string
          id: string
          quantity: number
          sales_record_id: string
          status: string
          updated_at: string
          voucher_value: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          group_id: string
          id?: string
          quantity?: number
          sales_record_id: string
          status?: string
          updated_at?: string
          voucher_value?: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          group_id?: string
          id?: string
          quantity?: number
          sales_record_id?: string
          status?: string
          updated_at?: string
          voucher_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "voucher_claim_status_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voucher_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_claim_status_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "voucher_campaign_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_claim_status_sales_record_id_fkey"
            columns: ["sales_record_id"]
            isOneToOne: false
            referencedRelation: "sales_records"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_purchases_by_supplier: {
        Args: never
        Returns: {
          supplier_name: string
          total_amount: number
        }[]
      }
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
