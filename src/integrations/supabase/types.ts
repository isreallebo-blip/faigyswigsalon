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
          last_notified_starts_at: string | null
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
          last_notified_starts_at?: string | null
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
          last_notified_starts_at?: string | null
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
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          channel: Database["public"]["Enums"]["message_channel"]
          client_id: string | null
          client_name: string | null
          created_at: string
          error_message: string | null
          id: string
          provider_message_id: string | null
          recipient: string | null
          status: Database["public"]["Enums"]["message_delivery_status"]
        }
        Insert: {
          broadcast_id: string
          channel: Database["public"]["Enums"]["message_channel"]
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient?: string | null
          status?: Database["public"]["Enums"]["message_delivery_status"]
        }
        Update: {
          broadcast_id?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          recipient?: string | null
          status?: Database["public"]["Enums"]["message_delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["broadcast_channel"]
          created_at: string
          delivered_count: number
          email_subject: string | null
          failed_count: number
          id: string
          recipient_count: number
          recipient_filter: Json
          recipient_filter_summary: string | null
          sent_at: string | null
          sent_by: string | null
          sent_by_name: string | null
          sent_count: number
          status: string
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["broadcast_channel"]
          created_at?: string
          delivered_count?: number
          email_subject?: string | null
          failed_count?: number
          id?: string
          recipient_count?: number
          recipient_filter?: Json
          recipient_filter_summary?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          sent_count?: number
          status?: string
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["broadcast_channel"]
          created_at?: string
          delivered_count?: number
          email_subject?: string | null
          failed_count?: number
          id?: string
          recipient_count?: number
          recipient_filter?: Json
          recipient_filter_summary?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          sent_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_id: string
          email: string | null
          email_opt_in: boolean
          full_name: string
          id: string
          measurements: Json
          notes: string | null
          outstanding_balance_reminded_at: string | null
          phone: string | null
          photo_url: string | null
          portal_disabled_at: string | null
          portal_disabled_by: string | null
          portal_failed_login_count: number
          portal_invite_sent_at: string | null
          portal_invite_sent_by: string | null
          portal_last_failed_login_at: string | null
          portal_last_login_at: string | null
          portal_lock_auto: boolean
          portal_lock_reason: string | null
          portal_locked_at: string | null
          portal_locked_by: string | null
          portal_signup_at: string | null
          portal_signup_method: string | null
          portal_status: Database["public"]["Enums"]["portal_account_status"]
          preferences: string | null
          self_registered: boolean
          self_registered_acknowledged: boolean
          sms_opt_in: boolean
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_id?: string
          email?: string | null
          email_opt_in?: boolean
          full_name: string
          id?: string
          measurements?: Json
          notes?: string | null
          outstanding_balance_reminded_at?: string | null
          phone?: string | null
          photo_url?: string | null
          portal_disabled_at?: string | null
          portal_disabled_by?: string | null
          portal_failed_login_count?: number
          portal_invite_sent_at?: string | null
          portal_invite_sent_by?: string | null
          portal_last_failed_login_at?: string | null
          portal_last_login_at?: string | null
          portal_lock_auto?: boolean
          portal_lock_reason?: string | null
          portal_locked_at?: string | null
          portal_locked_by?: string | null
          portal_signup_at?: string | null
          portal_signup_method?: string | null
          portal_status?: Database["public"]["Enums"]["portal_account_status"]
          preferences?: string | null
          self_registered?: boolean
          self_registered_acknowledged?: boolean
          sms_opt_in?: boolean
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_id?: string
          email?: string | null
          email_opt_in?: boolean
          full_name?: string
          id?: string
          measurements?: Json
          notes?: string | null
          outstanding_balance_reminded_at?: string | null
          phone?: string | null
          photo_url?: string | null
          portal_disabled_at?: string | null
          portal_disabled_by?: string | null
          portal_failed_login_count?: number
          portal_invite_sent_at?: string | null
          portal_invite_sent_by?: string | null
          portal_last_failed_login_at?: string | null
          portal_last_login_at?: string | null
          portal_lock_auto?: boolean
          portal_lock_reason?: string | null
          portal_locked_at?: string | null
          portal_locked_by?: string | null
          portal_signup_at?: string | null
          portal_signup_method?: string | null
          portal_status?: Database["public"]["Enums"]["portal_account_status"]
          preferences?: string | null
          self_registered?: boolean
          self_registered_acknowledged?: boolean
          sms_opt_in?: boolean
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          auto_reply_sent_at: string | null
          client_id: string | null
          created_at: string
          id: string
          last_inbound_channel:
            | Database["public"]["Enums"]["message_channel"]
            | null
          last_message_at: string
          last_message_preview: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          subject: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_reply_sent_at?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_inbound_channel?:
            | Database["public"]["Enums"]["message_channel"]
            | null
          last_message_at?: string
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_reply_sent_at?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_inbound_channel?:
            | Database["public"]["Enums"]["message_channel"]
            | null
          last_message_at?: string
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      intuit_connections: {
        Row: {
          access_token: string
          access_token_expires_at: string
          connected_by: string | null
          created_at: string
          environment: string
          id: string
          provider: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string | null
          scope: string
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          provider?: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at?: string | null
          scope: string
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          connected_by?: string | null
          created_at?: string
          environment?: string
          id?: string
          provider?: string
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string | null
          scope?: string
          token_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          client_id: string | null
          conversation_id: string
          created_at: string
          delivery_error: string | null
          delivery_status: Database["public"]["Enums"]["message_delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          in_reply_to: string | null
          metadata: Json
          provider_message_id: string | null
          read_by_client_at: string | null
          read_by_staff_at: string | null
          sender_name: string | null
          sender_user_id: string | null
          subject: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["message_channel"]
          client_id?: string | null
          conversation_id: string
          created_at?: string
          delivery_error?: string | null
          delivery_status?: Database["public"]["Enums"]["message_delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          in_reply_to?: string | null
          metadata?: Json
          provider_message_id?: string | null
          read_by_client_at?: string | null
          read_by_staff_at?: string | null
          sender_name?: string | null
          sender_user_id?: string | null
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["message_channel"]
          client_id?: string | null
          conversation_id?: string
          created_at?: string
          delivery_error?: string | null
          delivery_status?: Database["public"]["Enums"]["message_delivery_status"]
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          in_reply_to?: string | null
          metadata?: Json
          provider_message_id?: string | null
          read_by_client_at?: string | null
          read_by_staff_at?: string | null
          sender_name?: string | null
          sender_user_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_settings: {
        Row: {
          auto_reply_body: string
          auto_reply_enabled: boolean
          business_hours: Json
          default_assignee: string | null
          default_reply_channel: Database["public"]["Enums"]["message_channel"]
          id: number
          sms_cost_per_segment: number
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_reply_body?: string
          auto_reply_enabled?: boolean
          business_hours?: Json
          default_assignee?: string | null
          default_reply_channel?: Database["public"]["Enums"]["message_channel"]
          id?: number
          sms_cost_per_segment?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_reply_body?: string
          auto_reply_enabled?: boolean
          business_hours?: Json
          default_assignee?: string | null
          default_reply_channel?: Database["public"]["Enums"]["message_channel"]
          id?: number
          sms_cost_per_segment?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_settings_default_assignee_fkey"
            columns: ["default_assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string | null
          channel: string
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          provider_message_id: string | null
          recipient: string | null
          status: string
          subject: string | null
          template_key: string
        }
        Insert: {
          body?: string | null
          channel: string
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider_message_id?: string | null
          recipient?: string | null
          status: string
          subject?: string | null
          template_key: string
        }
        Update: {
          body?: string | null
          channel?: string
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          provider_message_id?: string | null
          recipient?: string | null
          status?: string
          subject?: string | null
          template_key?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          category: string
          created_at: string
          email_body: string
          email_subject: string
          enabled: boolean
          id: string
          key: string
          label: string
          send_email: boolean
          send_sms: boolean
          sms_body: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          email_body?: string
          email_subject?: string
          enabled?: boolean
          id?: string
          key: string
          label: string
          send_email?: boolean
          send_sms?: boolean
          sms_body?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email_body?: string
          email_subject?: string
          enabled?: boolean
          id?: string
          key?: string
          label?: string
          send_email?: boolean
          send_sms?: boolean
          sms_body?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          cardholder_name: string | null
          client_id: string
          created_at: string
          created_by: string | null
          customer_email: string | null
          exp_month: number | null
          exp_year: number | null
          id: string
          intuit_customer_id: string | null
          intuit_payment_method_id: string
          is_default: boolean
          last4: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          card_brand?: string | null
          cardholder_name?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          intuit_customer_id?: string | null
          intuit_payment_method_id: string
          is_default?: boolean
          last4?: string | null
          provider?: string
          updated_at?: string
        }
        Update: {
          card_brand?: string | null
          cardholder_name?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          intuit_customer_id?: string | null
          intuit_payment_method_id?: string
          is_default?: boolean
          last4?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          error_message: string | null
          id: string
          intuit_charge_id: string | null
          intuit_refund_id: string | null
          intuit_tid: string | null
          payment_method_id: string | null
          provider: string
          receipt_email: string | null
          receipt_sent_at: string | null
          receipt_token: string
          refunded_amount_cents: number
          salon_address: string | null
          salon_name: string | null
          salon_phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          error_message?: string | null
          id?: string
          intuit_charge_id?: string | null
          intuit_refund_id?: string | null
          intuit_tid?: string | null
          payment_method_id?: string | null
          provider?: string
          receipt_email?: string | null
          receipt_sent_at?: string | null
          receipt_token?: string
          refunded_amount_cents?: number
          salon_address?: string | null
          salon_name?: string | null
          salon_phone?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          error_message?: string | null
          id?: string
          intuit_charge_id?: string | null
          intuit_refund_id?: string | null
          intuit_tid?: string | null
          payment_method_id?: string | null
          provider?: string
          receipt_email?: string | null
          receipt_sent_at?: string | null
          receipt_token?: string
          refunded_amount_cents?: number
          salon_address?: string | null
          salon_name?: string | null
          salon_phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
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
      pending_email_changes: {
        Row: {
          confirm_token: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          new_email: string
          old_email: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Insert: {
          confirm_token: string
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          new_email: string
          old_email?: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Update: {
          confirm_token?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          new_email?: string
          old_email?: string | null
          subject_type?: Database["public"]["Enums"]["verification_subject"]
          user_id?: string
        }
        Relationships: []
      }
      pending_phone_changes: {
        Row: {
          attempts: number
          code_hash: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          new_phone: string
          old_phone: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          new_phone: string
          old_phone?: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          new_phone?: string
          old_phone?: string | null
          subject_type?: Database["public"]["Enums"]["verification_subject"]
          user_id?: string
        }
        Relationships: []
      }
      portal_activity_log: {
        Row: {
          actor: string
          actor_name: string | null
          actor_user_id: string | null
          client_id: string
          created_at: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          summary: string
          user_agent: string | null
        }
        Insert: {
          actor: string
          actor_name?: string | null
          actor_user_id?: string | null
          client_id: string
          created_at?: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          summary: string
          user_agent?: string | null
        }
        Update: {
          actor?: string
          actor_name?: string | null
          actor_user_id?: string | null
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          summary?: string
          user_agent?: string | null
        }
        Relationships: []
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
          display_id: string
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
          display_id?: string
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
          display_id?: string
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
      verification_challenges: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["verification_channel"]
          code_hash: string
          consumed_at: string | null
          created_at: string
          destination_masked: string
          expires_at: string
          id: string
          ip_address: string | null
          purpose: Database["public"]["Enums"]["verification_purpose"]
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["verification_channel"]
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          destination_masked: string
          expires_at: string
          id?: string
          ip_address?: string | null
          purpose?: Database["public"]["Enums"]["verification_purpose"]
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["verification_channel"]
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          destination_masked?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          purpose?: Database["public"]["Enums"]["verification_purpose"]
          subject_type?: Database["public"]["Enums"]["verification_subject"]
          user_id?: string
        }
        Relationships: []
      }
      verification_lockouts: {
        Row: {
          created_at: string
          id: string
          locked_until: string
          reason: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_until: string
          reason?: string | null
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_until?: string
          reason?: string | null
          subject_type?: Database["public"]["Enums"]["verification_subject"]
          user_id?: string
        }
        Relationships: []
      }
      verified_sessions: {
        Row: {
          expires_at: string
          id: string
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
          verified_at: string
        }
        Insert: {
          expires_at: string
          id?: string
          subject_type: Database["public"]["Enums"]["verification_subject"]
          user_id: string
          verified_at?: string
        }
        Update: {
          expires_at?: string
          id?: string
          subject_type?: Database["public"]["Enums"]["verification_subject"]
          user_id?: string
          verified_at?: string
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
          display_id: string
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
          display_id?: string
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
          display_id?: string
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
      current_client_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _uid: string }; Returns: boolean }
      is_user_locked: {
        Args: {
          _subject: Database["public"]["Enums"]["verification_subject"]
          _uid: string
        }
        Returns: string
      }
      is_user_verified: {
        Args: {
          _subject: Database["public"]["Enums"]["verification_subject"]
          _uid: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
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
      broadcast_channel: "sms" | "email" | "both"
      client_status: "new_consultation" | "active" | "inactive"
      conversation_status: "unread" | "read" | "replied" | "resolved"
      hair_type: "human" | "synthetic"
      message_channel: "sms" | "email" | "portal" | "internal_note"
      message_delivery_status:
        | "queued"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
      message_direction: "inbound" | "outbound"
      payment_category: "wig_sale" | "cut" | "wash_set" | "repair" | "other"
      payment_method: "cash" | "check" | "credit_card" | "zelle" | "other"
      portal_account_status:
        | "not_signed_up"
        | "active"
        | "locked"
        | "disabled"
        | "pending_verification"
      repair_status: "sent_to_vendor" | "in_progress" | "returned" | "issue"
      step_status: "pending" | "in_progress" | "completed" | "skipped"
      user_status: "active" | "invited" | "disabled"
      vendor_status: "active" | "inactive"
      vendor_type: "supplier" | "repair" | "both"
      verification_channel: "email" | "sms"
      verification_purpose: "reauth" | "email_change" | "phone_change"
      verification_subject: "staff" | "client"
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
      broadcast_channel: ["sms", "email", "both"],
      client_status: ["new_consultation", "active", "inactive"],
      conversation_status: ["unread", "read", "replied", "resolved"],
      hair_type: ["human", "synthetic"],
      message_channel: ["sms", "email", "portal", "internal_note"],
      message_delivery_status: [
        "queued",
        "sent",
        "delivered",
        "read",
        "failed",
      ],
      message_direction: ["inbound", "outbound"],
      payment_category: ["wig_sale", "cut", "wash_set", "repair", "other"],
      payment_method: ["cash", "check", "credit_card", "zelle", "other"],
      portal_account_status: [
        "not_signed_up",
        "active",
        "locked",
        "disabled",
        "pending_verification",
      ],
      repair_status: ["sent_to_vendor", "in_progress", "returned", "issue"],
      step_status: ["pending", "in_progress", "completed", "skipped"],
      user_status: ["active", "invited", "disabled"],
      vendor_status: ["active", "inactive"],
      vendor_type: ["supplier", "repair", "both"],
      verification_channel: ["email", "sms"],
      verification_purpose: ["reauth", "email_change", "phone_change"],
      verification_subject: ["staff", "client"],
      wig_status: ["available", "reserved", "sent_for_repair", "sold"],
      workflow_status: ["open", "completed", "cancelled"],
      workflow_type: ["sale_cut", "wash_set"],
    },
  },
} as const
