export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          timezone: string
          preferences: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          timezone?: string
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          timezone?: string
          preferences?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          id: string
          user_id: string
          teller_account_id: string | null
          teller_enrollment_id: string | null
          teller_access_token: string | null
          institution_name: string
          institution_logo_url: string | null
          account_name: string
          account_type: string
          account_subtype: string | null
          account_number_last4: string | null
          current_balance: number | null
          available_balance: number | null
          balance_updated_at: string | null
          last_sync_at: string | null
          sync_status: string
          sync_error: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          teller_account_id?: string | null
          teller_enrollment_id?: string | null
          teller_access_token?: string | null
          institution_name: string
          institution_logo_url?: string | null
          account_name: string
          account_type: string
          account_subtype?: string | null
          account_number_last4?: string | null
          current_balance?: number | null
          available_balance?: number | null
          balance_updated_at?: string | null
          last_sync_at?: string | null
          sync_status?: string
          sync_error?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          teller_account_id?: string | null
          teller_enrollment_id?: string | null
          teller_access_token?: string | null
          institution_name?: string
          institution_logo_url?: string | null
          account_name?: string
          account_type?: string
          account_subtype?: string | null
          account_number_last4?: string | null
          current_balance?: number | null
          available_balance?: number | null
          balance_updated_at?: string | null
          last_sync_at?: string | null
          sync_status?: string
          sync_error?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          bank_account_id: string
          teller_transaction_id: string | null
          date: string
          description: string
          merchant_name: string | null
          amount: number
          currency: string
          category_id: string | null
          category_confidence: number | null
          category_source: string | null
          status: string
          type: string | null
          notes: string | null
          tags: string[] | null
          is_reviewed: boolean
          is_hidden: boolean
          raw_data: Json | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          bank_account_id: string
          teller_transaction_id?: string | null
          date: string
          description: string
          merchant_name?: string | null
          amount: number
          currency?: string
          category_id?: string | null
          category_confidence?: number | null
          category_source?: string | null
          status?: string
          type?: string | null
          notes?: string | null
          tags?: string[] | null
          is_reviewed?: boolean
          is_hidden?: boolean
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          bank_account_id?: string
          teller_transaction_id?: string | null
          date?: string
          description?: string
          merchant_name?: string | null
          amount?: number
          currency?: string
          category_id?: string | null
          category_confidence?: number | null
          category_source?: string | null
          status?: string
          type?: string | null
          notes?: string | null
          tags?: string[] | null
          is_reviewed?: boolean
          is_hidden?: boolean
          raw_data?: Json | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      transaction_categories: {
        Row: {
          id: string
          user_id: string | null
          name: string
          slug: string
          icon: string | null
          color: string | null
          parent_id: string | null
          schedule_c_category: string | null
          is_deductible: boolean
          is_system: boolean
          sort_order: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          slug: string
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          schedule_c_category?: string | null
          is_deductible?: boolean
          is_system?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          slug?: string
          icon?: string | null
          color?: string | null
          parent_id?: string | null
          schedule_c_category?: string | null
          is_deductible?: boolean
          is_system?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_type: string
          file_size: number
          storage_path: string
          extracted_text: string | null
          ocr_status: string
          ocr_error: string | null
          document_type: string | null
          document_type_confidence: number | null
          metadata: Json
          title: string | null
          description: string | null
          tags: string[] | null
          linked_transaction_ids: string[] | null
          linked_client_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_type: string
          file_size: number
          storage_path: string
          extracted_text?: string | null
          ocr_status?: string
          ocr_error?: string | null
          document_type?: string | null
          document_type_confidence?: number | null
          metadata?: Json
          title?: string | null
          description?: string | null
          tags?: string[] | null
          linked_transaction_ids?: string[] | null
          linked_client_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          file_type?: string
          file_size?: number
          storage_path?: string
          extracted_text?: string | null
          ocr_status?: string
          ocr_error?: string | null
          document_type?: string | null
          document_type_confidence?: number | null
          metadata?: Json
          title?: string | null
          description?: string | null
          tags?: string[] | null
          linked_transaction_ids?: string[] | null
          linked_client_id?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          user_id: string
          name: string
          company: string | null
          email: string | null
          phone: string | null
          website: string | null
          industry: string | null
          service_type: string | null
          monthly_retainer: number | null
          hourly_rate: number | null
          total_revenue: number
          total_expenses: number
          status: string
          started_at: string | null
          ended_at: string | null
          notes: string | null
          tags: string[] | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          company?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          industry?: string | null
          service_type?: string | null
          monthly_retainer?: number | null
          hourly_rate?: number | null
          total_revenue?: number
          total_expenses?: number
          status?: string
          started_at?: string | null
          ended_at?: string | null
          notes?: string | null
          tags?: string[] | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          company?: string | null
          email?: string | null
          phone?: string | null
          website?: string | null
          industry?: string | null
          service_type?: string | null
          monthly_retainer?: number | null
          hourly_rate?: number | null
          total_revenue?: number
          total_expenses?: number
          status?: string
          started_at?: string | null
          ended_at?: string | null
          notes?: string | null
          tags?: string[] | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      client_expenses: {
        Row: {
          id: string
          user_id: string
          client_id: string
          description: string
          amount: number
          category: 'software' | 'subscription' | 'contractor' | 'advertising' | 'hosting' | 'tools' | 'travel' | 'other'
          expense_date: string
          is_recurring: boolean
          recurring_frequency: 'monthly' | 'quarterly' | 'yearly' | null
          vendor: string | null
          receipt_url: string | null
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          description: string
          amount: number
          category?: 'software' | 'subscription' | 'contractor' | 'advertising' | 'hosting' | 'tools' | 'travel' | 'other'
          expense_date?: string
          is_recurring?: boolean
          recurring_frequency?: 'monthly' | 'quarterly' | 'yearly' | null
          vendor?: string | null
          receipt_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          description?: string
          amount?: number
          category?: 'software' | 'subscription' | 'contractor' | 'advertising' | 'hosting' | 'tools' | 'travel' | 'other'
          expense_date?: string
          is_recurring?: boolean
          recurring_frequency?: 'monthly' | 'quarterly' | 'yearly' | null
          vendor?: string | null
          receipt_url?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      client_revenue: {
        Row: {
          id: string
          user_id: string
          client_id: string
          description: string
          amount: number
          category: 'retainer' | 'project' | 'hourly' | 'bonus' | 'reimbursement' | 'other'
          revenue_date: string
          invoice_number: string | null
          paid: boolean
          paid_at: string | null
          hours_worked: number | null
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          description: string
          amount: number
          category?: 'retainer' | 'project' | 'hourly' | 'bonus' | 'reimbursement' | 'other'
          revenue_date?: string
          invoice_number?: string | null
          paid?: boolean
          paid_at?: string | null
          hours_worked?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          description?: string
          amount?: number
          category?: 'retainer' | 'project' | 'hourly' | 'bonus' | 'reimbursement' | 'other'
          revenue_date?: string
          invoice_number?: string | null
          paid?: boolean
          paid_at?: string | null
          hours_worked?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          user_id: string
          role: string
          content: string
          audio_url: string | null
          session_id: string | null
          input_source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: string
          content: string
          audio_url?: string | null
          session_id?: string | null
          input_source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: string
          content?: string
          audio_url?: string | null
          session_id?: string | null
          input_source?: string | null
          created_at?: string
        }
        Relationships: []
      }
      google_oauth_tokens: {
        Row: {
          id: string
          user_id: string
          access_token: string
          refresh_token: string
          token_type: string
          expires_at: string
          scopes: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          access_token: string
          refresh_token: string
          token_type?: string
          expires_at: string
          scopes?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          access_token?: string
          refresh_token?: string
          token_type?: string
          expires_at?: string
          scopes?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      google_accounts: {
        Row: {
          id: string
          user_id: string
          google_email: string
          google_user_id: string | null
          account_label: string
          access_token: string
          refresh_token: string
          token_type: string
          expires_at: string
          scopes: string[] | null
          is_active: boolean
          last_sync_at: string | null
          sync_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          google_email: string
          google_user_id?: string | null
          account_label?: string
          access_token: string
          refresh_token: string
          token_type?: string
          expires_at: string
          scopes?: string[] | null
          is_active?: boolean
          last_sync_at?: string | null
          sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          google_email?: string
          google_user_id?: string | null
          account_label?: string
          access_token?: string
          refresh_token?: string
          token_type?: string
          expires_at?: string
          scopes?: string[] | null
          is_active?: boolean
          last_sync_at?: string | null
          sync_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_watch_channels: {
        Row: {
          id: string
          user_id: string
          google_account_id: string
          channel_id: string
          resource_id: string
          history_id: string
          expiration: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          google_account_id: string
          channel_id: string
          resource_id: string
          history_id: string
          expiration: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          google_account_id?: string
          channel_id?: string
          resource_id?: string
          history_id?: string
          expiration?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      drive_watch_channels: {
        Row: {
          id: string
          user_id: string
          channel_id: string
          resource_id: string
          page_token: string | null
          expiration: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          channel_id: string
          resource_id: string
          page_token?: string | null
          expiration: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          channel_id?: string
          resource_id?: string
          page_token?: string | null
          expiration?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          id: string
          user_id: string
          service: string
          model: string | null
          endpoint: string | null
          input_tokens: number
          output_tokens: number
          total_tokens: number
          estimated_cost_usd: number
          request_metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          service: string
          model?: string | null
          endpoint?: string | null
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          estimated_cost_usd?: number
          request_metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          service?: string
          model?: string | null
          endpoint?: string | null
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
          estimated_cost_usd?: number
          request_metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      user_budgets: {
        Row: {
          id: string
          user_id: string
          budget_type: string
          period: string
          amount_usd: number
          alert_threshold_percent: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          budget_type: string
          period?: string
          amount_usd: number
          alert_threshold_percent?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          budget_type?: string
          period?: string
          amount_usd?: number
          alert_threshold_percent?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          id: string
          user_id: string
          memory_type: string
          key: string
          value: Json
          confidence: number
          source: string
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          memory_type: string
          key: string
          value: Json
          confidence?: number
          source?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          memory_type?: string
          key?: string
          value?: Json
          confidence?: number
          source?: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          client: string | null
          client_id: string | null
          client_contact_id: string | null
          description: string | null
          status: 'active' | 'blocked' | 'waiting' | 'completed' | 'on_hold' | 'archived'
          priority: number
          related_emails: string[]
          related_files: string[]
          notes: string | null
          due_date: string | null
          started_at: string | null
          due_at: string | null
          completed_at: string | null
          tags: string[] | null
          metadata: Json
          keywords: string[]
          base_folder_path: string | null
          auto_organize: boolean
          start_date: string | null
          end_date: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          client?: string | null
          client_id?: string | null
          client_contact_id?: string | null
          description?: string | null
          status?: 'active' | 'blocked' | 'waiting' | 'completed' | 'on_hold'
          priority?: number
          related_emails?: string[]
          related_files?: string[]
          notes?: string | null
          due_date?: string | null
          started_at?: string | null
          due_at?: string | null
          completed_at?: string | null
          tags?: string[] | null
          metadata?: Json
          keywords?: string[]
          base_folder_path?: string | null
          auto_organize?: boolean
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          client?: string | null
          client_id?: string | null
          client_contact_id?: string | null
          description?: string | null
          status?: 'active' | 'blocked' | 'waiting' | 'completed' | 'on_hold'
          priority?: number
          related_emails?: string[]
          related_files?: string[]
          notes?: string | null
          due_date?: string | null
          started_at?: string | null
          due_at?: string | null
          completed_at?: string | null
          tags?: string[] | null
          metadata?: Json
          keywords?: string[]
          base_folder_path?: string | null
          auto_organize?: boolean
          start_date?: string | null
          end_date?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      project_files: {
        Row: {
          id: string
          project_id: string
          user_id: string
          drive_file_id: string
          file_name: string
          file_type: string | null
          web_view_link: string | null
          icon_link: string | null
          association_type: string
          confidence: number | null
          ai_reasoning: string | null
          is_confirmed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          drive_file_id: string
          file_name: string
          file_type?: string | null
          web_view_link?: string | null
          icon_link?: string | null
          association_type?: string
          confidence?: number | null
          ai_reasoning?: string | null
          is_confirmed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          drive_file_id?: string
          file_name?: string
          file_type?: string | null
          web_view_link?: string | null
          icon_link?: string | null
          association_type?: string
          confidence?: number | null
          ai_reasoning?: string | null
          is_confirmed?: boolean
          created_at?: string
        }
        Relationships: []
      }
      scheduled_tasks: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          priority: number
          scheduled_for: string
          reminder_at: string | null
          is_recurring: boolean
          recurring_pattern: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          recurring_end_date: string | null
          project_id: string | null
          client_id: string | null
          blocker_id: string | null
          contact_id: string | null
          status: 'pending' | 'completed' | 'cancelled' | 'snoozed'
          completed_at: string | null
          snoozed_until: string | null
          auto_created: boolean
          creation_context: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          priority?: number
          scheduled_for: string
          reminder_at?: string | null
          is_recurring?: boolean
          recurring_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          recurring_end_date?: string | null
          project_id?: string | null
          client_id?: string | null
          blocker_id?: string | null
          contact_id?: string | null
          status?: 'pending' | 'completed' | 'cancelled' | 'snoozed'
          completed_at?: string | null
          snoozed_until?: string | null
          auto_created?: boolean
          creation_context?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          priority?: number
          scheduled_for?: string
          reminder_at?: string | null
          is_recurring?: boolean
          recurring_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
          recurring_end_date?: string | null
          project_id?: string | null
          client_id?: string | null
          blocker_id?: string | null
          contact_id?: string | null
          status?: 'pending' | 'completed' | 'cancelled' | 'snoozed'
          completed_at?: string | null
          snoozed_until?: string | null
          auto_created?: boolean
          creation_context?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          merchant_name: string
          normalized_name: string | null
          amount: number
          frequency: string
          billing_day: number | null
          status: string
          first_seen_at: string
          last_charged_at: string | null
          next_expected_at: string | null
          category_id: string | null
          notes: string | null
          is_essential: boolean
          cancellation_url: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          merchant_name: string
          normalized_name?: string | null
          amount: number
          frequency: string
          billing_day?: number | null
          status?: string
          first_seen_at: string
          last_charged_at?: string | null
          next_expected_at?: string | null
          category_id?: string | null
          notes?: string | null
          is_essential?: boolean
          cancellation_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          merchant_name?: string
          normalized_name?: string | null
          amount?: number
          frequency?: string
          billing_day?: number | null
          status?: string
          first_seen_at?: string
          last_charged_at?: string | null
          next_expected_at?: string | null
          category_id?: string | null
          notes?: string | null
          is_essential?: boolean
          cancellation_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      blockers: {
        Row: {
          id: string
          user_id: string
          project_id: string
          type: 'external_approval' | 'waiting_on_person' | 'waiting_on_client' | 'technical' | 'dependency'
          description: string
          waiting_since: string
          person: string | null
          person_contact_id: string | null
          person_notes: string | null
          follow_up_attempts: number
          last_follow_up: string | null
          missing_items: string[]
          resolved: boolean
          resolved_at: string | null
          resolution_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          type: 'external_approval' | 'waiting_on_person' | 'waiting_on_client' | 'technical' | 'dependency'
          description: string
          waiting_since?: string
          person?: string | null
          person_contact_id?: string | null
          person_notes?: string | null
          follow_up_attempts?: number
          last_follow_up?: string | null
          missing_items?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolution_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          type?: 'external_approval' | 'waiting_on_person' | 'waiting_on_client' | 'technical' | 'dependency'
          description?: string
          waiting_since?: string
          person?: string | null
          person_contact_id?: string | null
          person_notes?: string | null
          follow_up_attempts?: number
          last_follow_up?: string | null
          missing_items?: string[]
          resolved?: boolean
          resolved_at?: string | null
          resolution_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blockers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blockers_person_contact_id_fkey"
            columns: ["person_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          }
        ]
      }
      watch_triggers: {
        Row: {
          id: string
          user_id: string
          blocker_id: string
          source: 'email' | 'file' | 'calendar'
          from_contains: string | null
          subject_contains: string | null
          keywords: string[]
          on_trigger: 'notify' | 'draft_email' | 'mark_resolved'
          triggered: boolean
          triggered_at: string | null
          trigger_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          blocker_id: string
          source: 'email' | 'file' | 'calendar'
          from_contains?: string | null
          subject_contains?: string | null
          keywords?: string[]
          on_trigger?: 'notify' | 'draft_email' | 'mark_resolved'
          triggered?: boolean
          triggered_at?: string | null
          trigger_data?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          blocker_id?: string
          source?: 'email' | 'file' | 'calendar'
          from_contains?: string | null
          subject_contains?: string | null
          keywords?: string[]
          on_trigger?: 'notify' | 'draft_email' | 'mark_resolved'
          triggered?: boolean
          triggered_at?: string | null
          trigger_data?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          user_id: string
          client_id: string | null
          name: string
          email: string | null
          phone: string | null
          role: string | null
          company: string | null
          notes: string | null
          last_contacted_at: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          client_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          role?: string | null
          company?: string | null
          notes?: string | null
          last_contacted_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          role?: string | null
          company?: string | null
          notes?: string | null
          last_contacted_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      drive_files: {
        Row: {
          id: string
          user_id: string
          google_account_id: string | null
          drive_file_id: string
          drive_parent_folder_id: string | null
          name: string
          original_name: string | null
          mime_type: string | null
          extension: string | null
          size_bytes: number | null
          drive_created_time: string | null
          drive_modified_time: string | null
          indexed_at: string
          last_processed_at: string | null
          full_path: string | null
          zone: string | null
          extracted_text: string | null
          text_preview: string | null
          content_hash: string | null
          document_type: string | null
          confidence_score: number | null
          entities: Json
          summary: string | null
          suggested_name: string | null
          suggested_folder: string | null
          is_protected: boolean
          is_duplicate: boolean
          duplicate_of: string | null
          processing_status: string
          processing_error: string | null
          pending_actions: Json
          action_history: Json
          vector_id: string | null
          detected_people: string[]
          detected_projects: string[]
          suggested_path: string | null
          organization_confidence: number | null
          organization_status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          google_account_id?: string | null
          drive_file_id: string
          drive_parent_folder_id?: string | null
          name: string
          original_name?: string | null
          mime_type?: string | null
          extension?: string | null
          size_bytes?: number | null
          drive_created_time?: string | null
          drive_modified_time?: string | null
          indexed_at?: string
          last_processed_at?: string | null
          full_path?: string | null
          zone?: string | null
          extracted_text?: string | null
          text_preview?: string | null
          content_hash?: string | null
          document_type?: string | null
          confidence_score?: number | null
          entities?: Json
          summary?: string | null
          suggested_name?: string | null
          suggested_folder?: string | null
          is_protected?: boolean
          is_duplicate?: boolean
          duplicate_of?: string | null
          processing_status?: string
          processing_error?: string | null
          pending_actions?: Json
          action_history?: Json
          vector_id?: string | null
          detected_people?: string[]
          detected_projects?: string[]
          suggested_path?: string | null
          organization_confidence?: number | null
          organization_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          google_account_id?: string | null
          drive_file_id?: string
          drive_parent_folder_id?: string | null
          name?: string
          original_name?: string | null
          mime_type?: string | null
          extension?: string | null
          size_bytes?: number | null
          drive_created_time?: string | null
          drive_modified_time?: string | null
          indexed_at?: string
          last_processed_at?: string | null
          full_path?: string | null
          zone?: string | null
          extracted_text?: string | null
          text_preview?: string | null
          content_hash?: string | null
          document_type?: string | null
          confidence_score?: number | null
          entities?: Json
          summary?: string | null
          suggested_name?: string | null
          suggested_folder?: string | null
          is_protected?: boolean
          is_duplicate?: boolean
          duplicate_of?: string | null
          processing_status?: string
          processing_error?: string | null
          pending_actions?: Json
          action_history?: Json
          vector_id?: string | null
          detected_people?: string[]
          detected_projects?: string[]
          suggested_path?: string | null
          organization_confidence?: number | null
          organization_status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      drive_audit_log: {
        Row: {
          id: string
          user_id: string
          drive_file_id: string | null
          action: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          drive_file_id?: string | null
          action: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          drive_file_id?: string | null
          action?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      drive_file_embeddings: {
        Row: {
          id: string
          drive_file_id: string
          user_id: string
          chunk_index: number
          chunk_text: string
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: string
          drive_file_id: string
          user_id: string
          chunk_index: number
          chunk_text: string
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: string
          drive_file_id?: string
          user_id?: string
          chunk_index?: number
          chunk_text?: string
          embedding?: number[] | null
          created_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string | null
          phone: string | null
          company: string | null
          relationship: string
          name_aliases: string[]
          notes: string | null
          tags: string[]
          is_active: boolean
          metadata: Json
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email?: string | null
          phone?: string | null
          company?: string | null
          relationship?: string
          name_aliases?: string[]
          notes?: string | null
          tags?: string[]
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          company?: string | null
          relationship?: string
          name_aliases?: string[]
          notes?: string | null
          tags?: string[]
          is_active?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      follow_up_history: {
        Row: {
          id: string
          user_id: string
          blocker_id: string
          contact_id: string | null
          method: string
          notes: string | null
          email_thread_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          blocker_id: string
          contact_id?: string | null
          method?: string
          notes?: string | null
          email_thread_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          blocker_id?: string
          contact_id?: string | null
          method?: string
          notes?: string | null
          email_thread_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      briefing_history: {
        Row: {
          id: string
          user_id: string
          briefing_type: string
          project_id: string | null
          content: string
          items_count: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          briefing_type: string
          project_id?: string | null
          content: string
          items_count?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          briefing_type?: string
          project_id?: string | null
          content?: string
          items_count?: number | null
          created_at?: string
        }
        Relationships: []
      }
      file_associations: {
        Row: {
          id: string
          user_id: string
          drive_file_id: string
          person_id: string | null
          project_id: string | null
          association_type: string
          confidence: number | null
          context: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          drive_file_id: string
          person_id?: string | null
          project_id?: string | null
          association_type: string
          confidence?: number | null
          context?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          drive_file_id?: string
          person_id?: string | null
          project_id?: string | null
          association_type?: string
          confidence?: number | null
          context?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_associations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_associations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_associations_drive_file_id_fkey"
            columns: ["drive_file_id"]
            isOneToOne: false
            referencedRelation: "drive_files"
            referencedColumns: ["id"]
          }
        ]
      }
      project_members: {
        Row: {
          id: string
          user_id: string
          project_id: string
          person_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id: string
          person_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string
          person_id?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_documents: {
        Args: {
          query_embedding: number[]
          match_threshold?: number
          match_count?: number
          p_user_id?: string
        }
        Returns: {
          document_id: string
          chunk_text: string
          similarity: number
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

// Convenience types
type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

// Specific table types for common use
export type Profile = Tables<'profiles'>
export type BankAccount = Tables<'bank_accounts'>
export type Transaction = Tables<'transactions'>
export type TransactionCategory = Tables<'transaction_categories'>
export type Document = Tables<'documents'>
export type Client = Tables<'clients'>
export type ChatMessage = Tables<'chat_messages'>
export type GoogleOAuthToken = Tables<'google_oauth_tokens'>
export type GoogleAccount = Tables<'google_accounts'>
export type GmailWatchChannel = Tables<'gmail_watch_channels'>
export type DriveWatchChannel = Tables<'drive_watch_channels'>
export type ApiUsage = Tables<'api_usage'>
export type UserBudget = Tables<'user_budgets'>
export type AiMemory = Tables<'ai_memory'>
export type Project = Tables<'projects'>
export type ProjectFile = Tables<'project_files'>
