import { useMemo } from '@wordpress/element';
import { TabPanel } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import BlocksTab from './BlocksTab';
import SettingsTab from './SettingsTab';
import MigrationApp from '../../migration/components/MigrationApp';

const canManageOptions =
  typeof window !== 'undefined' &&
  window.handoffAdmin &&
  window.handoffAdmin.canManageOptions;

export default function HandoffDashboard() {
  const tabs = useMemo(() => {
    const list = [
      { name: 'blocks', title: __('Blocks', 'handoff'), className: 'handoff-tab' },
      { name: 'migration', title: __('Migration', 'handoff'), className: 'handoff-tab' },
    ];
    if (canManageOptions) {
      list.push({ name: 'settings', title: __('Settings', 'handoff'), className: 'handoff-tab' });
    }
    return list;
  }, []);

  return (
    <div className="handoff-dashboard">
      <h1>{__('Handoff', 'handoff')}</h1>
      <p className="handoff-dashboard__intro">
        {__(
          'Block library overview, content migration, and plugin settings.',
          'handoff'
        )}
      </p>
      <TabPanel className="handoff-dashboard__tabs" tabs={tabs}>
        {(tab) => {
          switch (tab.name) {
            case 'blocks':
              return <BlocksTab />;
            case 'migration':
              return <MigrationApp embedded />;
            case 'settings':
              return canManageOptions ? <SettingsTab /> : null;
            default:
              return null;
          }
        }}
      </TabPanel>
    </div>
  );
}
