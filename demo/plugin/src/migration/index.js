/**
 * Handoff Migration Admin Page
 *
 * React entry point rendered into #handoff-migration-root.
 */

import { createRoot } from '@wordpress/element';
import MigrationApp from './components/MigrationApp';
import './index.css';

const root = document.getElementById('handoff-migration-root');
if (root) {
  createRoot(root).render(<MigrationApp />);
}
