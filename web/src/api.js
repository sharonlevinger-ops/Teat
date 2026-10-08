async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `שגיאה ${res.status}`);
  return data;
}

export const api = {
  search: (params) => fetch(`/api/search?${new URLSearchParams(clean(params))}`).then(json),
  filters: () => fetch('/api/filters').then(json),
  strain: (id) => fetch(`/api/strains/${id}`).then(json),
  sources: () => fetch('/api/sources').then(json),
  menus: () => fetch('/api/menus').then(json),
  uploadMenu: (file) => {
    const fd = new FormData();
    fd.append('menu', file);
    return fetch('/api/menus', { method: 'POST', body: fd }).then(json);
  },
};

function clean(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

export const TYPE_HE = { sativa: 'סאטיבה', indica: 'אינדיקה', hybrid: 'היברידית' };
export const NA = 'לא זמין';
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('he-IL') : '');
