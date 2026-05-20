import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import { DesignC } from '../src/designs/design-c/DesignC';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignC />
  </StrictMode>
);
