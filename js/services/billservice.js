import { supabase } from '../config/supabase.js';

export const billService = {
  // 1. Ambil semua master tagihan
  async getBills() {
    const { data, error } = await supabase
      .from('recurring_bills')
      .select('*, categories(name)')
      .order('due_day', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // 2. Buat Master Tagihan Baru (dengan inject user_id)
  async createBill(billData) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pengguna belum terautentikasi.');

    const { data, error } = await supabase
      .from('recurring_bills')
      .insert([{ ...billData, user_id: user.id }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // 3. Hapus Master Tagihan
  async deleteBill(id) {
    const { error } = await supabase.from('recurring_bills').delete().eq('id', id);
    if (error) throw error;
  },

  // 4. Sync Log Tagihan Bulan Ini
  async syncMonthlyBills(periodMonth) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const bills = await this.getBills();
    if (bills.length === 0) return [];

    const { data: existingLogs } = await supabase
      .from('bill_logs')
      .select('*')
      .eq('period_month', periodMonth);

    const existingBillIds = (existingLogs || []).map(l => l.bill_id);
    const newLogs = [];

    for (const bill of bills) {
      if (!existingBillIds.includes(bill.id)) {
        newLogs.push({
          user_id: user.id,
          bill_id: bill.id,
          period_month: periodMonth,
          status: 'pending',
          amount: bill.amount,
          is_cashflow_added: false
        });
      }
    }

    if (newLogs.length > 0) {
	  const { error: insErr } = await supabase
	   .from('bill_logs')
	   .upsert(newLogs, { onConflict: 'bill_id,period_month', ignoreDuplicates: true });
	  if (insErr) console.error('Gagal sync iuran:', insErr);
    }

    const { data: currentLogs, error } = await supabase
      .from('bill_logs')
      .select('*, recurring_bills(*, categories(name))')
      .eq('period_month', periodMonth);

    if (error) throw error;
    return currentLogs || [];
  },

  // 5. Ambil daftar iuran pending bulan ini
  async getPendingBillsThisMonth() {
    const currentPeriod = new Date().toISOString().slice(0, 7);
    await this.syncMonthlyBills(currentPeriod);

    const { data, error } = await supabase
      .from('bill_logs')
      .select('*, recurring_bills(*, categories(name))')
      .eq('period_month', currentPeriod)
      .eq('status', 'pending');

    if (error) throw error;
    return data || [];
  },

  // 6. Tandai Iuran Terbayar dari Transaksi
  async markBillAsPaidByTransaction(billLogId, transactionId) {
    const { error } = await supabase
      .from('bill_logs')
      .update({
        status: 'paid',
        is_cashflow_added: true,
        transaction_id: transactionId
      })
      .eq('id', billLogId);

    if (error) throw error;
  },

  // 7. Toggle Manual Status di Tab Iuran
  async toggleBillPaidStatus(log, shouldAddToCashflow = true) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Pengguna belum terautentikasi.');

    const newStatus = log.status === 'pending' ? 'paid' : 'pending';
    let txId = log.transaction_id;

    if (newStatus === 'paid' && shouldAddToCashflow && !log.is_cashflow_added) {
      const today = new Date().toISOString().split('T')[0];
      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          type: 'expense',
          currency: 'IDR',
          amount: log.amount,
          title: `[Iuran] ${log.recurring_bills.name}`,
          category_id: log.recurring_bills.category_id,
          transaction_date: today
        }])
        .select()
        .single();

      if (!txErr) txId = newTx.id;
    }

    const { error } = await supabase
      .from('bill_logs')
      .update({
        status: newStatus,
        is_cashflow_added: newStatus === 'paid' ? shouldAddToCashflow : false,
        transaction_id: newStatus === 'paid' ? txId : null
      })
      .eq('id', log.id);

    if (error) throw error;
  }
};