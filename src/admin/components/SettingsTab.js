import { useState, useEffect, useCallback } from '@wordpress/element';
import {
  Button,
  TextControl,
  SelectControl,
  Spinner,
  Notice,
} from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

export default function SettingsTab() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    apiFetch({ path: '/handoff/v1/config' })
      .then(setConfig)
      .catch(() => setConfig({ apiUrl: '', output: './blocks', themeDir: './theme', username: '', password: '', groups: {}, import: {} }))
      .finally(() => setLoading(false));
  }, []);

  const updateField = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }, []);

  const updateGroup = useCallback((name, mode) => {
    setConfig((prev) => {
      const groups = { ...prev.groups };
      if (mode === '__delete__') {
        delete groups[name];
      } else {
        groups[name] = mode;
      }
      return { ...prev, groups };
    });
    setNotice(null);
  }, []);

  const addGroup = useCallback(() => {
    const name = prompt('Group name (e.g. Hero):');
    if (!name) return;
    updateGroup(name, 'merged');
  }, [updateGroup]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch({
        path: '/handoff/v1/config',
        method: 'POST',
        data: config,
      });
      if (res.success) {
        setNotice({ status: 'success', message: 'Settings saved.' });
      } else {
        setNotice({ status: 'error', message: res.error || 'Save failed.' });
      }
    } catch (err) {
      setNotice({
        status: 'error',
        message: err?.message || 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  }, [config]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const groups = config?.groups || {};

  return (
    <div style={{ padding: '16px 0' }}>
      {notice && (
        <Notice
          status={notice.status}
          isDismissible
          onDismiss={() => setNotice(null)}
          style={{ marginBottom: 16 }}
        >
          {notice.message}
        </Notice>
      )}

      <div className="handoff-settings-form">
        <div className="form-section">
          <h3>Connection</h3>
          <div className="field-row">
            <TextControl
              label="API URL"
              value={config?.apiUrl || ''}
              onChange={(val) => updateField('apiUrl', val)}
              help="The Handoff design system API URL."
            />
          </div>
          <div className="field-row">
            <TextControl
              label="Username"
              value={config?.username || ''}
              onChange={(val) => updateField('username', val)}
              help="Basic auth username (leave blank if none)."
            />
          </div>
          <div className="field-row">
            <TextControl
              label="Password"
              type="password"
              value={config?.password || ''}
              onChange={(val) => updateField('password', val)}
              help="Basic auth password."
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Paths</h3>
          <div className="field-row">
            <TextControl
              label="Output Directory"
              value={config?.output || ''}
              onChange={(val) => updateField('output', val)}
              help="Where compiled block source is written (relative to plugin root)."
            />
          </div>
          <div className="field-row">
            <TextControl
              label="Theme Directory"
              value={config?.themeDir || ''}
              onChange={(val) => updateField('themeDir', val)}
              help="Where theme templates are written (relative to plugin root)."
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Groups</h3>
          <p style={{ fontSize: 13, color: '#757575', marginTop: 0 }}>
            Configure how component groups are compiled. "Merged" groups
            combine all variants into a single block with WordPress variations.
          </p>
          {Object.entries(groups).map(([name, mode]) => (
            <div key={name} className="handoff-group-row">
              <TextControl
                value={name}
                disabled
                style={{ flex: 1 }}
              />
              <SelectControl
                value={mode}
                options={[
                  { label: 'Merged', value: 'merged' },
                  { label: 'Individual', value: 'individual' },
                ]}
                onChange={(val) => updateGroup(name, val)}
                __nextHasNoMarginBottom
              />
              <Button
                variant="tertiary"
                isDestructive
                onClick={() => updateGroup(name, '__delete__')}
                size="small"
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={addGroup} size="small">
            + Add Group
          </Button>
        </div>

        <div className="form-section">
          <h3>Import Rules</h3>
          <p style={{ fontSize: 13, color: '#757575', marginTop: 0 }}>
            The full import configuration is stored in the config file.
            For complex import rules (dynamic arrays, field mappings), edit{' '}
            <code>handoff-wp.config.json</code> directly or use{' '}
            <code>wp handoff wizard</code>.
          </p>
          <pre
            style={{
              background: '#f9f9f9',
              border: '1px solid #ddd',
              borderRadius: 4,
              padding: 12,
              fontSize: 12,
              maxHeight: 300,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(config?.import || {}, null, 2)}
          </pre>
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          isBusy={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
