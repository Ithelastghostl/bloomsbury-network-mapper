import './styles/tokens.css';
import { DesignA } from './designs/design-a/DesignA';
import { DesignB } from './designs/design-b/DesignB';
import { DesignC } from './designs/design-c/DesignC';

// Switch between designs via URL hash: #a, #b, #c
// Default: #a (pipeline)
function getDesign(): 'a' | 'b' | 'c' {
  const hash = window.location.hash.toLowerCase();
  if (hash === '#b') return 'b';
  if (hash === '#c') return 'c';
  return 'a';
}

const design = getDesign();

export default function App() {
  if (design === 'b') return <DesignB />;
  if (design === 'c') return <DesignC />;
  return <DesignA />;
}
