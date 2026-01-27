export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
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
      }
      document_embeddings: {
        Row: {
          id: string
          document_id: string
          user_id: string
          chunk_index: number
          chunk_text: string
          embedding: number[] | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          user_id: string
          chunk_index: number
          chunk_text: string
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          user_id?: string
          chunk_index?: number
          chunk_text?: string
          embedding?: number[] | null
          created_at?: string
        }
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
      }
      client_transactions: {
        Row: {
          id: string
          user_id: string
          client_id: string
          transaction_id: string
          attribution_type: string
          attribution_percentage: number
          attributed_amount: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          client_id: string
          transaction_id: string
          attribution_type: string
          attribution_percentage?: number
          attributed_amount: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          client_id?: string
          transaction_id?: string
          attribution_type?: string
          attribution_percentage?: number
          attributed_amount?: number
          notes?: string | null
          created_at?: string
        }
      }
      tax_categories: {
        Row: {
          id: string
          schedule_c_line: string
          name: string
          description: string | null
          example_expenses: string[] | null
          tax_year: number
          created_at: string
        }
        Insert: {
          id?: string
          schedule_c_line: string
          name: string
          description?: string | null
          example_expenses?: string[] | null
          tax_year: number
          created_at?: string
        }
        Update: {
          id?: string
          schedule_c_line?: string
          name?: string
          description?: string | null
          example_expenses?: string[] | null
          tax_year?: number
          created_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          user_id: string
          role: string
          content: string
          audio_url: string | null
          session_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          role: string
          content: string
          audio_url?: string | null
          session_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          role?: string
          content?: string
          audio_url?: string | null
          session_id?: string | null
          created_at?: string
        }
      }
      briefings: {
        Row: {
          id: string
          user_id: string
          date: string
          content: Json
          summary_text: string | null
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          content: Json
          summary_text?: string | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          content?: Json
          summary_text?: string | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
      }
      // Document Intelligence Module Tables
      drive_files: {
        Row: {
          id: string
          user_id: string
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
      }
      zones: {
        Row: {
          id: string
          user_id: string | null
          name: string
          display_name: string | null
          icon: string | null
          color: string | null
          apply_naming_convention: boolean
          auto_organize: string
          duplicate_merge: string
          confidence_threshold_auto: number
          confidence_threshold_suggest: number
          is_system: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          display_name?: string | null
          icon?: string | null
          color?: string | null
          apply_naming_convention?: boolean
          auto_organize?: string
          duplicate_merge?: string
          confidence_threshold_auto?: number
          confidence_threshold_suggest?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          display_name?: string | null
          icon?: string | null
          color?: string | null
          apply_naming_convention?: boolean
          auto_organize?: string
          duplicate_merge?: string
          confidence_threshold_auto?: number
          confidence_threshold_suggest?: number
          is_system?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      zone_folder_mappings: {
        Row: {
          id: string
          user_id: string
          zone_id: string
          folder_path: string
          folder_drive_id: string | null
          is_recursive: boolean
          priority: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          zone_id: string
          folder_path: string
          folder_drive_id?: string | null
          is_recursive?: boolean
          priority?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          zone_id?: string
          folder_path?: string
          folder_drive_id?: string | null
          is_recursive?: boolean
          priority?: number
          created_at?: string
        }
      }
      google_oauth_tokens: {
        Row: {
          id: string
          user_id: string
          access_token: string
          refresh_token: string
          token_type: string
          expires_at: string
          scopes: string[]
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
          scopes: string[]
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
          scopes?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      drive_pending_actions: {
        Row: {
          id: string
          user_id: string
          drive_file_id: string
          action_type: string
          action_params: Json
          confidence: number | null
          status: string
          requires_approval: boolean
          auto_revert_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          drive_file_id: string
          action_type: string
          action_params?: Json
          confidence?: number | null
          status?: string
          requires_approval?: boolean
          auto_revert_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          drive_file_id?: string
          action_type?: string
          action_params?: Json
          confidence?: number | null
          status?: string
          requires_approval?: boolean
          auto_revert_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          created_at?: string
        }
      }
      drive_audit_log: {
        Row: {
          id: string
          user_id: string
          drive_file_id: string | null
          action: string
          action_params: Json | null
          before_state: Json | null
          after_state: Json | null
          confidence: number | null
          triggered_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          drive_file_id?: string | null
          action: string
          action_params?: Json | null
          before_state?: Json | null
          after_state?: Json | null
          confidence?: number | null
          triggered_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          drive_file_id?: string | null
          action?: string
          action_params?: Json | null
          before_state?: Json | null
          after_state?: Json | null
          confidence?: number | null
          triggered_by?: string | null
          created_at?: string
        }
      }
      // Intelligent Organization Tables
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
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          keywords: string[]
          base_folder_path: string | null
          status: string
          auto_organize: boolean
          start_date: string | null
          end_date: string | null
          metadata: Json
          tags: string[]
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          keywords?: string[]
          base_folder_path?: string | null
          status?: string
          auto_organize?: boolean
          start_date?: string | null
          end_date?: string | null
          metadata?: Json
          tags?: string[]
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          keywords?: string[]
          base_folder_path?: string | null
          status?: string
          auto_organize?: boolean
          start_date?: string | null
          end_date?: string | null
          metadata?: Json
          tags?: string[]
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
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
      }
      api_usage: {
        Row: {
          id: string
          user_id: string
          api_provider: string
          api_endpoint: string
          model: string | null
          input_tokens: number
          output_tokens: number
          audio_seconds: number
          api_calls: number
          cost_usd: number
          request_type: string | null
          success: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          api_provider: string
          api_endpoint: string
          model?: string | null
          input_tokens?: number
          output_tokens?: number
          audio_seconds?: number
          api_calls?: number
          cost_usd?: number
          request_type?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          api_provider?: string
          api_endpoint?: string
          model?: string | null
          input_tokens?: number
          output_tokens?: number
          audio_seconds?: number
          api_calls?: number
          cost_usd?: number
          request_type?: string | null
          success?: boolean
          error_message?: string | null
          created_at?: string
        }
      }
      budget_settings: {
        Row: {
          id: string
          user_id: string
          monthly_budget_usd: number
          soft_limit_percent: number
          hard_limit_enabled: boolean
          daily_limit_usd: number
          max_requests_per_minute: number
          max_requests_per_hour: number
          provider_limits: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          monthly_budget_usd?: number
          soft_limit_percent?: number
          hard_limit_enabled?: boolean
          daily_limit_usd?: number
          max_requests_per_minute?: number
          max_requests_per_hour?: number
          provider_limits?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          monthly_budget_usd?: number
          soft_limit_percent?: number
          hard_limit_enabled?: boolean
          daily_limit_usd?: number
          max_requests_per_minute?: number
          max_requests_per_hour?: number
          provider_limits?: Json
          created_at?: string
          updated_at?: string
        }
      }
      rate_limits: {
        Row: {
          id: string
          user_id: string
          window_start: string
          window_type: string
          request_count: number
          total_cost_usd: number
        }
        Insert: {
          id?: string
          user_id: string
          window_start: string
          window_type: string
          request_count?: number
          total_cost_usd?: number
        }
        Update: {
          id?: string
          user_id?: string
          window_start?: string
          window_type?: string
          request_count?: number
          total_cost_usd?: number
        }
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
      calculate_client_pnl: {
        Args: {
          p_client_id: string
        }
        Returns: {
          total_revenue: number
          total_expenses: number
          net_profit: number
          profit_margin: number
        }[]
      }
      get_monthly_usage: {
        Args: {
          p_user_id: string
        }
        Returns: {
          total_cost: number
          provider_breakdown: Json
          request_count: number
        }[]
      }
      get_daily_usage: {
        Args: {
          p_user_id: string
        }
        Returns: {
          total_cost: number
          request_count: number
        }[]
      }
      check_api_allowance: {
        Args: {
          p_user_id: string
          p_estimated_cost?: number
        }
        Returns: {
          allowed: boolean
          reason: string | null
          current_usage: number
          budget_limit: number
          usage_percent: number
        }[]
      }
      increment_rate_limit: {
        Args: {
          p_user_id: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
