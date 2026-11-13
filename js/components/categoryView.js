import { transactionService } from "../services/transactionservice.js";

export async function renderCategories() {
  const container = document.getElementById("category-list-container");
  if (!container) return;

  try {
    const categories = await transactionService.getCategories();
    container.innerHTML = "";

    if (categories.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Belum ada kategori terdaftar.</p>`;
      return;
    }

    categories.forEach((cat) => {
      const isIncome = cat.type === "income";
      const div = document.createElement("div");
      div.className =
        "flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs";

      div.innerHTML = `
        <div>
          <span class="font-bold text-slate-800">${cat.name}</span>
          <span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}">
            ${isIncome ? "Pemasukan" : "Pengeluaran"}
          </span>
        </div>
        <button data-id="${cat.id}" class="btn-del-cat text-slate-400 hover:text-rose-600 transition-colors">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      `;

      div.querySelector(".btn-del-cat").addEventListener("click", async () => {
        if (confirm(`Hapus kategori "${cat.name}"?`)) {
          try {
            await transactionService.deleteCategory(cat.id);
            renderCategories();
          } catch (err) {
            alert("Gagal menghapus kategori: " + err.message);
          }
        }
      });

      container.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error("Gagal memuat kategori:", err);
  }
}

export function setupCategoryForm() {
  const form = document.getElementById("form-manage-category");
  if (!form || form.dataset.listenerInitialized) return;
  form.dataset.listenerInitialized = "true";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("man-cat-name");
    const typeSelect = document.getElementById("man-cat-type");

    if (!nameInput.value.trim()) return;

    try {
      await transactionService.createCategory(
        nameInput.value.trim(),
        typeSelect.value,
      );
      form.reset();
      alert("Kategori berhasil ditambahkan!");
      renderCategories();
    } catch (err) {
      alert("Gagal membuat kategori: " + err.message);
    }
  });
}
