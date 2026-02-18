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
      bonus_agreements: {
        Row: {
          bonus_type: string
          category_filter: string | null
          category_mode: string | null
          created_at: string
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
          bonus_type: string
          category_filter?: string | null
          category_mode?: string | null
          created_at?: string
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
          bonus_type?: string
          category_filter?: string | null
          category_mode?: string | null
          created_at?: string
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
      purchase_records: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_code: string | null
          item_description: string | null
          order_date: string | null
          order_number: string | null
          quantity: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_number: string | null
          total_amount: number | null
          unit_price: number | null
          upload_batch: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_date?: string | null
          order_number?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_amount?: number | null
          unit_price?: number | null
          upload_batch?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_code?: string | null
          item_description?: string | null
          order_date?: string | null
          order_number?: string | null
          quantity?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_number?: string | null
          total_amount?: number | null
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
      sales_records: {
        Row: {
          category: string | null
          cost_price: number | null
          created_at: string
          customer_name: string | null
          id: string
          item_code: string | null
          item_description: string | null
          profit_direct: number | null
          quantity: number | null
          sale_date: string | null
          sale_price: number | null
          supplier_id: string | null
          supplier_name: string | null
          upload_batch: string | null
        }
        Insert: {
          category?: string | null
          cost_price?: number | null
          created_at?: string
          customer_name?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          profit_direct?: number | null
          quantity?: number | null
          sale_date?: string | null
          sale_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          upload_batch?: string | null
        }
        Update: {
          category?: string | null
          cost_price?: number | null
          created_at?: string
          customer_name?: string | null
          id?: string
          item_code?: string | null
          item_description?: string | null
          profit_direct?: number | null
          quantity?: number | null
          sale_date?: string | null
          sale_price?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          upload_batch?: string | null
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
