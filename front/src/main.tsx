import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/geist'; // brand font (Geist), self-hosted, with Cyrillic support
import { App } from './app/App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
