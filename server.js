const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.disable('x-powered-by');
app.use((req, res, next) => {
  // Security headers for Tor
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Middleware
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('public', {
  maxAge: 0, // No caching for Tor
  etag: false
}));

// Store blog posts in JSON file
const POSTS_FILE = path.join(__dirname, 'posts.json');
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || 
  crypto.createHash('sha256').update('changeme').digest('hex'); // Change this!

// Simple session storage (in-memory)
const sessions = new Map();

function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

function isAuthenticated(req) {
  const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  return sessionId && sessions.has(sessionId);
}

// Initialize posts file if it doesn't exist
async function initPosts() {
  try {
    await fs.access(POSTS_FILE);
  } catch {
    const initialPosts = [];
    await fs.writeFile(POSTS_FILE, JSON.stringify(initialPosts, null, 2));
  }
}

// Get all posts
async function getPosts() {
  try {
    const data = await fs.readFile(POSTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save posts
async function savePosts(posts) {
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Home page
app.get('/', async (req, res) => {
  const posts = await getPosts();
  const recentPosts = posts.slice(-5).reverse();
  
  const postsHtml = recentPosts.length === 0 
    ? '<p>No posts yet. <a href="/admin" class="quicklink">Create one!</a></p>'
    : recentPosts.map((post, idx) => `
      <article class="content">
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <div class="post-meta">Posted on ${formatDate(post.date)}</div>
        <p class="post-body">${escapeHtml(post.body.substring(0, 300))}${post.body.length > 300 ? '...' : ''}</p>
        <a class="cta" href="/post/${post.id}">
          <span>Read more</span>
          <span class="arrow">→</span>
        </a>
        ${post.status ? `
        <section class="mini-post">
          <div class="dot"></div>
          <div>
            <strong class="post-mini-title">Currently</strong>
            <small class="post-mini-desc">${escapeHtml(post.status)}</small>
          </div>
        </section>
        ` : ''}
      </article>
      ${idx < recentPosts.length - 1 ? '<hr style="border: 1px dashed #00cc55; margin: 20px 0;">' : ''}
    `).join('');

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Link — Something Cool</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%23003322' width='64' height='64'/%3E%3Ctext x='32' y='40' font-size='32' text-anchor='middle' fill='%2300ff66'%3EL%3C/text%3E%3C/svg%3E" alt="Link">
      </div>
      <div>
        <h1>Link</h1>
        <p class="lead">Because I was bored.</p>
      </div>
    </header>

    <div class="layout">
      <div class="main-col">
        <main class="card" role="main">
          <div class="titlebar">
            <div class="title">
              <span>📝</span>
              <span>Blog Posts</span>
            </div>
            <div class="window-controls">
              <button class="min" title="Minimize">–</button>
              <button class="max" title="Maximize">□</button>
              <button class="close" title="Close">×</button>
            </div>
          </div>
          <div class="content-inner">
            ${postsHtml}
          </div>
        </main>
      </div>

      <div class="side-col">
        <aside class="meta">
          <div class="panel">
            <h3>About</h3>
            <small>Bored programmer who mostly does things out of spite. Currently working on 4 projects at the same time.</small>
          </div>
          <div class="panel">
            <h3>Quick links</h3>
            <small>
              <a href="/" class="quicklink">Home</a><br>
              <a href="/projects" class="quicklink">Projects</a><br>
              <a href="/admin" class="quicklink">Admin</a>
            </small>
          </div>
          <div class="panel">
            <h3>Stats</h3>
            <small>
              <strong>Posts:</strong> ${posts.length}<br>
              <strong>Since:</strong> 2025<br>
              <strong>Status:</strong> <span style="color: #00ff66;">● Online</span>
            </small>
          </div>
        </aside>
      </div>
    </div>

    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Hey! Listen!</div>
    </footer>
  </div>
</body>
</html>`);
});

// Single post page
app.get('/post/:id', async (req, res) => {
  const posts = await getPosts();
  const post = posts.find(p => p.id === parseInt(req.params.id));
  
  if (!post) {
    return res.status(404).send('Post not found');
  }

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(post.title)} — Link</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%23003322' width='64' height='64'/%3E%3Ctext x='32' y='40' font-size='32' text-anchor='middle' fill='%2300ff66'%3EL%3C/text%3E%3C/svg%3E" alt="Link">
      </div>
      <div>
        <h1>Link</h1>
        <p class="lead">Because I was bored.</p>
      </div>
    </header>

    <main class="card" role="main">
      <div class="titlebar">
        <div class="title">
          <span>📝</span>
          <span>Link</span>
        </div>
        <div class="window-controls">
          <button class="min">–</button>
          <button class="max">□</button>
          <button class="close">×</button>
        </div>
      </div>

      <div class="content-inner">
        <article class="content">
          <h2 class="post-title">${escapeHtml(post.title)}</h2>
          <div class="post-meta">Posted on ${formatDate(post.date)}</div>
          <p class="post-body">${escapeHtml(post.body).replace(/\n/g, '<br>')}</p>
          <a class="cta" href="/">
            <span>← Back to home</span>
          </a>
          ${post.status ? `
          <section class="mini-post">
            <div class="dot"></div>
            <div>
              <strong class="post-mini-title">Currently</strong>
              <small class="post-mini-desc">${escapeHtml(post.status)}</small>
            </div>
          </section>
          ` : ''}
        </article>
      </div>
    </main>

    <aside class="meta">
      <div class="panel">
        <h3>Quick links</h3>
        <small>
          <a href="/" class="quicklink">Home</a><br>
          <a href="/projects" class="quicklink">Projects</a>
        </small>
      </div>
    </aside>

    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Hey! Listen!</div>
    </footer>
  </div>
</body>
</html>`);
});

// Projects page
app.get('/projects', (req, res) => {
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Projects — Link</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%23003322' width='64' height='64'/%3E%3Ctext x='32' y='40' font-size='32' text-anchor='middle' fill='%2300ff66'%3EL%3C/text%3E%3C/svg%3E" alt="Link">
      </div>
      <div>
        <h1>Projects</h1>
        <p class="lead">The stuff I've actually finished (or didn't abandon).</p>
      </div>
    </header>

    <section class="project-grid">
      <div class="card project-card">
        <div class="titlebar">
          <div class="title">🔒 NaviChat</div>
          <div class="window-controls">
            <button class="min">–</button>
            <button class="max">□</button>
            <button class="close">×</button>
          </div>
        </div>
        <div class="content-inner">
          <p class="project-body">
            A Tor Based E2E Encrypted Messenger Made In GoLang.
          </p>
          <a class="cta" href="http://navi5jbi3apijnyvp5ck6q4n656niqt4jrleiwb2eeaokonfxs22wiid.onion/">
            <span>Visit site</span><span class="arrow">→</span>
          </a>
        </div>
      </div>

      <div class="card project-card">
        <div class="titlebar">
          <div class="title">⚡ Magolor</div>
          <div class="window-controls">
            <button class="min">–</button>
            <button class="max">□</button>
            <button class="close">×</button>
          </div>
        </div>
        <div class="content-inner">
          <p class="project-body">
            A Programming Language Designed To Make Games and Low Level Programming Easier.
          </p>
          <span class="cta" style="opacity: 0.5; cursor: default;">
            <span>Coming Soon</span><span class="arrow">→</span>
          </span>
        </div>
      </div>

      <div class="card project-card">
        <div class="titlebar">
          <div class="title">🌐 Link</div>
          <div class="window-controls">
            <button class="min">–</button>
            <button class="max">□</button>
            <button class="close">×</button>
          </div>
        </div>
        <div class="content-inner">
          <p class="project-body">
            Literally This Site. A retro 2000s-style blog with dynamic posting.
          </p>
          <a class="cta" href="/">
            <span>Go Home</span><span class="arrow">→</span>
          </a>
        </div>
      </div>
    </section>

    <aside class="meta" style="max-width: 600px; margin: 0 auto;">
      <div class="panel">
        <h3>About Projects</h3>
        <small>Still mostly doing this for fun. Everything here was built between caffeine highs and sleep deprivation.</small>
      </div>
      <div class="panel">
        <h3>Quick links</h3>
        <small>
          <a href="/" class="quicklink">Home</a><br>
          <a href="/admin" class="quicklink">Admin</a>
        </small>
      </div>
    </aside>

    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Hey! Listen!</div>
    </footer>
  </div>
</body>
</html>`);
});

// Admin login page
app.get('/admin', (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect('/admin/dashboard');
  }

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Admin Login — Link</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%23003322' width='64' height='64'/%3E%3Ctext x='32' y='40' font-size='32' text-anchor='middle' fill='%2300ff66'%3EL%3C/text%3E%3C/svg%3E" alt="Link">
      </div>
      <div>
        <h1>Admin Login</h1>
        <p class="lead">Enter your password to continue</p>
      </div>
    </header>

    <div class="card" style="max-width: 500px; margin: 0 auto;">
      <div class="titlebar">
        <div class="title">
          <span>🔒</span>
          <span>Authentication Required</span>
        </div>
        <div class="window-controls">
          <button class="min">–</button>
          <button class="max">□</button>
          <button class="close">×</button>
        </div>
      </div>

      <div class="content-inner">
        <form method="POST" action="/admin/login">
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required autofocus>
          </div>
          <button type="submit" class="btn">🔓 Login</button>
          <a href="/" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%); margin-left: 10px; text-decoration: none;">Cancel</a>
        </form>
      </div>
    </div>

    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Hey! Listen!</div>
    </footer>
  </div>
</body>
</html>`);
});

// Admin login handler
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  
  if (hash === ADMIN_PASSWORD_HASH) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { createdAt: Date.now() });
    res.setHeader('Set-Cookie', `session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
    res.redirect('/admin/dashboard');
  } else {
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="2;url=/admin">
  <title>Login Failed</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <div class="card" style="max-width: 500px; margin: 100px auto; text-align: center;">
      <div class="content-inner">
        <h2 style="color: #ff6666;">❌ Invalid Password</h2>
        <p>Redirecting...</p>
      </div>
    </div>
  </div>
</body>
</html>`);
  }
});

// Admin dashboard
app.get('/admin/dashboard', async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin');
  }

  const posts = await getPosts();
  const postsHtml = posts.length === 0
    ? '<li>No posts yet.</li>'
    : posts.slice().reverse().map(post => `
      <li>
        <h3>${escapeHtml(post.title)}</h3>
        <small style="color: #66cc88;">${formatDate(post.date)}</small>
        <p style="margin: 8px 0; font-size: 0.9rem;">${escapeHtml(post.body.substring(0, 150))}${post.body.length > 150 ? '...' : ''}</p>
        <a href="/post/${post.id}" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">View</a>
        <form method="POST" action="/admin/delete/${post.id}" style="display: inline;">
          <button type="submit" class="btn btn-delete" style="font-size: 0.8rem; padding: 5px 10px;" onclick="return confirm('Are you sure?')">Delete</button>
        </form>
      </li>
    `).join('');

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Admin Panel — Link</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect fill='%23003322' width='64' height='64'/%3E%3Ctext x='32' y='40' font-size='32' text-anchor='middle' fill='%2300ff66'%3EL%3C/text%3E%3C/svg%3E" alt="Link">
      </div>
      <div>
        <h1>Admin Panel</h1>
        <p class="lead">Manage your blog posts</p>
      </div>
    </header>

    <div class="layout">
      <div class="main-col">
        <div class="card">
          <div class="titlebar">
            <div class="title">
              <span>✏️</span>
              <span>Create New Post</span>
            </div>
            <div class="window-controls">
              <button class="min">–</button>
              <button class="max">□</button>
              <button class="close">×</button>
            </div>
          </div>

          <div class="content-inner">
            <form method="POST" action="/admin/create">
              <div class="form-group">
                <label for="title">Post Title:</label>
                <input type="text" id="title" name="title" required placeholder="Enter post title..." maxlength="200">
              </div>

              <div class="form-group">
                <label for="body">Post Content:</label>
                <textarea id="body" name="body" required placeholder="Write your post here..." maxlength="10000"></textarea>
              </div>

              <div class="form-group">
                <label for="status">Current Status (optional):</label>
                <input type="text" id="status" name="status" placeholder="What are you working on?" maxlength="200">
              </div>

              <button type="submit" class="btn">📝 Create Post</button>
              <button type="reset" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%);">🔄 Clear</button>
            </form>
          </div>
        </div>

        <div class="card" style="margin-top: 20px;">
          <div class="titlebar">
            <div class="title">
              <span>📋</span>
              <span>All Posts</span>
            </div>
            <div class="window-controls">
              <button class="min">–</button>
              <button class="max">□</button>
              <button class="close">×</button>
            </div>
          </div>

          <div class="content-inner">
            <ul class="post-list">
              ${postsHtml}
            </ul>
          </div>
        </div>
      </div>

      <div class="side-col">
        <aside class="meta">
          <div class="panel">
            <h3>Quick Tips</h3>
            <small>
              • Use line breaks for paragraphs<br>
              • Keep titles short and catchy<br>
              • Status shows on the latest post<br>
              • Posts appear newest first
            </small>
          </div>

          <div class="panel">
            <h3>Quick links</h3>
            <small>
              <a href="/" class="quicklink">Home</a><br>
              <a href="/projects" class="quicklink">Projects</a><br>
              <a href="/admin/logout" class="quicklink">Logout</a>
            </small>
          </div>
        </aside>
      </div>
    </div>

    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Admin Mode Active</div>
    </footer>
  </div>
</body>
</html>`);
});

// Create post
app.post('/admin/create', async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin');
  }

  const { title, body, status } = req.body;
  const posts = await getPosts();
  
  const newPost = {
    id: posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1,
    title: title.substring(0, 200),
    body: body.substring(0, 10000),
    date: new Date().toISOString(),
    status: status ? status.substring(0, 200) : ''
  };
  
  posts.push(newPost);
  await savePosts(posts);
  
  res.redirect('/admin/dashboard');
});

// Delete post
app.post('/admin/delete/:id', async (req, res) => {
  if (!isAuthenticated(req)) {
    return res.redirect('/admin');
  }

  const posts = await getPosts();
  const filtered = posts.filter(p => p.id !== parseInt(req.params.id));
  await savePosts(filtered);
  
  res.redirect('/admin/dashboard');
});

// Logout
app.get('/admin/logout', (req, res) => {
  const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.redirect('/');
});

// Clean up old sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > 3600000) { // 1 hour
      sessions.delete(sessionId);
    }
  }
}, 3600000);

// Start server
initPosts().then(() => {
  app.listen(PORT, () => {
    console.log(`🌟 Blog server running on http://localhost:${PORT}`);
    console.log(`📝 Add new posts at http://localhost:${PORT}/admin`);
    console.log(`🔐 Default password hash: ${ADMIN_PASSWORD_HASH.substring(0, 16)}...`);
    console.log(`⚠️  Change ADMIN_PASSWORD_HASH environment variable!`);
  });
});
