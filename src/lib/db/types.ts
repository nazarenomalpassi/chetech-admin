export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "admin" | "empleado";
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "admin" | "empleado";
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          role?: "admin" | "empleado";
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sku_prefix: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sku_prefix?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          sku_prefix?: string | null;
        };
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          category_id: string | null;
          cost: number;
          sale_price: number;
          stock: number;
          min_stock: number;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          category_id?: string | null;
          cost?: number;
          sale_price?: number;
          stock?: number;
          min_stock?: number;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          sku?: string;
          name?: string;
          category_id?: string | null;
          cost?: number;
          sale_price?: number;
          stock?: number;
          min_stock?: number;
          is_active?: boolean;
          notes?: string | null;
          updated_at?: string;
        };
      };
      sales: {
        Row: {
          id: string;
          sale_number: string;
          subtotal: number;
          cost_total: number;
          profit_total: number;
          notes: string | null;
          sold_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_number: string;
          subtotal: number;
          cost_total: number;
          profit_total: number;
          notes?: string | null;
          sold_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          subtotal?: number;
          cost_total?: number;
          profit_total?: number;
          notes?: string | null;
        };
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          unit_cost: number;
          total: number;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          unit_cost: number;
          total: number;
        };
        Update: {
          quantity?: number;
          unit_price?: number;
          unit_cost?: number;
          total?: number;
        };
      };
      sale_payments: {
        Row: {
          id: string;
          sale_id: string;
          method: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          method: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          method?: string;
          amount?: number;
        };
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          type: string;
          description: string;
          amount: number;
          payment_method: string;
          impacts_cash: boolean;
          observations: string | null;
          is_voided: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_date: string;
          type: string;
          description: string;
          amount: number;
          payment_method: string;
          impacts_cash?: boolean;
          observations?: string | null;
          is_voided?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          expense_date?: string;
          type?: string;
          description?: string;
          amount?: number;
          payment_method?: string;
          impacts_cash?: boolean;
          observations?: string | null;
          is_voided?: boolean;
        };
      };
      repairs: {
        Row: {
          id: string;
          customer_name: string;
          customer_phone: string | null;
          device: string;
          brand: string | null;
          model: string | null;
          issue_description: string;
          diagnosis: string | null;
          estimated_price: number | null;
          final_price: number | null;
          internal_cost: number | null;
          observations: string | null;
          status:
            | "ingresado"
            | "en_diagnostico"
            | "esperando_repuestos"
            | "en_reparacion"
            | "listo"
            | "entregado"
            | "cancelado";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_name: string;
          customer_phone?: string | null;
          device: string;
          brand?: string | null;
          model?: string | null;
          issue_description: string;
          diagnosis?: string | null;
          estimated_price?: number | null;
          final_price?: number | null;
          internal_cost?: number | null;
          observations?: string | null;
          status?: Database["public"]["Tables"]["repairs"]["Row"]["status"];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_name?: string;
          customer_phone?: string | null;
          device?: string;
          brand?: string | null;
          model?: string | null;
          issue_description?: string;
          diagnosis?: string | null;
          estimated_price?: number | null;
          final_price?: number | null;
          internal_cost?: number | null;
          observations?: string | null;
          status?: Database["public"]["Tables"]["repairs"]["Row"]["status"];
          updated_at?: string;
        };
      };
      repair_payments: {
        Row: {
          id: string;
          repair_id: string;
          payment_date: string;
          method: string;
          amount: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          repair_id: string;
          payment_date?: string;
          method: string;
          amount: number;
          notes?: string | null;
        };
        Update: {
          method?: string;
          amount?: number;
          notes?: string | null;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          product_id: string;
          movement_type: "sale" | "adjustment" | "purchase" | "import";
          quantity: number;
          reference_id: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          movement_type: "sale" | "adjustment" | "purchase" | "import";
          quantity: number;
          reference_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          notes?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          action: "insert" | "update" | "delete";
          changes: Json;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: string;
          entity_id: string;
          action: "insert" | "update" | "delete";
          changes?: Json;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          changes?: Json;
        };
      };
    };
  };
};
