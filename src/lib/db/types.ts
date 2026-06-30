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
      tv_boards: {
        Row: {
          id: string;
          brand: string;
          model: string;
          board_type: "fuente" | "main" | "tcom" | "placa_unica";
          listed_price: number;
          is_active: boolean;
          sold_at: string | null;
          mercado_libre_net_amount: number | null;
          release_date: string | null;
          sale_notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand: string;
          model: string;
          board_type: "fuente" | "main" | "tcom" | "placa_unica";
          listed_price: number;
          is_active?: boolean;
          sold_at?: string | null;
          mercado_libre_net_amount?: number | null;
          release_date?: string | null;
          sale_notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          brand?: string;
          model?: string;
          board_type?: "fuente" | "main" | "tcom" | "placa_unica";
          listed_price?: number;
          is_active?: boolean;
          sold_at?: string | null;
          mercado_libre_net_amount?: number | null;
          release_date?: string | null;
          sale_notes?: string | null;
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
      salary_withdrawals: {
        Row: {
          id: string;
          withdrawal_date: string;
          amount: number;
          payment_method: "efectivo" | "nx" | "mp";
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          withdrawal_date: string;
          amount: number;
          payment_method: "efectivo" | "nx" | "mp";
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          withdrawal_date?: string;
          amount?: number;
          payment_method?: "efectivo" | "nx" | "mp";
          notes?: string | null;
        };
      };
      installment_sales: {
        Row: {
          id: string;
          product_name: string;
          customer_name: string;
          total_amount: number;
          installments_count: number;
          notes: string | null;
          status: "activa" | "finalizada" | "cancelada";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_name: string;
          customer_name: string;
          total_amount: number;
          installments_count: number;
          notes?: string | null;
          status?: "activa" | "finalizada" | "cancelada";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          product_name?: string;
          customer_name?: string;
          total_amount?: number;
          installments_count?: number;
          notes?: string | null;
          status?: "activa" | "finalizada" | "cancelada";
          updated_at?: string;
        };
      };
      installments: {
        Row: {
          id: string;
          installment_sale_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          payment_method: "efectivo" | "nx" | "mp";
          status: "pendiente" | "pagada" | "vencida" | "cancelada";
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          installment_sale_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          payment_method: "efectivo" | "nx" | "mp";
          status?: "pendiente" | "pagada" | "vencida" | "cancelada";
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          due_date?: string;
          amount?: number;
          payment_method?: "efectivo" | "nx" | "mp";
          status?: "pendiente" | "pagada" | "vencida" | "cancelada";
          paid_at?: string | null;
          notes?: string | null;
          updated_at?: string;
        };
      };
      repairs: {
        Row: {
          id: string;
          repair_access_order_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          device: string;
          order_number: string | null;
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
          repair_access_order_id?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          device: string;
          order_number?: string | null;
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
          repair_access_order_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          device?: string;
          order_number?: string | null;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          repair_id: string;
          payment_date?: string;
          method: string;
          amount: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          method?: string;
          amount?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      repair_access_customers: {
        Row: {
          id: string;
          full_name: string;
          full_name_normalized: string | null;
          phone: string | null;
          alternate_phone: string | null;
          phone_normalized: string | null;
          alternate_phone_normalized: string | null;
          dni: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          source: string;
          last_imported_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          full_name_normalized?: string | null;
          phone?: string | null;
          alternate_phone?: string | null;
          phone_normalized?: string | null;
          alternate_phone_normalized?: string | null;
          dni?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          source?: string;
          last_imported_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          full_name_normalized?: string | null;
          phone?: string | null;
          alternate_phone?: string | null;
          phone_normalized?: string | null;
          alternate_phone_normalized?: string | null;
          dni?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          source?: string;
          last_imported_at?: string | null;
          updated_at?: string;
        };
      };
      repair_access_devices: {
        Row: {
          id: string;
          customer_id: string;
          device_type: string;
          brand: string | null;
          model: string | null;
          serial_number: string | null;
          accessory_details: string | null;
          visual_condition: string | null;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          device_type: string;
          brand?: string | null;
          model?: string | null;
          serial_number?: string | null;
          accessory_details?: string | null;
          visual_condition?: string | null;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_id?: string;
          device_type?: string;
          brand?: string | null;
          model?: string | null;
          serial_number?: string | null;
          accessory_details?: string | null;
          visual_condition?: string | null;
          notes?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
      };
      repair_access_orders: {
        Row: {
          id: string;
          repair_number: string | null;
          customer_id: string;
          device_id: string;
          intake_date: string;
          issue_reported: string;
          technical_diagnosis: string | null;
          repair_progress: string | null;
          budget_detail: string | null;
          budget_response_notes: string | null;
          budget_response_at: string | null;
          technician_name: string | null;
          technician_id: string | null;
          budget_amount: number | null;
          approved_amount: number | null;
          final_amount: number | null;
          payment_method: string | null;
          payment_notes: string | null;
          is_paid: boolean;
          paid_at: string | null;
          delivered_at: string | null;
          picked_up_at: string | null;
          warranty_days: number;
          warranty_start: string | null;
          warranty_until: string | null;
          warranty_conditions: string | null;
          warranty_active: boolean;
          notes: string | null;
          priority: string | null;
          work_performed: string | null;
          used_parts: string | null;
          internal_observations: string | null;
          reviewed_at: string | null;
          budgeted_at: string | null;
          approved_at: string | null;
          repair_started_at: string | null;
          finished_at: string | null;
          status:
            | "pendiente_revision"
            | "en_revision"
            | "presupuestado"
            | "presupuestado_aceptado"
            | "presupuestado_rechazado"
            | "listo_para_retirar"
            | "retirado"
            | "sin_solucion";
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          repair_number?: string | null;
          customer_id: string;
          device_id: string;
          intake_date?: string;
          issue_reported: string;
          technical_diagnosis?: string | null;
          repair_progress?: string | null;
          budget_detail?: string | null;
          budget_response_notes?: string | null;
          budget_response_at?: string | null;
          technician_name?: string | null;
          technician_id?: string | null;
          budget_amount?: number | null;
          approved_amount?: number | null;
          final_amount?: number | null;
          payment_method?: string | null;
          payment_notes?: string | null;
          is_paid?: boolean;
          paid_at?: string | null;
          delivered_at?: string | null;
          picked_up_at?: string | null;
          warranty_days?: number;
          warranty_start?: string | null;
          warranty_until?: string | null;
          warranty_conditions?: string | null;
          warranty_active?: boolean;
          notes?: string | null;
          priority?: string | null;
          work_performed?: string | null;
          used_parts?: string | null;
          internal_observations?: string | null;
          reviewed_at?: string | null;
          budgeted_at?: string | null;
          approved_at?: string | null;
          repair_started_at?: string | null;
          finished_at?: string | null;
          status?: Database["public"]["Tables"]["repair_access_orders"]["Row"]["status"];
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          repair_number?: string | null;
          customer_id?: string;
          device_id?: string;
          intake_date?: string;
          issue_reported?: string;
          technical_diagnosis?: string | null;
          repair_progress?: string | null;
          budget_detail?: string | null;
          budget_response_notes?: string | null;
          budget_response_at?: string | null;
          technician_name?: string | null;
          technician_id?: string | null;
          budget_amount?: number | null;
          approved_amount?: number | null;
          final_amount?: number | null;
          payment_method?: string | null;
          payment_notes?: string | null;
          is_paid?: boolean;
          paid_at?: string | null;
          delivered_at?: string | null;
          picked_up_at?: string | null;
          warranty_days?: number;
          warranty_start?: string | null;
          warranty_until?: string | null;
          warranty_conditions?: string | null;
          warranty_active?: boolean;
          notes?: string | null;
          priority?: string | null;
          work_performed?: string | null;
          used_parts?: string | null;
          internal_observations?: string | null;
          reviewed_at?: string | null;
          budgeted_at?: string | null;
          approved_at?: string | null;
          repair_started_at?: string | null;
          finished_at?: string | null;
          status?: Database["public"]["Tables"]["repair_access_orders"]["Row"]["status"];
          updated_by?: string | null;
          updated_at?: string;
        };
      };
      repair_access_status_history: {
        Row: {
          id: string;
          repair_order_id: string;
          previous_status: string | null;
          next_status: Database["public"]["Tables"]["repair_access_orders"]["Row"]["status"];
          changed_by: string | null;
          notes: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          repair_order_id: string;
          previous_status?: string | null;
          next_status: Database["public"]["Tables"]["repair_access_orders"]["Row"]["status"];
          changed_by?: string | null;
          notes?: string | null;
          changed_at?: string;
        };
        Update: {
          previous_status?: string | null;
          next_status?: Database["public"]["Tables"]["repair_access_orders"]["Row"]["status"];
          changed_by?: string | null;
          notes?: string | null;
        };
      };
      repair_access_payments: {
        Row: {
          id: string;
          repair_order_id: string;
          payment_date: string;
          method: string;
          amount: number;
          notes: string | null;
          legacy_repair_payment_id: string | null;
          voided_at: string | null;
          void_reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          repair_order_id: string;
          payment_date?: string;
          method: string;
          amount: number;
          notes?: string | null;
          legacy_repair_payment_id?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          payment_date?: string;
          method?: string;
          amount?: number;
          notes?: string | null;
          legacy_repair_payment_id?: string | null;
          voided_at?: string | null;
          void_reason?: string | null;
        };
      };
      balance_transfers: {
        Row: {
          id: string;
          from_payment_method: "efectivo" | "nx_santi" | "nx_local";
          to_payment_method: "efectivo" | "nx_santi" | "nx_local";
          amount: number;
          description: string | null;
          transfer_date: string;
          is_voided: boolean;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          reversal_transfer_id: string | null;
          reversal_of_transfer_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          from_payment_method: "efectivo" | "nx_santi" | "nx_local";
          to_payment_method: "efectivo" | "nx_santi" | "nx_local";
          amount: number;
          description?: string | null;
          transfer_date?: string;
          is_voided?: boolean;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          reversal_transfer_id?: string | null;
          reversal_of_transfer_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          from_payment_method?: "efectivo" | "nx_santi" | "nx_local";
          to_payment_method?: "efectivo" | "nx_santi" | "nx_local";
          amount?: number;
          description?: string | null;
          transfer_date?: string;
          is_voided?: boolean;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          reversal_transfer_id?: string | null;
          reversal_of_transfer_id?: string | null;
          updated_at?: string;
        };
      };
      repair_access_import_batches: {
        Row: {
          id: string;
          source: string;
          file_name: string;
          total_rows: number;
          imported_count: number;
          updated_count: number;
          duplicate_count: number;
          error_count: number;
          summary: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source?: string;
          file_name: string;
          total_rows?: number;
          imported_count?: number;
          updated_count?: number;
          duplicate_count?: number;
          error_count?: number;
          summary?: Json;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          total_rows?: number;
          imported_count?: number;
          updated_count?: number;
          duplicate_count?: number;
          error_count?: number;
          summary?: Json;
        };
      };
      repair_access_import_rows: {
        Row: {
          id: string;
          batch_id: string;
          row_number: number;
          raw_data: Json;
          normalized_phone: string | null;
          customer_id: string | null;
          status: "imported" | "updated" | "duplicate_ignored" | "error";
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          row_number: number;
          raw_data?: Json;
          normalized_phone?: string | null;
          customer_id?: string | null;
          status: "imported" | "updated" | "duplicate_ignored" | "error";
          message?: string | null;
          created_at?: string;
        };
        Update: {
          customer_id?: string | null;
          status?: "imported" | "updated" | "duplicate_ignored" | "error";
          message?: string | null;
        };
      };
      repair_access_budgets: {
        Row: {
          id: string;
          repair_order_id: string;
          amount: number;
          work_description: string;
          required_parts: string | null;
          notes: string | null;
          status: "pendiente" | "enviado_al_cliente" | "aprobado" | "rechazado" | "vencido";
          budgeted_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          repair_order_id: string;
          amount: number;
          work_description: string;
          required_parts?: string | null;
          notes?: string | null;
          status?: "pendiente" | "enviado_al_cliente" | "aprobado" | "rechazado" | "vencido";
          budgeted_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          work_description?: string;
          required_parts?: string | null;
          notes?: string | null;
          status?: "pendiente" | "enviado_al_cliente" | "aprobado" | "rechazado" | "vencido";
          updated_at?: string;
        };
      };
      repair_outsourcings: {
        Row: {
          id: string;
          repair_access_order_id: string;
          workshop_name: string;
          sent_at: string;
          retrieved_at: string | null;
          status: "en_taller" | "retirado" | "cancelado";
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          repair_access_order_id: string;
          workshop_name: string;
          sent_at?: string;
          retrieved_at?: string | null;
          status?: "en_taller" | "retirado" | "cancelado";
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          repair_access_order_id?: string;
          workshop_name?: string;
          sent_at?: string;
          retrieved_at?: string | null;
          status?: "en_taller" | "retirado" | "cancelado";
          notes?: string | null;
          updated_by?: string | null;
          updated_at?: string;
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
