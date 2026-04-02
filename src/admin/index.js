import { createRoot } from '@wordpress/element';
import HandoffDashboard from './components/HandoffDashboard';
import './index.css';
import '../migration/index.css';

const root = document.getElementById('handoff-admin-root');
if (root) {
  createRoot(root).render(<HandoffDashboard />);
}
