import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import { DesignA } from '../src/designs/design-a/DesignA';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignA />
  </StrictMode>
);
