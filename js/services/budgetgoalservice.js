import { supabase } from "../config/supabase.js";

export const budgetGoalService = {
  // 1. Update Budget Limit Kategori
  async updateCategoryBudget(categoryId, budgetLimit) {
    const { data, error } = await supabase
      .from("categories")
      .update({ budget_limit: budgetLimit })
      .eq("id", categoryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 2. Ambil Daftar Savings Goals
  async getSavingsGoals() {
    const { data, error } = await supabase
      .from("savings_goals")
      .select("*, assets_liabilities(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // 3. Buat Target Tabungan Baru (dengan inject user_id)
  async createSavingsGoal(goalData) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Pengguna belum terautentikasi.");

    const { data, error } = await supabase
      .from("savings_goals")
      .insert([{ ...goalData, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 4. Tambah Saldo ke Target Tabungan
  async addProgressToGoal(goalId, addedAmount) {
    const { data: goal, error: fetchErr } = await supabase
      .from("savings_goals")
      .select("current_amount")
      .eq("id", goalId)
      .single();

    if (fetchErr || !goal) throw new Error("Target tabungan tidak ditemukan");

    const newAmount = Number(goal.current_amount) + Number(addedAmount);

    const { data, error } = await supabase
      .from("savings_goals")
      .update({ current_amount: newAmount })
      .eq("id", goalId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 5. Hapus Target Tabungan
  async deleteSavingsGoal(id) {
    const { error } = await supabase
      .from("savings_goals")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};
