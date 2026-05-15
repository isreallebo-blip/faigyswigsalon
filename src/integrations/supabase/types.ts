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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          client_id: string | null
          created_at: string
          data: Json
          id: string
          ref_id: string | null
          ref_table: string | null
          summary: string
          type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          ref_id?: string | null
          ref_table?: string | null
          summary: string
          type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          ref_id?: string | null
          ref_table?: string | null
          summary?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          client_id: string
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
          workflow_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          workflow_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
          workflow_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          after: Json | null
          before: Json | null
          changes: Json | null
          created_at: string
          id: string
          ip_address: string | null
          module: string
          record_id: string | null
          record_label: string | null
          summary: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          after?: Json | null
          before?: Json | null
          changes?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module: string
          record_id?: string | null
          record_label?: string | null
          summary: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          after?: Json | null
          before?: Json | null
          changes?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          module?: string
          record_id?: string | null
          record_label?: string | null
          summary?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          created_at: string
          id: string
          name: string
          starting_balance: number
          type: Database["public"]["Enums"]["bank_account_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          starting_balance?: number
          type?: Database["public"]["Enums"]["bank_account_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          starting_balance?: number
          type?: Database["public"]["Enums"]["bank_account_type"]
          updated_at?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          date: string
          description: string | null
          id: string
          is_matched: boolean
          matched_payment_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string
          date: string
          description?: string | null
          id?: string
          is_matched?: boolean
          matched_payment_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          is_matched?: boolean
          matched_payment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          measurements: Json
          notes: string | null
          phone: string | null
          photo_url: string | null
          preferences: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          measurements?: Json
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          preferences?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          measurements?: Json
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          preferences?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: []
      }
      custom_orders: {
        Row: {
          client_id: string | null
          created_at: string
          expected_delivery: string | null
          id: string
          notes: string | null
          received_date: string | null
          specs: string | null
          updated_at: string
          vendor: string | null
          vendor_id: string | null
          wig_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          received_date?: string | null
          specs?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
          wig_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          received_date?: string | null
          specs?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_id?: string | null
          wig_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_orders_wig_id_fkey"
            columns: ["wig_id"]
            isOneToOne: false
            referencedRelation: "wigs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          category: Database["public"]["Enums"]["payment_category"]
          client_id: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category?: Database["public"]["Enums"]["payment_category"]
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category?: Database["public"]["Enums"]["payment_category"]
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_fk"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_login_at: string | null
          last_name: string | null
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_login_at?: string | null
          last_name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: []
      }
      repairs: {
        Row: {
          actual_return: string | null
          client_id: string | null
          cost: number | null
          created_at: string
          date_sent: string
          expected_return: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["repair_status"]
          updated_at: string
          vendor: string
          vendor_id: string | null
          wig_id: string | null
          work_requested: string | null
          workflow_id: string | null
        }
        Insert: {
          actual_return?: string | null
          client_id?: string | null
          cost?: number | null
          created_at?: string
          date_sent?: string
          expected_return?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["repair_status"]
          updated_at?: string
          vendor: string
          vendor_id?: string | null
          wig_id?: string | null
          work_requested?: string | null
          workflow_id?: string | null
        }
        Update: {
          actual_return?: string | null
          client_id?: string | null
          cost?: number | null
          created_at?: string
          date_sent?: string
          expected_return?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["repair_status"]
          updated_at?: string
          vendor?: string
          vendor_id?: string | null
          wig_id?: string | null
          work_requested?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repairs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_wig_id_fkey"
            columns: ["wig_id"]
            isOneToOne: false
            referencedRelation: "wigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      service_workflows: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["workflow_status"]
          type: Database["public"]["Enums"]["workflow_type"]
          updated_at: string
          wig_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          type: Database["public"]["Enums"]["workflow_type"]
          updated_at?: string
          wig_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["workflow_status"]
          type?: Database["public"]["Enums"]["workflow_type"]
          updated_at?: string
          wig_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_workflows_wig_id_fkey"
            columns: ["wig_id"]
            isOneToOne: false
            referencedRelation: "wigs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          type: Database["public"]["Enums"]["vendor_type"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          type?: Database["public"]["Enums"]["vendor_type"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          type?: Database["public"]["Enums"]["vendor_type"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      wigs: {
        Row: {
          brand: string | null
          cap_size: string | null
          color: string | null
          cost: number | null
          created_at: string
          hair_type: Database["public"]["Enums"]["hair_type"] | null
          id: string
          notes: string | null
          photos: string[]
          price: number | null
          quantity: number
          reserved_for_client_id: string | null
          status: Database["public"]["Enums"]["wig_status"]
          style: string | null
          updated_at: string
          vendor_id: string | null
          wig_code: string | null
        }
        Insert: {
          brand?: string | null
          cap_size?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          hair_type?: Database["public"]["Enums"]["hair_type"] | null
          id?: string
          notes?: string | null
          photos?: string[]
          price?: number | null
          quantity?: number
          reserved_for_client_id?: string | null
          status?: Database["public"]["Enums"]["wig_status"]
          style?: string | null
          updated_at?: string
          vendor_id?: string | null
          wig_code?: string | null
        }
        Update: {
          brand?: string | null
          cap_size?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          hair_type?: Database["public"]["Enums"]["hair_type"] | null
          id?: string
          notes?: string | null
          photos?: string[]
          price?: number | null
          quantity?: number
          reserved_for_client_id?: string | null
          status?: Database["public"]["Enums"]["wig_status"]
          style?: string | null
          updated_at?: string
          vendor_id?: string | null
          wig_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wigs_reserved_for_client_id_fkey"
            columns: ["reserved_for_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wigs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          data: Json
          id: string
          notes: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["step_status"]
          step_key: string
          step_label: string
          step_order: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_key: string
          step_label: string
          step_order: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["step_status"]
          step_key?: string
          step_label?: string
          step_order?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "no_show"
        | "cancelled"
      appointment_type: "consultation" | "cut" | "wash_set" | "pickup"
      audit_action: "create" | "update" | "delete" | "view" | "void"
      bank_account_type: "bank" | "cc_processor"
      client_status: "new_consultation" | "active" | "inactive"
      hair_type: "human" | "synthetic"
      payment_category: "wig_sale" | "cut" | "wash_set" | "repair" | "other"
      payment_method: "cash" | "check" | "credit_card" | "zelle" | "other"
      repair_status: "sent_to_vendor" | "in_progress" | "returned" | "issue"
      step_status: "pending" | "in_progress" | "completed" | "skipped"
      user_status: "active" | "invited" | "disabled"
      vendor_status: "active" | "inactive"
      vendor_type: "supplier" | "repair" | "both"
      wig_status: "available" | "reserved" | "sent_for_repair" | "sold"
      workflow_status: "open" | "completed" | "cancelled"
      workflow_type: "sale_cut" | "wash_set"
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
    Enums: {
      app_role: ["admin", "staff"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "no_show",
        "cancelled",
      ],
      appointment_type: ["consultation", "cut", "wash_set", "pickup"],
      audit_action: ["create", "update", "delete", "view", "void"],
      bank_account_type: ["bank", "cc_processor"],
      client_status: ["new_consultation", "active", "inactive"],
      hair_type: ["human", "synthetic"],
      payment_category: ["wig_sale", "cut", "wash_set", "repair", "other"],
      payment_method: ["cash", "check", "credit_card", "zelle", "other"],
      repair_status: ["sent_to_vendor", "in_progress", "returned", "issue"],
      step_status: ["pending", "in_progress", "completed", "skipped"],
      user_status: ["active", "invited", "disabled"],
      vendor_status: ["active", "inactive"],
      vendor_type: ["supplier", "repair", "both"],
      wig_status: ["available", "reserved", "sent_for_repair", "sold"],
      workflow_status: ["open", "completed", "cancelled"],
      workflow_type: ["sale_cut", "wash_set"],
    },
  },
} as const
