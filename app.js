
/* MENUSNAP APPLICATION */
const $ = s => document.querySelector(s);

let sb = null;
let user = null;
let restaurant = null;
let categories = [];
let items = [];

const URL_KEY = 'menusnap_project_url';
const API_KEY = 'menusnap_publishable_key';

const esc = v => String(v || '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3200);
}

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function connectDB() {
  const url = localStorage.getItem(URL_KEY);
  const key = localStorage.getItem(API_KEY);
  if (!url || !key) return false;
  sb = window.supabase.createClient(url, key);
  return true;
}

function setHeader() {
  $('#header-actions').innerHTML = user
    ? '<button class="secondary" id="signout">Sign out</button>'
    : '<button class="secondary" id="login-top">Owner login</button>';

  $('#signout')?.addEventListener('click', signOut);
  $('#login-top')?.addEventListener('click', showAuth);
}

function showWorkspace(html) {
  document.querySelector('.hero')?.classList.add('hidden');
  document.querySelector('.feature-grid')?.classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  $('#workspace').innerHTML = html;
}

function configScreen() {
  showWorkspace(`
    <div class="panel">
      <h2>Connect MenuSnap</h2>
      <p class="muted-small">
        Enter your Supabase Project URL and Publishable key.
        Never enter your Secret key.
      </p>
      <div class="field">
        <label>SUPABASE PROJECT URL</label>
        <input id="project-url" placeholder="https://your-project.supabase.co">
      </div>
      <div class="field">
        <label>SUPABASE PUBLISHABLE KEY</label>
        <textarea id="publishable-key"></textarea>
      </div>
      <button class="primary" id="connect">Connect database</button>
    </div>
  `);

  $('#project-url').value = localStorage.getItem(URL_KEY) || '';
  $('#publishable-key').value = localStorage.getItem(API_KEY) || '';

  $('#connect').onclick = () => {
    const url = $('#project-url').value.trim();
    const key = $('#publishable-key').value.trim();

    if (!url.startsWith('https://') || !key) {
      toast('Enter both connection details.');
      return;
    }

    localStorage.setItem(URL_KEY, url);
    localStorage.setItem(API_KEY, key);

    if (connectDB()) {
      toast('Database connected.');
      checkSession();
    }
  };
}

async function checkSession() {
  if (!connectDB()) {
    configScreen();
    return;
  }

  const { data, error } = await sb.auth.getSession();

  if (error) {
    toast(error.message);
    return;
  }

  user = data.session?.user || null;
  setHeader();

  if (user) loadDashboard();
  else showAuth();
}

function showAuth() {
  showWorkspace(`
    <div class="panel" style="max-width:520px;margin:auto">
      <h2>Restaurant owner access</h2>
      <p class="muted-small">Create an account or sign in.</p>

      <div class="field">
        <label>EMAIL</label>
        <input id="email" type="email" placeholder="you@example.com">
      </div>

      <div class="field">
        <label>PASSWORD</label>
        <input id="password" type="password" placeholder="At least 6 characters">
      </div>

      <button class="primary" id="signup">Create account</button>
      <button class="secondary" id="signin">Sign in</button>
    </div>
  `);

  $('#signup').onclick = () => authenticate('signup');
  $('#signin').onclick = () => authenticate('signin');
}

async function authenticate(mode) {
  const email = $('#email').value.trim();
  const password = $('#password').value;

  if (!email || password.length < 6) {
    toast('Enter a valid email and password.');
    return;
  }

  const result = mode === 'signup'
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  if (result.error) {
    toast(result.error.message);
    return;
  }

  user = result.data.user;

  if (mode === 'signup' && !result.data.session) {
    toast('Check your email to confirm your account.');
    return;
  }

  setHeader();
  loadDashboard();
}

async function signOut() {
  await sb.auth.signOut();
  user = null;
  restaurant = null;
  setHeader();
  showAuth();
}

async function loadDashboard() {
  showWorkspace('<div class="panel">Loading your restaurant...</div>');

  const { data, error } = await sb
    .from('ms_restaurants')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (error) {
    showWorkspace(`
      <div class="panel">
        <h2>Database setup needed</h2>
        <p>${esc(error.message)}</p>
        <p>Run the supplied supabase-setup.sql file in Supabase SQL Editor.</p>
      </div>
    `);
    return;
  }

  restaurant = data;

  if (!restaurant) {
    showRestaurantSetup();
    return;
  }

  await loadMenuData();
  renderDashboard();
}

function showRestaurantSetup() {
  showWorkspace(`
    <div class="panel">
      <h2>Create your restaurant menu</h2>

      <div class="field">
        <label>RESTAURANT NAME</label>
        <input id="rest-name" placeholder="The Food House">
      </div>

      <div class="field">
        <label>MENU URL NAME</label>
        <input id="rest-slug" placeholder="the-food-house">
      </div>

      <div class="field">
        <label>DESCRIPTION</label>
        <textarea id="rest-desc"></textarea>
      </div>

      <button class="primary" id="create-rest">Create restaurant</button>
    </div>
  `);

  $('#rest-name').oninput = () => {
    $('#rest-slug').value = slugify($('#rest-name').value);
  };

  $('#create-rest').onclick = createRestaurant;
}

async function createRestaurant() {
  const name = $('#rest-name').value.trim();
  const slug = slugify($('#rest-slug').value);
  const description = $('#rest-desc').value.trim();

  if (!name || !slug) {
    toast('Enter restaurant name.');
    return;
  }

  const { data, error } = await sb
    .from('ms_restaurants')
    .insert({
      owner_id: user.id,
      name,
      slug,
      description,
      is_published: true
    })
    .select()
    .single();

  if (error) {
    toast(error.message);
    return;
  }

  restaurant = data;
  loadDashboard();
}

async function loadMenuData() {
  const c = await sb.from('ms_categories')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order');

  const i = await sb.from('ms_menu_items')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order');

  if (c.error || i.error) {
    toast((c.error || i.error).message);
    return;
  }

  categories = c.data || [];
  items = i.data || [];
}

function menuUrl() {
  return `${location.origin}${location.pathname}?r=${encodeURIComponent(restaurant.slug)}`;
}

function renderDashboard() {
  const url = menuUrl();
  const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='
    + encodeURIComponent(url);

  showWorkspace(`
    <div class="panel">
      <h2>${esc(restaurant.name)}</h2>
      <span class="tag">Menu active</span>

      <div class="qr-wrap">
        <img src="${qr}" alt="Restaurant QR code">
        <div>
          <h3>Your menu QR code</h3>
          <p class="link">${esc(url)}</p>
          <a href="${qr}" download="menusnap-qr.png">Download QR</a>
        </div>
      </div>
      <button class="secondary" id="edit-rest">Edit restaurant</button>
    </div>

    <div class="panel">
      <h2>Menu categories</h2>
      <div class="field">
        <input id="new-category" placeholder="Starters, Main course...">
      </div>
      <button class="primary" id="add-category">Add category</button>

      <div class="item-list">
        ${categories.map(c => `
          <div class="item">
            <div class="item-info"><strong>${esc(c.name)}</strong></div>
            <button class="danger small" data-delcat="${c.id}">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <h2>Add a menu item</h2>

      <div class="field">
        <label>ITEM NAME</label>
        <input id="item-name" placeholder="Paneer Tikka">
      </div>

      <div class="field">
        <label>PRICE (₹)</label>
        <input id="item-price" type="number" min="0" placeholder="180">
      </div>

      <div class="field">
        <label>CATEGORY</label>
        <select id="item-category">
          <option value="">Choose category</option>
          ${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>FOOD PHOTO</label>
        <input id="item-image" type="file" accept="image/png,image/jpeg,image/webp">
      </div>

      <div class="field">
        <label>DESCRIPTION</label>
        <textarea id="item-desc"></textarea>
      </div>

      <button class="primary" id="add-item">Add menu item</button>
    </div>

    <div class="panel">
      <h2>Your menu items</h2>
      <div class="item-list">
        ${items.map(item => `
          <div class="item">
            <img src="${esc(item.image_url || 'https://placehold.co/120x120')}">
            <div class="item-info">
              <strong>${esc(item.name)} · ₹${Number(item.price).toFixed(2)}</strong>
              <small>${item.is_available ? 'Available' : 'Unavailable'}</small>
            </div>
            <button class="small" data-toggle="${item.id}">
              ${item.is_available ? 'Hide' : 'Show'}
            </button>
            <button class="danger small" data-delete="${item.id}">Delete</button>
          </div>
        `).join('')}
      </div>
    </div>
  `);

  $('#add-category').onclick = addCategory;
  $('#add-item').onclick = addItem;
  $('#edit-rest').onclick = editRestaurant;

  document.querySelectorAll('[data-delcat]').forEach(b =>
    b.onclick = () => deleteCategory(b.dataset.delcat)
  );

  document.querySelectorAll('[data-delete]').forEach(b =>
    b.onclick = () => deleteItem(b.dataset.delete)
  );

  document.querySelectorAll('[data-toggle]').forEach(b =>
    b.onclick = () => toggleItem(b.dataset.toggle)
  );
}

async function addCategory() {
  const name = $('#new-category').value.trim();

  if (!name) {
    toast('Enter a category name.');
    return;
  }

  const { error } = await sb.from('ms_categories').insert({
    restaurant_id: restaurant.id,
    name,
    sort_order: categories.length
  });

  if (error) {
    toast(error.message);
    return;
  }

  await loadMenuData();
  renderDashboard();
}

async function addItem() {
  const name = $('#item-name').value.trim();
  const price = Number($('#item-price').value);
  const category_id = $('#item-category').value || null;
  const file = $('#item-image').files[0];

  if (!name || !Number.isFinite(price) || price < 0) {
    toast('Enter item name and valid price.');
    return;
  }

  let image_url = null;

  if (file) {
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be smaller than 5 MB.');
      return;
    }

    const path = `${user.id}/${restaurant.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const upload = await sb.storage
      .from('menusnap-images')
      .upload(path, file, { upsert: true });

    if (upload.error) {
      toast(upload.error.message);
      return;
    }

    image_url = sb.storage
      .from('menusnap-images')
      .getPublicUrl(path).data.publicUrl;
  }

  const { error } = await sb.from('ms_menu_items').insert({
    restaurant_id: restaurant.id,
    category_id,
    name,
    price,
    description: $('#item-desc').value.trim(),
    image_url,
    is_available: true,
    sort_order: items.length
  });

  if (error) {
    toast(error.message);
    return;
  }

  await loadMenuData();
  renderDashboard();
}

async function deleteItem(id) {
  if (!confirm('Delete this menu item?')) return;

  const { error } = await sb.from('ms_menu_items')
    .delete().eq('id', id);

  if (error) return toast(error.message);

  await loadMenuData();
  renderDashboard();
}

async function toggleItem(id) {
  const item = items.find(x => x.id === id);

  const { error } = await sb.from('ms_menu_items')
    .update({ is_available: !item.is_available })
    .eq('id', id);

  if (error) return toast(error.message);

  await loadMenuData();
  renderDashboard();
}

async function deleteCategory(id) {
  if (!confirm('Delete this category?')) return;

  const { error } = await sb.from('ms_categories')
    .delete().eq('id', id);

  if (error) return toast(error.message);

  await loadMenuData();
  renderDashboard();
}

function editRestaurant() {
  showWorkspace(`
    <div class="panel">
      <h2>Edit restaurant details</h2>

      <div class="field">
        <label>RESTAURANT NAME</label>
        <input id="edit-name" value="${esc(restaurant.name)}">
      </div>

      <div class="field">
        <label>MENU URL NAME</label>
        <input id="edit-slug" value="${esc(restaurant.slug)}">
      </div>

      <div class="field">
        <label>DESCRIPTION</label>
        <textarea id="edit-desc">${esc(restaurant.description)}</textarea>
      </div>

      <button class="primary" id="save-rest">Save changes</button>
      <button class="secondary" id="back-dash">Cancel</button>
    </div>
  `);

  $('#save-rest').onclick = async () => {
    const { data, error } = await sb.from('ms_restaurants')
      .update({
        name: $('#edit-name').value.trim(),
        slug: slugify($('#edit-slug').value),
        description: $('#edit-desc').value.trim()
      })
      .eq('id', restaurant.id)
      .select()
      .single();

    if (error) return toast(error.message);

    restaurant = data;
    renderDashboard();
  };

  $('#back-dash').onclick = renderDashboard;
}

async function publicMenu(slug) {
  if (!connectDB()) {
    configScreen();
    return;
  }

  const { data: r, error } = await sb.from('ms_restaurants')
    .select('id,name,description,logo_url')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();

  if (error || !r) {
    showWorkspace('<div class="panel empty">Menu not found.</div>');
    return;
  }

  const c = await sb.from('ms_categories')
    .select('*').eq('restaurant_id', r.id).order('sort_order');

  const i = await sb.from('ms_menu_items')
    .select('*')
    .eq('restaurant_id', r.id)
    .eq('is_available', true)
    .order('sort_order');

  if (c.error || i.error) {
    showWorkspace('<div class="panel empty">Unable to load menu.</div>');
    return;
  }

  const groups = (c.data || []).map(cat => ({
    cat,
    items: (i.data || []).filter(x => x.category_id === cat.id)
  }));

  showWorkspace(`
    <div class="menu-head">
      <h1>${esc(r.name)}</h1>
      <p>${esc(r.description || 'Digital menu')}</p>
    </div>

    ${groups.map(g => `
      <h2 class="menu-category">${esc(g.cat.name)}</h2>
      <div class="public-items">
        ${g.items.map(publicCard).join('')}
      </div>
    `).join('')}

    ${(i.data || []).filter(x => !x.category_id).map(publicCard).join('')}
  `);
}

function publicCard(x) {
  return `
    <article class="public-card">
      ${x.image_url ? `<img src="${esc(x.image_url)}" alt="${esc(x.name)}">` : ''}
      <div class="public-card-body">
        <h3>${esc(x.name)}</h3>
        ${x.description ? `<p>${esc(x.description)}</p>` : ''}
        <div class="public-price">₹${Number(x.price).toFixed(2)}</div>
      </div>
    </article>
  `;
}

$('#get-started').onclick = () => {
  if (connectDB()) showAuth();
  else configScreen();
};

$('#view-demo').onclick = () => {
  showWorkspace(`
    <div class="panel empty">
      <h2>Sample menu</h2>
      <p>Your restaurant menu will appear here after setup.</p>
    </div>
  `);
};

(async () => {
  const slug = new URLSearchParams(location.search).get('r');

  if (slug) {
    await publicMenu(slug);
  } else if (connectDB()) {
    await checkSession();
  } else {
    setHeader();
  }
})();
