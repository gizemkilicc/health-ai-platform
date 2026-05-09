const express = require('express');
const cors = require('cors');
const db = require('./db/database');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 5000;
const SECRET_KEY = 'healthai_secret_key_123'; // Simple secret for demo

app.use(cors({
  origin: [
    'https://health-ai-platform-1.onrender.com',
    'http://localhost:5173'
  ],
  credentials: true
}));
app.use(express.json());

// Request Logger (Kullanıcının terminalde istekleri görebilmesi için)
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Helpers
const generateId = (prefix) => prefix + '_' + Date.now() + Math.random().toString(36).substring(2, 9);

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req, res) => {
  const { email, password, role, name, domain, university } = req.body;
  if (!email.toLowerCase().endsWith('.edu')) {
    return res.status(400).json({ error: 'Registration is restricted to institutional .edu email addresses only.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], (err, row) => {
    if (row) return res.status(400).json({ error: 'Email is already registered.' });

    const id = generateId('user');
    db.run(
      `INSERT INTO users (id, email, password, role, name, domain, university, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, email, password, role, name, domain || '', university || '', 1, new Date().toISOString()],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id, email, role, name, domain: domain || '', university: university || '', isActive: true });
      }
    );
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email.toLowerCase(), password], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is suspended. Please contact admin.' });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
    const { password: _, ...safeUser } = user;
    
    // Convert isActive from 1/0 to boolean
    safeUser.isActive = safeUser.isActive === 1;

    res.json({ user: safeUser, token });
  });
});

// Middleware for auth
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// --- POST ROUTES ---
app.post('/api/posts', authenticate, (req, res) => {
  const id = generateId('post');
  const { title, domain, shortExplanation, highLevelIdea, desiredExpertise, commitmentLevel, projectStage, country, city, confidentialityLevel, expiryDate, autoClose } = req.body;
  
  db.run(
    `INSERT INTO posts (id, title, domain, shortExplanation, highLevelIdea, desiredExpertise, commitmentLevel, projectStage, country, city, confidentialityLevel, expiryDate, autoClose, authorId, authorRole, status, createdAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, domain, shortExplanation, highLevelIdea, desiredExpertise, commitmentLevel, projectStage, country, city, confidentialityLevel, expiryDate, autoClose ? 1 : 0, req.user.id, req.user.role, 'Active', new Date().toISOString()],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id, ...req.body, authorId: req.user.id, authorRole: req.user.role, status: 'Active' });
    }
  );
});

app.get('/api/posts', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const query = `
    SELECT p.*, u.name as authorName 
    FROM posts p 
    LEFT JOIN users u ON p.authorId = u.id 
    ORDER BY p.createdAt DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // Convert autoClose to boolean
    const posts = rows.map(r => ({ ...r, autoClose: r.autoClose === 1 }));
    res.json(posts);
  });
});
app.put('/api/posts/:id', authenticate, (req, res) => {
  const { title, domain, shortExplanation, highLevelIdea, desiredExpertise, commitmentLevel, projectStage, country, city, confidentialityLevel, expiryDate, autoClose } = req.body;
  
  db.run(
    `UPDATE posts SET title = ?, domain = ?, shortExplanation = ?, highLevelIdea = ?, desiredExpertise = ?, commitmentLevel = ?, projectStage = ?, country = ?, city = ?, confidentialityLevel = ?, expiryDate = ?, autoClose = ? WHERE id = ? AND authorId = ?`,
    [title, domain, shortExplanation, highLevelIdea, desiredExpertise, commitmentLevel, projectStage, country, city, confidentialityLevel, expiryDate, autoClose ? 1 : 0, req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(403).json({ error: 'Unauthorized or post not found' });
      res.json({ id: req.params.id, ...req.body });
    }
  );
});

app.put('/api/posts/:id/status', authenticate, (req, res) => {
  const { status } = req.body;
  db.run('UPDATE posts SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, status });
  });
});

app.delete('/api/posts/:id', authenticate, (req, res) => {
  if (req.user.role === 'Admin') {
    db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } else {
    db.run('DELETE FROM posts WHERE id = ? AND authorId = ?', [req.params.id, req.user.id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(403).json({ error: 'Unauthorized or post not found' });
      res.json({ success: true });
    });
  }
});

// --- MEETINGS ROUTES ---
app.post('/api/meetings', authenticate, (req, res) => {
  const id = generateId('meeting');
  const { postId, receiverId, message, proposedDate } = req.body;
  db.run(
    `INSERT INTO meetings (id, postId, requesterId, requesterRole, receiverId, message, proposedDate, status, createdAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, postId, req.user.id, req.user.role, receiverId, message, proposedDate, 'Pending', new Date().toISOString()],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id, status: 'Pending' });
    }
  );
});

app.get('/api/meetings', authenticate, (req, res) => {
  const query = `
    SELECT m.*, u.name as requesterName, u.domain as requesterDomain 
    FROM meetings m 
    LEFT JOIN users u ON m.requesterId = u.id 
    WHERE m.requesterId = ? OR m.receiverId = ? 
    ORDER BY m.createdAt DESC
  `;
  db.all(query, [req.user.id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/meetings/:id/status', authenticate, (req, res) => {
  const { status, proposedTime } = req.body;
  let query = 'UPDATE meetings SET status = ?, isRead = 0 WHERE id = ?';
  let params = [status, req.params.id];
  
  if (proposedTime) {
    query = 'UPDATE meetings SET status = ?, proposedTime = ?, isRead = 0 WHERE id = ?';
    params = [status, proposedTime, req.params.id];
  }

  db.run(query, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, status, proposedTime });
  });
});

app.put('/api/meetings/:id/read', authenticate, (req, res) => {
  db.run('UPDATE meetings SET isRead = 1 WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, isRead: 1 });
  });
});

// --- AUDIT LOGS ROUTES ---
app.post('/api/logs', (req, res) => {
  const id = generateId('log');
  const { userId, role, actionType, targetEntity, resultStatus, additionalData } = req.body;
  db.run(
    `INSERT INTO logs (id, timestamp, userId, role, actionType, targetEntity, resultStatus, additionalData) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, new Date().toISOString(), userId, role, actionType, targetEntity, resultStatus, JSON.stringify(additionalData || {})],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id });
    }
  );
});

app.get('/api/logs', authenticate, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
  db.all('SELECT * FROM logs ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- USER ROUTES (PROFILE) ---
app.get('/api/users', authenticate, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
  db.all('SELECT id, email, role, name, university, domain, isActive, createdAt FROM users ORDER BY createdAt DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const users = rows.map(r => ({ ...r, isActive: r.isActive === 1 }));
    res.json(users);
  });
});

app.put('/api/users/:id/status', authenticate, (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
  const { isActive } = req.body;
  db.run('UPDATE users SET isActive = ? WHERE id = ?', [isActive ? 1 : 0, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, isActive });
  });
});

app.put('/api/users/me', authenticate, (req, res) => {
  const { name, university, domain } = req.body;
  db.run(
    `UPDATE users SET name = ?, university = ?, domain = ? WHERE id = ?`,
    [name, university, domain, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, name, university, domain });
    }
  );
});

app.get('/api/users/me/export', authenticate, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    db.all('SELECT * FROM posts WHERE authorId = ?', [req.user.id], (err, posts) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.all('SELECT * FROM meetings WHERE requesterId = ? OR receiverId = ?', [req.user.id, req.user.id], (err, meetings) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const { password, ...safeUser } = user;
        res.json({
          user: safeUser,
          posts,
          meetings
        });
      });
    });
  });
});

app.delete('/api/users/me', authenticate, (req, res) => {
  const userId = req.user.id;
  // Delete user
  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    // Delete their posts
    db.run('DELETE FROM posts WHERE authorId = ?', [userId], function(err) {
      if (err) console.error("Error deleting posts:", err.message);
      
      // Delete their meetings
      db.run('DELETE FROM meetings WHERE requesterId = ? OR receiverId = ?', [userId, userId], function(err) {
        if (err) console.error("Error deleting meetings:", err.message);
        
        res.json({ success: true });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
