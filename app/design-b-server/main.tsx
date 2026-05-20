import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import { DesignB } from '../src/designs/design-b/DesignB';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignB />
  </StrictMode>
);
