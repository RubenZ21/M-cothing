// "Edit categories": she renames, adds, removes (only when empty) and reorders
// the clothing categories. The list is saved on the phone and in the backup.
import { CATEGORIES, DEFAULT_CATEGORIES, singular } from './constants.js';
import { esc, uid, toast, plural } from './util.js';
import { icon } from './icons.js';

export function renderCategoryEditor(root, { state, save, onBack }) {
  root.className = 'app no-tabbar';
  const used = (id) => state.items.filter((i) => i.category === id).length + state.wishes.filter((w) => w.category === id).length;

  async function commit(list, msg) {
    await save(list.map(({ id, label, one }) => ({ id, label, one })));
    if (msg) toast(msg);
    render();
  }
  const taken = (name, exceptId) => CATEGORIES.some((c) => c.id !== exceptId && c.label.trim().toLowerCase() === name.trim().toLowerCase());

  function render() {
    const y = window.scrollY;
    root.innerHTML = `
      <div class="topbar">
        <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon('back')}</button>
        <h1>Categories</h1><span></span>
      </div>
      <div class="settings">
        <section class="card">
          <h2>Add a category</h2>
          <form class="url-row" id="add-form">
            <label for="new-cat" class="visually-hidden">New category name</label>
            <input id="new-cat" class="text-input" type="text" maxlength="40" autocomplete="off" placeholder="e.g. Jumpsuits, Swimwear">
            <button type="submit" class="btn-small">${icon('plus')} Add</button>
          </form>
        </section>
        <section class="card">
          <h2>Your categories</h2>
          <p class="muted small">Use the arrows to change the order. A category can be removed when no clothes or wishes are in it.</p>
          <ol class="cat-list">
            ${CATEGORIES.map((c, k) => {
              const n = used(c.id);
              return `<li class="cat-row">
                <span class="cat-move">
                  <button type="button" class="icon-btn small" data-act="up" data-id="${c.id}" aria-label="Move ${esc(c.label)} up" ${k === 0 ? 'disabled' : ''}>${icon('up')}</button>
                  <button type="button" class="icon-btn small" data-act="down" data-id="${c.id}" aria-label="Move ${esc(c.label)} down" ${k === CATEGORIES.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
                </span>
                <span class="cat-name">${esc(c.label)}<small>${n ? plural(n, 'piece') : 'empty'}</small></span>
                <button type="button" class="icon-btn small" data-act="rename" data-id="${c.id}" aria-label="Rename ${esc(c.label)}">${icon('pencil')}</button>
                <button type="button" class="icon-btn small danger" data-act="remove" data-id="${c.id}" aria-label="${n ? `${esc(c.label)} can't be removed: it has ${plural(n, 'piece')}` : `Remove ${esc(c.label)}`}" ${n ? 'disabled' : ''}>${icon('trash')}</button>
              </li>`;
            }).join('')}
          </ol>
        </section>
        <button type="button" class="btn-secondary" data-act="reset">Back to the original list</button>
      </div>`;
    window.scrollTo(0, y);

    root.querySelector('#add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = root.querySelector('#new-cat').value.trim();
      if (!name) return;
      if (taken(name)) { alert(`There is already a category called “${name}”.`); return; }
      await commit([...CATEGORIES, { id: `c-${uid().slice(0, 8)}`, label: name, one: singular(name) }], `“${name}” added`);
    });
  }

  function rename(c) {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `<form method="dialog" class="sheet-body">
      <h2>Rename category</h2>
      <div><label class="field-label" for="r-cat">Name</label>
      <input id="r-cat" class="text-input" type="text" maxlength="40" autocomplete="off" required value="${esc(c.label)}"></div>
      <button type="submit" class="btn-primary" value="ok">Save</button>
      <button type="button" class="text-btn center" data-x="close">Cancel</button>
    </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-x=close]')) dlg.close(); });
    dlg.addEventListener('close', async () => {
      const name = dlg.querySelector('#r-cat').value.trim();
      dlg.remove();
      if (dlg.returnValue !== 'ok' || !name || name === c.label) return;
      if (taken(name, c.id)) { alert(`There is already a category called “${name}”.`); return; }
      await commit(CATEGORIES.map((x) => (x.id === c.id ? { ...x, label: name, one: singular(name) } : x)), 'Category renamed');
    });
    dlg.showModal();
    const input = dlg.querySelector('#r-cat');
    input.focus();
    input.select();
  }

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const k = CATEGORIES.findIndex((c) => c.id === b.dataset.id);
    const list = [...CATEGORIES];
    if (act === 'back') onBack();
    else if (act === 'up' && k > 0) { [list[k - 1], list[k]] = [list[k], list[k - 1]]; await commit(list); }
    else if (act === 'down' && k < list.length - 1) { [list[k + 1], list[k]] = [list[k], list[k + 1]]; await commit(list); }
    else if (act === 'rename') rename(CATEGORIES[k]);
    else if (act === 'remove') {
      if (used(CATEGORIES[k].id)) return;
      if (!confirm(`Remove the category “${CATEGORIES[k].label}”?`)) return;
      await commit(list.filter((c) => c.id !== b.dataset.id), 'Category removed');
    } else if (act === 'reset') {
      // Keeps her own categories that still have pieces, so nothing disappears.
      const keep = CATEGORIES.filter((c) => !DEFAULT_CATEGORIES.some((d) => d.id === c.id) && used(c.id));
      if (!confirm('Go back to the original categories, names and order?' + (keep.length ? ` Your own categories with pieces (${keep.map((c) => c.label).join(', ')}) are kept.` : ''))) return;
      await commit([...DEFAULT_CATEGORIES, ...keep], 'Original categories restored');
    }
  };

  render();
  return () => { root.onclick = null; };
}
