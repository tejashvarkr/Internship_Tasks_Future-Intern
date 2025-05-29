// App.jsx
import React, { useState } from 'react';
import axios from 'axios';
import './App.css';  // import the CSS here

axios.defaults.withCredentials = true;

export default function App() {
  const [view, setView] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [message, setMessage] = useState('');

  const handleRegister = async () => {
    try {
      const res = await axios.post('http://localhost:3000/register', { username, password, role });
      setMessage(res.data.message);
    } catch (e) {
      setMessage(e.response?.data?.message || 'Registration error');
    }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post('http://localhost:3000/login', { username, password });
      setMessage(res.data.message);
    } catch (e) {
      setMessage(e.response?.data?.message || 'Login error');
    }
  };

  const handleProtected = async () => {
    try {
      const res = await axios.get('http://localhost:3000/protected');
      setMessage(res.data.message);
    } catch (e) {
      setMessage(e.response?.data?.message || 'Access denied');
    }
  };

  const handleAdmin = async () => {
    try {
      const res = await axios.get('http://localhost:3000/admin');
      setMessage(res.data.message);
    } catch (e) {
      setMessage(e.response?.data?.message || 'Admin access denied');
    }
  };

  const handleLogout = async () => {
    const res = await axios.get('http://localhost:3000/logout');
    setMessage(res.data.message);
  };

 
    return (
  <div className="app-container">
    <h1>{view === 'login' ? 'Login' : 'Register'}</h1>
    <input placeholder="Username" onChange={e => setUsername(e.target.value)} />
    <input placeholder="Password" type="password" onChange={e => setPassword(e.target.value)} />
    {view === 'register' && (
      <select onChange={e => setRole(e.target.value)}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
    )}
    <button
      className={view === 'login' ? 'login-btn' : 'register-btn'}
      onClick={view === 'login' ? handleLogin : handleRegister}
    >
      {view === 'login' ? 'Login' : 'Register'}
    </button>

    <div className="toggle-buttons">
      <button onClick={() => setView('login')}>Go to Login</button>
      <button onClick={() => setView('register')}>Go to Register</button>
    </div>

    <button className="login-btn" onClick={handleProtected}>Access Protected</button>
    <button className="admin-btn" onClick={handleAdmin}>Access Admin</button>
    <button className="logout-btn" onClick={handleLogout}>Logout</button>

    <div className="message">{message}</div>
  </div>
);
}
