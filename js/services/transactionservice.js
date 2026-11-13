import { supabase } from '../config/supabase.js';

export const transactionService = {
  // 1. Ambil Kategori
  async getCategories(type) {
    const { data: { user } } = await supabase.auth.getUser();
    
    let query = supabase.from('categories').select('*').order('name', { ascending: true });
    
    if (user) {
      query = query.or(`user_id.eq.${user.id},user_id.is.null`);
    }

    if (type) {
      query = query.eq('type', type);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // 2. Buat Kategori Baru (Dengan inject user_id)
  async createCategory(name, type) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pengguna belum terautentikasi.');

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, type, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },
  
  // 2a. Tambah fungsi edit Kategori
  // [TAMBAHAN MODUL KATEGORI] Update Kategori
  async updateCategory(categoryId, newName, newType) {
    const { data, error } = await supabase
      .from('categories')
      .update({ name: newName, type: newType })
      .eq('id', categoryId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // [TAMBAHAN MODUL KATEGORI] Hapus Kategori
  async deleteCategory(categoryId) {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);
    if (error) throw error;
  },

  // 3. Ambil Transaksi (Beserta relasi Akun & Kategori)
  async getTransactions({ startDate, endDate }) {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        categories ( name, icon ),
        assets_liabilities ( id, name, type ),
        transaction_tags (
          tags ( id, name )
        )
      `)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // 4. Helper Tag Otomatis
  async getOrCreateTag(tagName) {
    const cleanName = tagName.trim().toLowerCase().replace(/^#/, '');
    if (!cleanName) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pengguna belum terautentikasi.');

    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('name', cleanName)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingTag) return existingTag.id;

    const { data: newTag, error } = await supabase
      .from('tags')
      .insert([{ name: cleanName, user_id: user.id }])
      .select('id')
      .single();

    if (error) throw error;
    return newTag.id;
  },

  // 5. Simpan Transaksi Baru + AUTO-UPDATE SALDO ASET/LIABILITAS
  async createTransaction(transactionData, tagNamesArray = []) {
    const { data: newTransaction, error: txError } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select()
      .single();

    if (txError) throw txError;

    // Loop tag dibungkus try/catch agar jika RLS/Policy tag gagal, 
    // transaksi utama dan update saldo tetap berjalan lancar tanpa membatalkan seluruh proses.
    if (tagNamesArray.length > 0) {
      for (const tagName of tagNamesArray) {
        try {
          const tagId = await this.getOrCreateTag(tagName);
          if (tagId) {
            await supabase.from('transaction_tags').insert([
              { transaction_id: newTransaction.id, tag_id: tagId }
            ]);
          }
        } catch (e) {
          console.error('Gagal menyimpan tag:', tagName, e);
        }
      }
    }

    if (transactionData.account_id) {
      await this.adjustAccountBalance(
        transactionData.account_id, 
        transactionData.amount, 
        transactionData.type
      );
    }

    return newTransaction;
  },

  // 6. Hapus Transaksi + ROLLBACK SALDO
  async deleteTransaction(id) {
    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (tx && tx.account_id) {
      const reverseType = tx.type === 'income' ? 'expense' : 'income';
      await this.adjustAccountBalance(tx.account_id, tx.amount, reverseType);
    }

    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },

  // 7. Helper Adjust Balance Aset/Liabilitas
  async adjustAccountBalance(accountId, amount, transactionType) {
    const { data: account, error: fetchErr } = await supabase
      .from('assets_liabilities')
      .select('*')
      .eq('id', accountId)
      .single();

    if (fetchErr || !account) return;

    let currentBalance = Number(account.amount);
    let newBalance = currentBalance;
    const numAmount = Number(amount);

    if (account.type === 'asset') {
      newBalance = transactionType === 'income' 
        ? currentBalance + numAmount 
        : currentBalance - numAmount;
    } else if (account.type === 'liability') {
      newBalance = transactionType === 'expense' 
        ? currentBalance - numAmount 
        : currentBalance + numAmount;
    }

    await supabase
      .from('assets_liabilities')
      .update({ amount: Math.max(0, newBalance) })
      .eq('id', accountId);
  }
};