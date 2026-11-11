import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ConfigError, loadConfig } from './config';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

try {
  const config = loadConfig();
  root.render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
} catch (error) {
  console.error(JSON.stringify({ level: 'error', message: 'uce startup failed', error: String(error) }));
  root.render(
    <p role="alert">{error instanceof ConfigError ? 'This site is misconfigured. Please try again later.' : 'Something went wrong while starting.'}</p>,
  );
}
