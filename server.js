const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Store blog posts in JSON file
const POSTS_FILE = path.join(__dirname, 'posts.json');

// Initialize posts file if it doesn't exist
async function initPosts() {
  try {
    await fs.access(POSTS_FILE);
  } catch {
    const initialPosts = [
      {
        id: 1,
        title: "First Post — So... Why This?",
        body: "I've had a bunch of half-finished projects sitting around forever, and instead of letting them rot in random folders, I figured I'd put them somewhere semi-presentable. This blog's basically just a dumping ground for whatever I'm building, breaking, or over-engineering at 3 AM.\n\nExpect a mix of code snippets, screenshots, and the occasional rant about why some library refuses to compile. I might also drop thoughts on design or random tech stuff if I feel like it.\n\nAnyway, if you somehow found this — hi. You're early. There's nothing here yet.",
        date: new Date().toISOString(),
        status: "Pretend this is something funny"
      }
    ];
    await fs.writeFile(POSTS_FILE, JSON.stringify(initialPosts, null, 2));
  }
}

// Get all posts
async function getPosts() {
  const data = await fs.readFile(POSTS_FILE, 'utf8');
  return JSON.parse(data);
}

// Save posts
async function savePosts(posts) {
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Routes
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    res.json(posts.reverse()); // newest first
  } catch (error) {
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const post = posts.find(p => p.id === parseInt(req.params.id));
    if (post) {
      res.json(post);
    } else {
      res.status(404).json({ error: 'Post not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load post' });
  }
});

app.post('/api/posts', async (req, res) => {
  try {
    const posts = await getPosts();
    const newPost = {
      id: posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1,
      title: req.body.title,
      body: req.body.body,
      date: new Date().toISOString(),
      status: req.body.status || ''
    };
    posts.push(newPost);
    await savePosts(posts);
    res.json(newPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const posts = await getPosts();
    const filtered = posts.filter(p => p.id !== parseInt(req.params.id));
    await savePosts(filtered);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Start server
initPosts().then(() => {
  app.listen(PORT, () => {
    console.log(`🌟 Blog server running on http://localhost:${PORT}`);
    console.log(`📝 Add new posts at http://localhost:${PORT}/admin.html`);
  });
});
