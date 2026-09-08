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
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      drafts: {
        Row: {
          attachments: Json
          char_count: number
          content: string
          created_at: string
          id: string
          images: string[]
          media_bytes: number
          published: boolean
          raw_input: string
          schedule_error: string | null
          schedule_status: string
          scheduled_at: string | null
          team_id: string | null
          title: string
          tone: string
          updated_at: string
          user_id: string
          videos: Json
        }
        Insert: {
          attachments?: Json
          char_count?: number
          content?: string
          created_at?: string
          id?: string
          images?: string[]
          media_bytes?: number
          published?: boolean
          raw_input?: string
          schedule_error?: string | null
          schedule_status?: string
          scheduled_at?: string | null
          team_id?: string | null
          title?: string
          tone?: string
          updated_at?: string
          user_id: string
          videos?: Json
        }
        Update: {
          attachments?: Json
          char_count?: number
          content?: string
          created_at?: string
          id?: string
          images?: string[]
          media_bytes?: number
          published?: boolean
          raw_input?: string
          schedule_error?: string | null
          schedule_status?: string
          scheduled_at?: string | null
          team_id?: string | null
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
          videos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "drafts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          linkedin_member_urn: string
          linkedin_name: string | null
          linkedin_picture_url: string | null
          refresh_token: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          linkedin_member_urn: string
          linkedin_name?: string | null
          linkedin_picture_url?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          linkedin_member_urn?: string
          linkedin_name?: string | null
          linkedin_picture_url?: string | null
          refresh_token?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      linkedin_oauth_states: {
        Row: {
          created_at: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
          voice_notes: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          voice_notes?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          voice_notes?: string | null
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          access_level: Database["public"]["Enums"]["project_access_level"]
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          project_id: string
          status: Database["public"]["Enums"]["invite_status"]
          team_id: string | null
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["invite_status"]
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "my_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          accepted_at: string | null
          access_level: Database["public"]["Enums"]["project_access_level"]
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          status: Database["public"]["Enums"]["grant_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "my_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_team_access: {
        Row: {
          accepted_at: string | null
          access_level: Database["public"]["Enums"]["project_access_level"]
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          status: Database["public"]["Enums"]["grant_status"]
          team_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["grant_status"]
          team_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_level?: Database["public"]["Enums"]["project_access_level"]
          created_at?: string
          id?: string
          invited_by?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["grant_status"]
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_team_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "my_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_team_access_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "my_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          polar_customer_id: string | null
          polar_product_id: string | null
          polar_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          accepted_at: string | null
          email: string
          id: string
          invited_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          email: string
          id?: string
          invited_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          email?: string
          id?: string
          invited_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          daily_credits_used: number
          last_daily_reset: string
          last_monthly_reset: string
          subscription_credits: number
          topup_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_credits_used?: number
          last_daily_reset?: string
          last_monthly_reset?: string
          subscription_credits?: number
          topup_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_credits_used?: number
          last_daily_reset?: string
          last_monthly_reset?: string
          subscription_credits?: number
          topup_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string
          display_name: string | null
          project_name: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          updated_at: string
          user_id: string
          workspace_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          project_name?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          updated_at?: string
          user_id: string
          workspace_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          display_name?: string | null
          project_name?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          updated_at?: string
          user_id?: string
          workspace_name?: string | null
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
      user_storage: {
        Row: {
          bytes_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bytes_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["invite_status"]
          team_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          team_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          team_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "my_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["grant_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["grant_status"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "my_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_team_access: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["grant_status"]
          team_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["grant_status"]
          team_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["grant_status"]
          team_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_team_access_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_team_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "my_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_team_access_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_projects: {
        Row: {
          access_source: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
          status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          access_source?: never
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          access_source?: never
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "my_workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      my_workspaces: {
        Row: {
          access_source: string | null
          created_at: string | null
          id: string | null
          name: string | null
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          access_source?: never
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          access_source?: never
          created_at?: string | null
          id?: string | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_project_invite: {
        Args: { p_invite_id: string }
        Returns: {
          accepted_at: string | null
          access_level: Database["public"]["Enums"]["project_access_level"]
          created_at: string
          id: string
          invited_by: string | null
          project_id: string
          status: Database["public"]["Enums"]["grant_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "project_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_workspace_invite: {
        Args: { p_invite_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["grant_status"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_manage_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      cleanup_linkedin_oauth_states: { Args: never; Returns: undefined }
      complete_user_onboarding: {
        Args: {
          p_display_name?: string
          p_project_name?: string
          p_workspace_name?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          display_name: string | null
          project_name: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          updated_at: string
          user_id: string
          workspace_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_onboarding"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_credit: { Args: { _user_id: string }; Returns: Json }
      expire_linkedin_connections: { Args: never; Returns: number }
      get_post_signup_context: { Args: never; Returns: Json }
      get_team_role: {
        Args: { _team_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      get_user_plan: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["plan_tier"]
      }
      grant_subscription_credits: {
        Args: { _amount: number; _reason: string; _user_id: string }
        Returns: undefined
      }
      grant_topup_credits: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      handle_plan_change: {
        Args: {
          _new_plan: Database["public"]["Enums"]["plan_tier"]
          _old_plan: Database["public"]["Enums"]["plan_tier"]
          _user_id: string
        }
        Returns: undefined
      }
      has_project_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_access: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      refund_credit: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      reset_daily_credits: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      grant_status: "active" | "inactive" | "revoked"
      invite_status: "pending" | "accepted" | "declined" | "revoked" | "expired"
      onboarding_status: "pending" | "in_progress" | "complete"
      plan_tier: "trial" | "studio" | "teams"
      project_access_level: "owner" | "admin" | "editor" | "viewer"
      subscription_status:
        | "active"
        | "canceled"
        | "past_due"
        | "expired"
        | "trialing"
      team_role: "owner" | "editor" | "viewer"
      workspace_role: "owner" | "admin" | "member"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
      grant_status: ["active", "inactive", "revoked"],
      invite_status: ["pending", "accepted", "declined", "revoked", "expired"],
      onboarding_status: ["pending", "in_progress", "complete"],
      plan_tier: ["trial", "studio", "teams"],
      project_access_level: ["owner", "admin", "editor", "viewer"],
      subscription_status: [
        "active",
        "canceled",
        "past_due",
        "expired",
        "trialing",
      ],
      team_role: ["owner", "editor", "viewer"],
      workspace_role: ["owner", "admin", "member"],
    },
  },
} as const
