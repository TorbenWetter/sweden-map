import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import App from './App';
import { PrintPage } from './export/PrintPage';

const isPrint = new URLSearchParams(window.location.search).has('print');

createRoot(document.getElementById('root')!).render(isPrint ? <PrintPage /> : <App />);
