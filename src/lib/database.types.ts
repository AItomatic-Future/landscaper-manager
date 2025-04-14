export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: 'user' | 'project_manager' | 'Team_Leader' | 'Admin' | 'boss';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: 'user' | 'project_manager' | 'Team_Leader' | 'Admin' | 'boss';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: 'user' | 'project_manager' | 'Team_Leader' | 'Admin' | 'boss';
          created_at?: string;
          updated_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          title: string;
          description: string;
          start_date: string;
          end_date: string;
          status: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment: boolean;
          has_materials: boolean;
          project_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          start_date: string;
          end_date: string;
          status?: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment?: boolean;
          has_materials?: boolean;
          project_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          start_date?: string;
          end_date?: string;
          status?: 'planned' | 'scheduled' | 'in_progress' | 'finished';
          has_equipment?: boolean;
          has_materials?: boolean;
          project_id?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      hours_worked: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          hours: number;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          hours: number;
          date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          hours?: number;
          date?: string;
          created_at?: string;
        };
      };
      tasks_done: {
        Row: {
          id: string;
          event_id: string;
          user_id: string;
          amount: string;
          hours_worked: number;
          is_finished: boolean;
          created_at: string;
          unit: string | null;
          name: string | null;
          description: string | null;
        };
        Insert: {
          id?: string;
          event_id: string;
          user_id: string;
          amount: string;
          hours_worked: number;
          is_finished?: boolean;
          created_at?: string;
          unit?: string | null;
          name?: string | null;
          description?: string | null;
        };
        Update: {
          id?: string;
          event_id?: string;
          user_id?: string;
          amount?: string;
          hours_worked?: number;
          is_finished?: boolean;
          created_at?: string;
          unit?: string | null;
          name?: string | null;
          description?: string | null;
        };
      };
      materials_delivered: {
        Row: {
          id: string;
          event_id: string;
          amount: number;
          unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          amount: number;
          unit: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          amount?: number;
          unit?: string;
          created_at?: string;
        };
      };
      event_tasks: {
        Row: {
          id: string;
          name: string;
          description: string;
          unit: string;
          estimated_hours: number;
          event_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          unit: string;
          estimated_hours: number;
          event_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          unit?: string;
          estimated_hours?: number;
          event_id?: string;
          created_at?: string;
        };
      };
      event_tasks_with_dynamic_estimates: {
        Row: {
          id: string;
          name: string;
          description: string;
          unit: string;
          estimated_hours: number;
          event_id: string;
          created_at: string;
          calculated_estimated_hours: number;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          unit: string;
          estimated_hours: number;
          event_id: string;
          created_at?: string;
          calculated_estimated_hours?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          unit?: string;
          estimated_hours?: number;
          event_id?: string;
          created_at?: string;
          calculated_estimated_hours?: number;
        };
      };
    };
  };
}
