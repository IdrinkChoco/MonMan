import { supabase } from "../config/supabase.js";

export const assetService = {
  // 1. Ambil semua Aset & Liabilitas milik user aktif
  async getAssetsAndLiabilities() {
    const { data, error } = await supabase
      .from("assets_liabilities")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // 2. Buat Aset/Liabilitas Baru (Lengkap dengan user_id untuk RLS)
  async createAssetOrLiability(assetData) {
    // Ambil user ID aktif
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Pengguna belum terautentikasi.");

    // Masukkan user_id ke dalam payload
    const payload = {
      ...assetData,
      user_id: user.id,
    };

    const { data, error } = await supabase
      .from("assets_liabilities")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // 3. Hapus Aset/Liabilitas
  async deleteAssetOrLiability(id) {
    const { error } = await supabase
      .from("assets_liabilities")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },
};
