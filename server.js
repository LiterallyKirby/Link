const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.disable('x-powered-by');
app.use((req, res, next) => {
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'DENY');
	res.setHeader('Referrer-Policy', 'no-referrer');
	res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self' data: https://encrypted-tbn0.gstatic.com; form-action 'self'");
	res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
	next();
});

// Middleware
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('.', { maxAge: 0, etag: false }));

// Files
const POSTS_FILE = path.join(__dirname, 'posts.json');
const COMMENTS_FILE = path.join(__dirname, 'comments.json');
const PROJECTS_FILE = path.join(__dirname, 'projects.json');
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ||
	crypto.createHash('sha256').update('changeme').digest('hex');

const sessions = new Map();

function generateSessionId() {
	return crypto.randomBytes(32).toString('hex');
}

function isAuthenticated(req) {
	const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
	return sessionId && sessions.has(sessionId);
}

async function initFiles() {
	try { await fs.access(POSTS_FILE); } catch { await fs.writeFile(POSTS_FILE, '[]'); }
	try { await fs.access(COMMENTS_FILE); } catch { await fs.writeFile(COMMENTS_FILE, '[]'); }
	try { await fs.access(PROJECTS_FILE); } catch { 
		await fs.writeFile(PROJECTS_FILE, JSON.stringify([
			{
				id: 1,
				title: "NaviChat",
				description: "A Tor Based E2E Encrypted Messenger Made In GoLang.",
				url: "http://navi5jbi3apijnyvp5ck6q4n656niqt4jrleiwb2eeaokonfxs22wiid.onion/",
				status: "active",
				order: 1
			},
			{
				id: 2,
				title: "Magolor",
				description: "A Programming Language Designed To Make Games and Low Level Programming Easier.",
				url: "",
				status: "coming_soon",
				order: 2
			},
			{
				id: 3,
				title: "Link",
				description: "Literally This Site. A retro 2000s-style blog with dynamic posting.",
				url: "/",
				status: "active",
				order: 3
			}
		], null, 2));
	}
}

async function getPosts() {
	try { return JSON.parse(await fs.readFile(POSTS_FILE, 'utf8')); } catch { return []; }
}

async function savePosts(posts) {
	await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

async function getComments() {
	try { return JSON.parse(await fs.readFile(COMMENTS_FILE, 'utf8')); } catch { return []; }
}

async function saveComments(comments) {
	await fs.writeFile(COMMENTS_FILE, JSON.stringify(comments, null, 2));
}

async function getProjects() {
	try { return JSON.parse(await fs.readFile(PROJECTS_FILE, 'utf8')); } catch { return []; }
}

async function saveProjects(projects) {
	await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

function escapeHtml(text) {
	if (!text) return '';
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(dateString) {
	const date = new Date(dateString);
	return date.toLocaleDateString('en-US', {
		year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
	});
}

function formatRelativeTime(dateString) {
	const diffMs = new Date() - new Date(dateString);
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffMins < 1) return 'just now';
	if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
	if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
	return formatDate(dateString);
}

function pageLayout(title, content, activeTab = '') {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Link</title>
  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <div class="wrap">
    <header class="site-title">
      <div class="logo">
        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3cwh2_3_EMv7U1UjDGWCsKwWUQBrDSSvHyw&s" alt="Link">
      </div>
      <div>
        <h1><a href="/" style="color: inherit; text-decoration: none;">Link</a></h1>
        <p class="lead">Because I was bored.</p>
      </div>
    </header>
    <nav class="nav-tabs">
      <a href="/" class="nav-tab ${activeTab === 'home' ? 'active' : ''}">Home</a>
      <a href="/archive" class="nav-tab ${activeTab === 'archive' ? 'active' : ''}">Archive</a>
      <a href="/projects" class="nav-tab ${activeTab === 'projects' ? 'active' : ''}">Projects</a>
      <a href="/admin" class="nav-tab">Admin</a>
    </nav>
    ${content}
    <footer>
      <button class="start-orb" aria-label="Start"></button>
      <div class="taskbar-label">Hey! Listen!</div>
    </footer>
  </div>
</body>
</html>`;
}

// Home page
app.get('/', async (req, res) => {
	const posts = await getPosts();
	const comments = await getComments();
	const recentPosts = posts.slice(-5).reverse();

	const postsHtml = recentPosts.length === 0
		? '<p>No posts yet. <a href="/admin" class="quicklink">Create one!</a></p>'
		: recentPosts.map((post, idx) => {
			const postComments = comments.filter(c => c.postId === post.id);
			return `
      <article class="content">
        <h2 class="post-title"><a href="/post/${post.id}" style="color: inherit; text-decoration: none;">${escapeHtml(post.title)}</a></h2>
        <div class="post-meta">Posted on ${formatDate(post.date)} ${post.views ? `• ${post.views} view${post.views !== 1 ? 's' : ''}` : ''} ${postComments.length > 0 ? `• ${postComments.length} comment${postComments.length !== 1 ? 's' : ''}` : ''}</div>
        <p class="post-body">${escapeHtml(post.body.substring(0, 300))}${post.body.length > 300 ? '...' : ''}</p>
        <a class="cta" href="/post/${post.id}"><span>Read more</span><span class="arrow">→</span></a>
        ${post.status ? `<section class="mini-post"><div class="dot"></div><div><strong class="post-mini-title">Currently</strong><small class="post-mini-desc">${escapeHtml(post.status)}</small></div></section>` : ''}
      </article>${idx < recentPosts.length - 1 ? '<hr style="border: 1px dashed #00cc55; margin: 20px 0;">' : ''}`;
		}).join('');

	const content = `
    <div class="layout">
      <div class="main-col">
        <main class="card" role="main">
          <div class="titlebar"><div class="title"><span>Recent Posts</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div>
          <div class="content-inner">${postsHtml}${posts.length > 5 ? '<a href="/archive" class="cta" style="margin-top: 20px;">View All Posts →</a>' : ''}</div>
        </main>
      </div>
      <div class="side-col">
        <aside class="meta">
          <div class="panel"><h3>About</h3><small>Bored programmer who mostly does things out of spite. Currently working on 4 projects at the same time.</small></div>
          <div class="panel"><h3>Stats</h3><small><strong>Posts:</strong> ${posts.length}<br><strong>Comments:</strong> ${comments.length}<br><strong>Since:</strong> 2025<br><strong>Status:</strong> <span style="color: #00ff66;">● Online</span></small></div>
          ${comments.length > 0 ? `<div class="panel"><h3>Recent Comments</h3><small>${comments.slice(-3).reverse().map(c => {
		const post = posts.find(p => p.id === c.postId);
		return `<div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #00cc55;"><strong>${escapeHtml(c.name)}</strong> on <a href="/post/${c.postId}" class="quicklink">${escapeHtml(post?.title || 'Unknown')}</a><br><span style="font-size: 0.8rem; color: #88ffaa;">${formatRelativeTime(c.date)}</span></div>`;
	}).join('')}</small></div>` : ''}
        </aside>
      </div>
    </div>`;
	res.send(pageLayout('Home', content, 'home'));
});

// Archive page
app.get('/archive', async (req, res) => {
	const posts = await getPosts();
	const comments = await getComments();
	const search = req.query.search || '';
	let filteredPosts = posts.slice().reverse();
	if (search) {
		const searchLower = search.toLowerCase();
		filteredPosts = filteredPosts.filter(post =>
			post.title.toLowerCase().includes(searchLower) || post.body.toLowerCase().includes(searchLower)
		);
	}
	const postsHtml = filteredPosts.length === 0 ? '<p>No posts found.</p>' : filteredPosts.map(post => {
		const postComments = comments.filter(c => c.postId === post.id);
		return `<div class="archive-item"><h3 class="post-title"><a href="/post/${post.id}">${escapeHtml(post.title)}</a></h3><div class="post-meta">${formatDate(post.date)} ${post.views ? `• ${post.views} views` : ''} ${postComments.length > 0 ? `• ${postComments.length} comments` : ''}</div><p style="margin: 5px 0 10px 0;">${escapeHtml(post.body.substring(0, 150))}${post.body.length > 150 ? '...' : ''}</p></div>`;
	}).join('');
	const content = `<main class="card" role="main"><div class="titlebar"><div class="title"><span>Post Archive</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="GET" action="/archive" class="search-form"><div class="form-group" style="margin-bottom: 20px;"><label for="search">Search Posts:</label><div style="display: flex; gap: 10px;"><input type="text" id="search" name="search" value="${escapeHtml(search)}" placeholder="Search titles and content..."><button type="submit" class="btn">Search</button>${search ? '<a href="/archive" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%);">Clear</a>' : ''}</div></div></form><div style="margin-bottom: 15px; color: #88ffaa;">${search ? `Found ${filteredPosts.length} post${filteredPosts.length !== 1 ? 's' : ''} matching "${escapeHtml(search)}"` : `Showing all ${posts.length} post${posts.length !== 1 ? 's' : ''}`}</div>${postsHtml}</div></main>`;
	res.send(pageLayout('Archive', content, 'archive'));
});

// Single post page
app.get('/post/:id', async (req, res) => {
	const posts = await getPosts();
	const comments = await getComments();
	const post = posts.find(p => p.id === parseInt(req.params.id));
	if (!post) return res.status(404).send('Post not found');
	post.views = (post.views || 0) + 1;
	await savePosts(posts);
	const postComments = comments.filter(c => c.postId === post.id).reverse();
	const content = `<div class="layout"><div class="main-col"><main class="card" role="main"><div class="titlebar"><div class="title"><span>${escapeHtml(post.title)}</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><article class="content"><h2 class="post-title">${escapeHtml(post.title)}</h2><div class="post-meta">Posted on ${formatDate(post.date)} • ${post.views} view${post.views !== 1 ? 's' : ''} • ${postComments.length} comment${postComments.length !== 1 ? 's' : ''}</div><p class="post-body">${escapeHtml(post.body).replace(/\n/g, '<br>')}</p><a class="cta" href="/"><span>← Back to home</span></a>${post.status ? `<section class="mini-post"><div class="dot"></div><div><strong class="post-mini-title">Currently</strong><small class="post-mini-desc">${escapeHtml(post.status)}</small></div></section>` : ''}</article></div></main><div class="card" style="margin-top: 20px;"><div class="titlebar"><div class="title"><span>Comments (${postComments.length})</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="POST" action="/post/${post.id}/comment"><div class="form-group"><label for="name">Name:</label><input type="text" id="name" name="name" required maxlength="50" placeholder="Your name"></div><div class="form-group"><label for="comment">Comment:</label><textarea id="comment" name="comment" required maxlength="1000" placeholder="Write your comment..." rows="4"></textarea></div><button type="submit" class="btn">Post Comment</button></form>${postComments.length > 0 ? `<hr style="border: 1px dashed #00cc55; margin: 20px 0;"><div class="comments-list">${postComments.map(comment => `<div class="comment-item"><div class="comment-header"><strong style="color: var(--text-strong);">${escapeHtml(comment.name)}</strong><small style="color: #88ffaa; margin-left: 10px;">${formatRelativeTime(comment.date)}</small></div><p class="comment-body">${escapeHtml(comment.comment).replace(/\n/g, '<br>')}</p></div>`).join('')}</div>` : '<p style="margin-top: 20px; color: #88ffaa; font-style: italic;">No comments yet. Be the first to comment!</p>'}</div></div></div><div class="side-col"><aside class="meta"><div class="panel"><h3>Post Info</h3><small><strong>Published:</strong> ${formatDate(post.date)}<br><strong>Views:</strong> ${post.views}<br><strong>Comments:</strong> ${postComments.length}<br><strong>Length:</strong> ${post.body.length} characters</small></div><div class="panel"><h3>Navigation</h3><small><a href="/" class="quicklink">← Home</a><br><a href="/archive" class="quicklink">Archive</a></small></div></aside></div></div>`;
	res.send(pageLayout(post.title, content));
});

// Post comment
app.post('/post/:id/comment', async (req, res) => {
	const posts = await getPosts();
	const comments = await getComments();
	const post = posts.find(p => p.id === parseInt(req.params.id));
	if (!post) return res.status(404).send('Post not found');
	const { name, comment } = req.body;
	const newComment = {
		id: comments.length > 0 ? Math.max(...comments.map(c => c.id)) + 1 : 1,
		postId: post.id, name: name.substring(0, 50), comment: comment.substring(0, 1000),
		date: new Date().toISOString()
	};
	comments.push(newComment);
	await saveComments(comments);
	res.redirect(`/post/${post.id}`);
});

// Projects page
app.get('/projects', async (req, res) => {
	const projects = await getProjects();
	const sortedProjects = projects.sort((a, b) => a.order - b.order);
	
	const projectsHtml = sortedProjects.map(project => {
		const isComingSoon = project.status === 'coming_soon';
		const linkContent = isComingSoon 
			? `<span class="cta" style="opacity: 0.5; cursor: default;"><span>Coming Soon</span><span class="arrow">→</span></span>`
			: `<a class="cta" href="${escapeHtml(project.url)}"><span>Visit site</span><span class="arrow">→</span></a>`;
		
		return `<div class="card project-card">
			<div class="titlebar">
				<div class="title">${escapeHtml(project.title)}</div>
				<div class="window-controls">
					<button class="min">–</button>
					<button class="max">□</button>
					<button class="close">×</button>
				</div>
			</div>
			<div class="content-inner">
				<p class="project-body">${escapeHtml(project.description)}</p>
				${linkContent}
			</div>
		</div>`;
	}).join('');
	
	const content = `<section class="project-grid">${projectsHtml}</section><aside class="meta" style="max-width: 600px; margin: 0 auto;"><div class="panel"><h3>About Projects</h3><small>Still mostly doing this for fun. Everything here was built between caffeine highs and sleep deprivation.</small></div></aside>`;
	res.send(pageLayout('Projects', content, 'projects'));
});

// Admin routes
app.get('/admin', (req, res) => {
	if (isAuthenticated(req)) return res.redirect('/admin/dashboard');
	const content = `<div class="card" style="max-width: 500px; margin: 0 auto;"><div class="titlebar"><div class="title"><span>Authentication Required</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="POST" action="/admin/login"><div class="form-group"><label for="password">Password:</label><input type="password" id="password" name="password" required autofocus></div><button type="submit" class="btn">Login</button><a href="/" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%); margin-left: 10px; text-decoration: none; display: inline-block;">Cancel</a></form></div></div>`;
	res.send(pageLayout('Admin Login', content));
});

app.post('/admin/login', (req, res) => {
	const hash = crypto.createHash('sha256').update(req.body.password).digest('hex');
	if (hash === ADMIN_PASSWORD_HASH) {
		const sessionId = generateSessionId();
		sessions.set(sessionId, { createdAt: Date.now() });
		res.setHeader('Set-Cookie', `session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
		res.redirect('/admin/dashboard');
	} else {
		res.send(`<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="refresh" content="2;url=/admin"><title>Login Failed</title><link rel="stylesheet" href="/styles/main.css"></head><body><div class="wrap"><div class="card" style="max-width: 500px; margin: 100px auto; text-align: center;"><div class="content-inner"><h2 style="color: #ff6666;">Invalid Password</h2><p>Redirecting...</p></div></div></div></body></html>`);
	}
});

app.get('/admin/dashboard', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const posts = await getPosts();
	const comments = await getComments();
	const projects = await getProjects();
	
	const postsHtml = posts.length === 0 ? '<li>No posts yet.</li>' : posts.slice().reverse().map(post => {
		const postComments = comments.filter(c => c.postId === post.id);
		return `<li><h3>${escapeHtml(post.title)}</h3><small style="color: #66cc88;">${formatDate(post.date)}</small><p style="margin: 8px 0; font-size: 0.9rem;">${escapeHtml(post.body.substring(0, 150))}${post.body.length > 150 ? '...' : ''}</p><div style="margin-top: 10px;"><a href="/post/${post.id}" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">View (${post.views || 0} views, ${postComments.length} comments)</a><form method="POST" action="/admin/delete-post/${post.id}" style="display: inline;"><button type="submit" class="btn btn-delete" style="font-size: 0.8rem; padding: 5px 10px;">Delete Post</button></form></div></li>`;
	}).join('');

	const commentsHtml = comments.length === 0 ? '<li>No comments yet.</li>' : comments.slice().reverse().map(comment => {
		const post = posts.find(p => p.id === comment.postId);
		return `<li><strong>${escapeHtml(comment.name)}</strong> on <a href="/post/${comment.postId}" class="quicklink">${escapeHtml(post?.title || 'Unknown')}</a><br><small style="color: #88ffaa;">${formatRelativeTime(comment.date)}</small><p style="margin: 5px 0;">${escapeHtml(comment.comment.substring(0, 100))}${comment.comment.length > 100 ? '...' : ''}</p><form method="POST" action="/admin/delete-comment/${comment.id}" style="display: inline;"><button type="submit" class="btn btn-delete" style="font-size: 0.7rem; padding: 3px 8px;">Delete</button></form></li>`;
	}).join('');

	const projectsHtml = projects.sort((a, b) => a.order - b.order).map(project => {
		return `<li><h3>${escapeHtml(project.title)}</h3><p style="margin: 5px 0; font-size: 0.9rem;">${escapeHtml(project.description)}</p><small style="color: #88ffaa;">Status: ${project.status === 'active' ? 'Active' : 'Coming Soon'} • Order: ${project.order}</small><div style="margin-top: 10px;"><a href="/admin/edit-project/${project.id}" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">Edit</a><form method="POST" action="/admin/delete-project/${project.id}" style="display: inline;"><button type="submit" class="btn btn-delete" style="font-size: 0.8rem; padding: 5px 10px;">Delete</button></form></div></li>`;
	}).join('');

	const content = `<div class="layout"><div class="main-col"><div class="card"><div class="titlebar"><div class="title"><span>Create New Post</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="POST" action="/admin/create"><div class="form-group"><label for="title">Post Title:</label><input type="text" id="title" name="title" required placeholder="Enter post title..." maxlength="200"></div><div class="form-group"><label for="body">Post Content:</label><textarea id="body" name="body" required placeholder="Write your post here..." maxlength="10000"></textarea></div><div class="form-group"><label for="status">Current Status (optional):</label><input type="text" id="status" name="status" placeholder="What are you working on?" maxlength="200"></div><button type="submit" class="btn">Create Post</button><button type="reset" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%);">Clear</button></form></div></div><div class="card" style="margin-top: 20px;"><div class="titlebar"><div class="title"><span>All Posts</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><ul class="post-list">${postsHtml}</ul></div></div><div class="card" style="margin-top: 20px;"><div class="titlebar"><div class="title"><span>Recent Comments</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><ul class="post-list">${commentsHtml}</ul></div></div></div><div class="side-col"><aside class="meta"><div class="panel"><h3>Dashboard Stats</h3><small><strong>Total Posts:</strong> ${posts.length}<br><strong>Total Comments:</strong> ${comments.length}<br><strong>Total Views:</strong> ${posts.reduce((sum, p) => sum + (p.views || 0), 0)}<br><strong>Total Projects:</strong> ${projects.length}</small></div><div class="panel"><h3>Quick links</h3><small><a href="/" class="quicklink">Home</a><br><a href="/projects" class="quicklink">Projects</a><br><a href="/admin/projects" class="quicklink">Manage Projects</a><br><a href="/admin/logout" class="quicklink">Logout</a></small></div></aside></div></div>`;
	res.send(pageLayout('Admin Panel', content));
});

// Admin Projects Management
app.get('/admin/projects', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const projects = await getProjects();
	
	const projectsHtml = projects.sort((a, b) => a.order - b.order).map(project => {
		return `<li><h3>${escapeHtml(project.title)}</h3><p style="margin: 5px 0; font-size: 0.9rem;">${escapeHtml(project.description)}</p><small style="color: #88ffaa;">URL: ${escapeHtml(project.url || 'None')} • Status: ${project.status === 'active' ? 'Active' : 'Coming Soon'} • Order: ${project.order}</small><div style="margin-top: 10px;"><a href="/admin/edit-project/${project.id}" class="btn" style="font-size: 0.8rem; padding: 5px 10px;">Edit</a><form method="POST" action="/admin/delete-project/${project.id}" style="display: inline;"><button type="submit" class="btn btn-delete" style="font-size: 0.8rem; padding: 5px 10px;">Delete</button></form></div></li>`;
	}).join('');

	const content = `<div class="layout"><div class="main-col"><div class="card"><div class="titlebar"><div class="title"><span>Create New Project</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="POST" action="/admin/create-project"><div class="form-group"><label for="title">Project Title:</label><input type="text" id="title" name="title" required placeholder="Enter project name..." maxlength="100"></div><div class="form-group"><label for="description">Description:</label><textarea id="description" name="description" required placeholder="Describe your project..." maxlength="500" rows="4"></textarea></div><div class="form-group"><label for="url">Project URL:</label><input type="text" id="url" name="url" placeholder="https://example.com or leave empty for coming soon" maxlength="200"></div><div class="form-group"><label for="status">Status:</label><select id="status" name="status" required><option value="active">Active</option><option value="coming_soon">Coming Soon</option></select></div><div class="form-group"><label for="order">Display Order:</label><input type="number" id="order" name="order" required placeholder="1, 2, 3..." min="1" value="${projects.length + 1}"></div><button type="submit" class="btn">Create Project</button><button type="reset" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%);">Clear</button></form></div></div><div class="card" style="margin-top: 20px;"><div class="titlebar"><div class="title"><span>All Projects</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><ul class="post-list">${projectsHtml}</ul></div></div></div><div class="side-col"><aside class="meta"><div class="panel"><h3>Quick Links</h3><small><a href="/admin/dashboard" class="quicklink">← Back to Dashboard</a><br><a href="/projects" class="quicklink">View Projects Page</a><br><a href="/admin/logout" class="quicklink">Logout</a></small></div></aside></div></div>`;
	res.send(pageLayout('Manage Projects', content));
});

// Create project
app.post('/admin/create-project', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const projects = await getProjects();
	const { title, description, url, status, order } = req.body;
	const newProject = {
		id: projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1,
		title: title.substring(0, 100),
		description: description.substring(0, 500),
		url: url.substring(0, 200),
		status: status,
		order: parseInt(order) || projects.length + 1
	};
	projects.push(newProject);
	await saveProjects(projects);
	res.redirect('/admin/projects');
});

// Edit project page
app.get('/admin/edit-project/:id', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const projects = await getProjects();
	const project = projects.find(p => p.id === parseInt(req.params.id));
	if (!project) return res.status(404).send('Project not found');
	
	const content = `<div class="card" style="max-width: 600px; margin: 0 auto;"><div class="titlebar"><div class="title"><span>Edit Project</span></div><div class="window-controls"><button class="min">–</button><button class="max">□</button><button class="close">×</button></div></div><div class="content-inner"><form method="POST" action="/admin/update-project/${project.id}"><div class="form-group"><label for="title">Project Title:</label><input type="text" id="title" name="title" required value="${escapeHtml(project.title)}" maxlength="100"></div><div class="form-group"><label for="description">Description:</label><textarea id="description" name="description" required maxlength="500" rows="4">${escapeHtml(project.description)}</textarea></div><div class="form-group"><label for="url">Project URL:</label><input type="text" id="url" name="url" value="${escapeHtml(project.url)}" maxlength="200"></div><div class="form-group"><label for="status">Status:</label><select id="status" name="status" required><option value="active" ${project.status === 'active' ? 'selected' : ''}>Active</option><option value="coming_soon" ${project.status === 'coming_soon' ? 'selected' : ''}>Coming Soon</option></select></div><div class="form-group"><label for="order">Display Order:</label><input type="number" id="order" name="order" required value="${project.order}" min="1"></div><button type="submit" class="btn">Update Project</button><a href="/admin/projects" class="btn" style="background: linear-gradient(180deg, #999 0%, #666 100%); text-decoration: none;">Cancel</a></form></div></div>`;
	res.send(pageLayout('Edit Project', content));
});

// Update project
app.post('/admin/update-project/:id', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const projects = await getProjects();
	const project = projects.find(p => p.id === parseInt(req.params.id));
	if (!project) return res.status(404).send('Project not found');
	
	const { title, description, url, status, order } = req.body;
	project.title = title.substring(0, 100);
	project.description = description.substring(0, 500);
	project.url = url.substring(0, 200);
	project.status = status;
	project.order = parseInt(order) || project.order;
	
	await saveProjects(projects);
	res.redirect('/admin/projects');
});

// Delete project
app.post('/admin/delete-project/:id', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const projects = await getProjects();
	const filtered = projects.filter(p => p.id !== parseInt(req.params.id));
	await saveProjects(filtered);
	res.redirect('/admin/projects');
});

// Create post
app.post('/admin/create', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const posts = await getPosts();
	const { title, body, status } = req.body;
	const newPost = {
		id: posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1,
		title: title.substring(0, 200),
		body: body.substring(0, 10000),
		date: new Date().toISOString(),
		status: status ? status.substring(0, 200) : '',
		views: 0
	};
	posts.push(newPost);
	await savePosts(posts);
	res.redirect('/admin/dashboard');
});

// Delete post
app.post('/admin/delete-post/:id', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const posts = await getPosts();
	const comments = await getComments();
	const filtered = posts.filter(p => p.id !== parseInt(req.params.id));
	const filteredComments = comments.filter(c => c.postId !== parseInt(req.params.id));
	await savePosts(filtered);
	await saveComments(filteredComments);
	res.redirect('/admin/dashboard');
});

// Delete comment
app.post('/admin/delete-comment/:id', async (req, res) => {
	if (!isAuthenticated(req)) return res.redirect('/admin');
	const comments = await getComments();
	const filtered = comments.filter(c => c.id !== parseInt(req.params.id));
	await saveComments(filtered);
	res.redirect('/admin/dashboard');
});

// Logout
app.get('/admin/logout', (req, res) => {
	const sessionId = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
	if (sessionId) sessions.delete(sessionId);
	res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
	res.redirect('/');
});

// Initialize and start
initFiles().then(() => {
	app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
