// server.js
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

// Initialize SQLite DB
const db = new sqlite3.Database('./userauthentication.db', (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to the users SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'user'
)`);

app.use(cors({ origin: 'http://localhost:3001', credentials: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: false
}));

// Register (default role: user)
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (row) return res.status(400).json({ message: 'User already exists' });
    const hashed = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashed, role || 'user'], (err) => {
      if (err) return res.status(500).json({ message: 'DB error during insert' });
      res.json({ message: 'Registered successfully' });
    });
  });
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    req.session.user = { username: user.username, role: user.role };
    res.json({ message: 'Login successful' });
  });
});

// Middleware to check login
function isAuthenticated(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

// Middleware to check admin role
function isAdmin(req, res, next) {
  if (req.session.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden: Admins only' });
  next();
}

// Protected route for any logged-in user
app.get('/protected', isAuthenticated, (req, res) => {
  res.json({ message: `Hello ${req.session.user.username}, welcome to protected route!` });
});

// Admin-only route
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  res.json({ message: `Welcome Admin ${req.session.user.username}` });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
