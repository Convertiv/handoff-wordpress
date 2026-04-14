import { useState, useEffect, useCallback } from '@wordpress/element';
import {
  Button,
  TextControl,
  SelectControl,
  Spinner,
  Notice,
} from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import ImportRulesEditor from './ImportRulesEditor';

const configReadOnly =
  typeof window !== 'undefined' &&
  window.handoffAdmin &&
  !!window.handoffAdmin.configReadOnly;

const configSource =
  typeof window !== 'undefined' &&
  window.handoffAdmin &&
  window.handoffAdmin.configSource;

export default function SettingsTab() {
  const [config, setConfig] = useState(null);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch({ path: '/handoff/v1/config' }).then((data) => {
        if (data.groups && typeof data.groups === 'object' && !Array.isArray(data.groups) && Object.keys(data.groups).length === 0) {
          data.groups = {};
        }
        if (data.import && typeof data.import === 'object' && !Array.isArray(data.import) && Object.keys(data.import).length === 0) {
          data.import = {};
        }
        return data;
      }),
      apiFetch({ path: '/handoff/v1/themes' }).catch(() => []),
    ])
      .then(([configData, themeList]) => {
        setConfig(configData);
        setThemes(themeList);
      })
      .catch(() => setConfig({ apiUrl: '', themeDir: '', username: '', password: '', groups: {}, import: {} }))
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

  const themeOptions = themes.map((t) => ({
    label: t.active ? `${t.name} (active)` : t.name,
    value: t.path,
  }));

  return (
    <div style={{ padding: '16px 0' }}>
      {configReadOnly && (
        <Notice
          status="warning"
          isDismissible={false}
          style={{ marginBottom: 16 }}
        >
          Configuration is managed by <code>handoff-wp.config.json</code>. To
          make changes, update the config file and redeploy.
        </Notice>
      )}

      {!configReadOnly && configSource === 'json' && (
        <Notice
          status="info"
          isDismissible={false}
          style={{ marginBottom: 16 }}
        >
          Changes will be saved to both the database and{' '}
          <code>handoff-wp.config.json</code>.
        </Notice>
      )}

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
              disabled={configReadOnly}
            />
          </div>
          <div className="field-row">
            <TextControl
              label="Username"
              value={config?.username || ''}
              onChange={(val) => updateField('username', val)}
              help="Basic auth username (leave blank if none)."
              disabled={configReadOnly}
            />
          </div>
          <div className="field-row">
            <TextControl
              label="Password"
              type="password"
              value={config?.password || ''}
              onChange={(val) => updateField('password', val)}
              help="Basic auth password."
              disabled={configReadOnly}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Theme</h3>
          <div className="field-row">
            {themeOptions.length > 0 ? (
              <SelectControl
                label="Theme Directory"
                value={config?.themeDir || ''}
                options={themeOptions}
                onChange={(val) => updateField('themeDir', val)}
                help="Where compiled theme templates (header, footer, etc.) are written."
                __nextHasNoMarginBottom
                disabled={configReadOnly}
              />
            ) : (
              <TextControl
                label="Theme Directory"
                value={config?.themeDir || ''}
                onChange={(val) => updateField('themeDir', val)}
                help="Absolute path to the theme directory."
                disabled={configReadOnly}
              />
            )}
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
                disabled={configReadOnly}
              />
              {!configReadOnly && (
                <Button
                  variant="tertiary"
                  isDestructive
                  onClick={() => updateGroup(name, '__delete__')}
                  size="small"
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {!configReadOnly && (
            <Button variant="secondary" onClick={addGroup} size="small">
              + Add Group
            </Button>
          )}
        </div>

        <div className="form-section">
          <h3>Import Rules</h3>
          <ImportRulesEditor
            value={config?.import || {}}
            onChange={(updated) => updateField('import', updated)}
            disabled={configReadOnly}
          />
        </div>

        {!configReadOnly && (
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            isBusy={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        )}
      </div>
    </div>
  );
}
