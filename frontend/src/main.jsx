import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SidebarProvider } from './context/SidebarContext';
import { Toaster } from 'react-hot-toast';
import './index.css';
import './i18n/index.js';
import App from './App.jsx';

localStorage.setItem('token', 'mock-token-123');
localStorage.setItem('user', JSON.stringify({ name
  : 'Test User', email: 'test@test.com', role: 'user', isProfileComplete: true }));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <Router>
        <ThemeProvider>
          <SidebarProvider>
            <AuthProvider>
              <App />
              <Toaster position='top-center' toastOptions={{ duration: 3000 }} />
            </AuthProvider>
          </SidebarProvider>
        </ThemeProvider>
      </Router>
    </HelmetProvider>
  </StrictMode>
);