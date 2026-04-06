import { useState, useEffect, useCallback, useMemo } from '@wordpress/element';
import {
  Button,
  Spinner,
  Notice,
  ToggleControl,
  SelectControl,
  TextControl,
  PanelBody,
  PanelRow,
  CheckboxControl,
} from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';

const ARRAY_TYPE_OPTIONS = [
  { label: 'None (static repeater)', value: '' },
  { label: 'Dynamic Posts', value: 'posts' },
  { label: 'Breadcrumbs', value: 'breadcrumbs' },
  { label: 'Taxonomy', value: 'taxonomy' },
  { label: 'Pagination', value: 'pagination' },
];

const SELECTION_MODE_OPTIONS = [
  { label: 'Query Builder', value: 'query' },
  { label: 'Manual Selection', value: 'manual' },
];

const RENDER_MODE_OPTIONS = [
  { label: 'Field Mapping', value: 'mapped' },
  { label: 'PHP Template', value: 'template' },
];

const ORDERBY_OPTIONS = [
  { label: 'Date', value: 'date' },
  { label: 'Title', value: 'title' },
  { label: 'Modified', value: 'modified' },
  { label: 'Menu Order', value: 'menu_order' },
  { label: 'Random', value: 'rand' },
  { label: 'Comment Count', value: 'comment_count' },
  { label: 'ID', value: 'ID' },
];

const ORDER_OPTIONS = [
  { label: 'Descending', value: 'DESC' },
  { label: 'Ascending', value: 'ASC' },
];

const FIELD_MAPPING_TYPES = [
  { label: '-- Not mapped --', value: '' },
  { label: 'Post Title', value: 'post_title' },
  { label: 'Post Excerpt', value: 'post_excerpt' },
  { label: 'Post Content', value: 'post_content' },
  { label: 'Permalink', value: 'permalink' },
  { label: 'Featured Image', value: 'featured_image' },
  { label: 'Date', value: 'post_date' },
  { label: 'Date (Day)', value: 'post_date:day' },
  { label: 'Date (Month)', value: 'post_date:month_short' },
  { label: 'Date (Year)', value: 'post_date:year' },
  { label: 'Author Name', value: 'author.name' },
  { label: 'Author URL', value: 'author.url' },
  { label: 'Author Avatar', value: 'author.avatar' },
  { label: 'Static Value', value: '__static__' },
  { label: 'Manual (user-editable)', value: '__manual__' },
];

function getArrayTypeFromConfig(config) {
  if (!config || typeof config !== 'object') return '';
  if (config.arrayType === 'breadcrumbs') return 'breadcrumbs';
  if (config.arrayType === 'taxonomy') return 'taxonomy';
  if (config.arrayType === 'pagination') return 'pagination';
  if (config.enabled !== undefined || config.postTypes || config.renderMode) return 'posts';
  return '';
}

function buildConfigFromArrayType(type, existing, component, fieldName) {
  switch (type) {
    case 'posts':
      return {
        enabled: true,
        postTypes: existing?.postTypes || ['post', 'page'],
        selectionMode: existing?.selectionMode || 'query',
        maxItems: existing?.maxItems || 12,
        renderMode: existing?.renderMode || 'mapped',
        fieldMapping: existing?.fieldMapping || {},
        defaultQueryArgs: existing?.defaultQueryArgs || {
          posts_per_page: 6,
          orderby: 'date',
          order: 'DESC',
        },
      };
    case 'breadcrumbs':
      return { arrayType: 'breadcrumbs' };
    case 'taxonomy':
      return {
        arrayType: 'taxonomy',
        taxonomies: existing?.taxonomies || ['post_tag'],
        maxItems: existing?.maxItems || 3,
      };
    case 'pagination':
      return {
        arrayType: 'pagination',
        connectedField: existing?.connectedField || '',
      };
    default:
      return undefined;
  }
}

function fieldMappingValueToSelectValue(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val.type === 'static') return '__static__';
  if (val.type === 'manual') return '__manual__';
  if (val.type === 'taxonomy') return `taxonomy:${val.taxonomy}`;
  return '';
}

function selectValueToFieldMappingValue(selectVal, existingVal) {
  if (!selectVal) return undefined;
  if (selectVal === '__static__') {
    return { type: 'static', value: existingVal?.value || '' };
  }
  if (selectVal === '__manual__') {
    return { type: 'manual', value: existingVal?.value || '' };
  }
  return selectVal;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldMappingRow({ fieldKey, fieldDef, value, onChange, taxonomyOptions }) {
  const selectVal = fieldMappingValueToSelectValue(value);
  const isStatic = selectVal === '__static__';
  const isManual = selectVal === '__manual__';

  const options = [...FIELD_MAPPING_TYPES];
  if (taxonomyOptions.length > 0) {
    taxonomyOptions.forEach((t) => {
      options.push({ label: `Taxonomy: ${t.label}`, value: `taxonomy:${t.name}` });
    });
  }

  return (
    <div className="handoff-field-mapping-row">
      <div className="mapping-field-name">
        <code>{fieldKey}</code>
        <span className="mapping-field-type">{fieldDef?.type || 'text'}</span>
      </div>
      <div className="mapping-field-value">
        <SelectControl
          value={selectVal}
          options={options}
          onChange={(val) => onChange(fieldKey, selectValueToFieldMappingValue(val, value))}
          __nextHasNoMarginBottom
        />
        {(isStatic || isManual) && (
          <TextControl
            placeholder={isStatic ? 'Static value...' : 'Default value...'}
            value={typeof value === 'object' ? value.value || '' : ''}
            onChange={(v) =>
              onChange(fieldKey, { type: isStatic ? 'static' : 'manual', value: v })
            }
          />
        )}
      </div>
    </div>
  );
}

function DynamicPostsPanel({ config, onChange, itemProperties, taxonomyOptions }) {
  const fieldMapping = config.fieldMapping || {};
  const queryArgs = config.defaultQueryArgs || {};

  const updateField = (key, val) => onChange({ ...config, [key]: val });
  const updateQueryArg = (key, val) => {
    onChange({ ...config, defaultQueryArgs: { ...queryArgs, [key]: val } });
  };
  const updateMapping = (fieldKey, val) => {
    const updated = { ...fieldMapping };
    if (val === undefined) {
      delete updated[fieldKey];
    } else {
      updated[fieldKey] = val;
    }
    onChange({ ...config, fieldMapping: updated });
  };

  return (
    <div className="handoff-dynamic-posts-panel">
      <div className="panel-grid">
        <TextControl
          label="Post Types"
          help="Comma-separated list (e.g. post,page,event)"
          value={(config.postTypes || []).join(',')}
          onChange={(val) =>
            updateField('postTypes', val.split(',').map((s) => s.trim()).filter(Boolean))
          }
        />
        <SelectControl
          label="Selection Mode"
          value={config.selectionMode || 'query'}
          options={SELECTION_MODE_OPTIONS}
          onChange={(val) => updateField('selectionMode', val)}
          __nextHasNoMarginBottom
        />
        <TextControl
          label="Max Items"
          type="number"
          value={String(config.maxItems || 12)}
          onChange={(val) => updateField('maxItems', parseInt(val, 10) || 12)}
        />
        <SelectControl
          label="Render Mode"
          value={config.renderMode || 'mapped'}
          options={RENDER_MODE_OPTIONS}
          onChange={(val) => updateField('renderMode', val)}
          __nextHasNoMarginBottom
        />
      </div>

      <h4>Default Query Arguments</h4>
      <div className="panel-grid">
        <TextControl
          label="Posts per Page"
          type="number"
          value={String(queryArgs.posts_per_page ?? 6)}
          onChange={(val) => updateQueryArg('posts_per_page', parseInt(val, 10) || 6)}
        />
        <SelectControl
          label="Order By"
          value={queryArgs.orderby || 'date'}
          options={ORDERBY_OPTIONS}
          onChange={(val) => updateQueryArg('orderby', val)}
          __nextHasNoMarginBottom
        />
        <SelectControl
          label="Order"
          value={queryArgs.order || 'DESC'}
          options={ORDER_OPTIONS}
          onChange={(val) => updateQueryArg('order', val)}
          __nextHasNoMarginBottom
        />
      </div>

      {config.renderMode === 'mapped' && Object.keys(itemProperties).length > 0 && (
        <>
          <h4>Field Mapping</h4>
          <p className="help-text">
            Map each array item property to a WordPress post field.
          </p>
          <div className="handoff-field-mapping-table">
            {Object.entries(itemProperties).map(([key, def]) => (
              <FieldMappingRow
                key={key}
                fieldKey={key}
                fieldDef={def}
                value={fieldMapping[key]}
                onChange={updateMapping}
                taxonomyOptions={taxonomyOptions}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TaxonomyPanel({ config, onChange, taxonomyOptions }) {
  return (
    <div className="handoff-taxonomy-panel">
      <div className="panel-grid">
        <SelectControl
          label="Taxonomy"
          value={(config.taxonomies || [])[0] || 'post_tag'}
          options={[
            { label: 'Tags', value: 'post_tag' },
            { label: 'Categories', value: 'category' },
            ...taxonomyOptions
              .filter((t) => t.name !== 'post_tag' && t.name !== 'category')
              .map((t) => ({ label: t.label, value: t.name })),
          ]}
          onChange={(val) => onChange({ ...config, taxonomies: [val] })}
          __nextHasNoMarginBottom
        />
        <TextControl
          label="Max Items"
          type="number"
          value={String(config.maxItems ?? 3)}
          onChange={(val) => onChange({ ...config, maxItems: parseInt(val, 10) || 3 })}
        />
      </div>
    </div>
  );
}

function PaginationPanel({ config, onChange, dynamicPostFields }) {
  const options = [
    { label: '-- Select connected field --', value: '' },
    ...dynamicPostFields.map((f) => ({ label: f, value: f })),
  ];

  return (
    <div className="handoff-pagination-panel">
      <SelectControl
        label="Connected Dynamic Posts Field"
        value={config.connectedField || ''}
        options={options}
        onChange={(val) => onChange({ ...config, connectedField: val })}
        help="The array field whose query results drive pagination."
        __nextHasNoMarginBottom
      />
    </div>
  );
}

function ArrayFieldEditor({
  fieldName,
  fieldDef,
  config,
  onChange,
  taxonomyOptions,
  dynamicPostFields,
}) {
  const arrayType = getArrayTypeFromConfig(config);
  const itemProperties = fieldDef?.items?.properties || {};

  const handleTypeChange = (val) => {
    if (!val) {
      onChange(fieldName, undefined);
    } else {
      onChange(fieldName, buildConfigFromArrayType(val, config, null, fieldName));
    }
  };

  return (
    <div className="handoff-array-field-editor">
      <div className="array-field-header">
        <code>{fieldName}</code>
        <SelectControl
          value={arrayType}
          options={ARRAY_TYPE_OPTIONS}
          onChange={handleTypeChange}
          __nextHasNoMarginBottom
        />
      </div>

      {arrayType === 'posts' && config && (
        <DynamicPostsPanel
          config={config}
          onChange={(updated) => onChange(fieldName, updated)}
          itemProperties={itemProperties}
          taxonomyOptions={taxonomyOptions}
        />
      )}

      {arrayType === 'taxonomy' && config && (
        <TaxonomyPanel
          config={config}
          onChange={(updated) => onChange(fieldName, updated)}
          taxonomyOptions={taxonomyOptions}
        />
      )}

      {arrayType === 'pagination' && config && (
        <PaginationPanel
          config={config}
          onChange={(updated) => onChange(fieldName, updated)}
          dynamicPostFields={dynamicPostFields}
        />
      )}
    </div>
  );
}

function ComponentRow({ component, importConfig, typeKey, onChangeImport, taxonomyOptions }) {
  const typeConfig = importConfig[typeKey];
  const compConfig =
    typeConfig && typeof typeConfig === 'object' ? typeConfig[component.id] : undefined;

  const isSkipped = compConfig === false;
  const hasOverrides = typeof compConfig === 'object' && compConfig !== null;

  const arrayFields = useMemo(() => {
    return Object.entries(component.properties || {}).filter(([, p]) => p.type === 'array');
  }, [component.properties]);

  const hasArrays = arrayFields.length > 0;
  const [expanded, setExpanded] = useState(false);

  const handleToggle = (checked) => {
    if (!checked) {
      onChangeImport(typeKey, component.id, false);
    } else {
      onChangeImport(typeKey, component.id, undefined);
    }
  };

  const handleFieldChange = (fieldName, fieldConfig) => {
    const current = typeof compConfig === 'object' && compConfig ? { ...compConfig } : {};
    if (fieldConfig === undefined) {
      delete current[fieldName];
    } else {
      current[fieldName] = fieldConfig;
    }
    if (Object.keys(current).length === 0) {
      onChangeImport(typeKey, component.id, undefined);
    } else {
      onChangeImport(typeKey, component.id, current);
    }
  };

  const handleReset = () => {
    onChangeImport(typeKey, component.id, undefined);
  };

  const dynamicPostFields = useMemo(() => {
    if (!hasOverrides) return [];
    return Object.entries(compConfig)
      .filter(([, cfg]) => cfg && typeof cfg === 'object' && getArrayTypeFromConfig(cfg) === 'posts')
      .map(([key]) => key);
  }, [compConfig, hasOverrides]);

  return (
    <div className={`handoff-component-row ${isSkipped ? 'is-skipped' : ''}`}>
      <div className="component-row-main">
        <ToggleControl
          checked={!isSkipped}
          onChange={handleToggle}
          __nextHasNoMarginBottom
        />
        <div className="component-info">
          <span className="component-title">{component.title}</span>
          <code className="component-id">{component.id}</code>
          {component.group && (
            <span className="component-group-badge">{component.group}</span>
          )}
        </div>
        <div className="component-actions">
          {hasOverrides && (
            <Button variant="link" isDestructive size="small" onClick={handleReset}>
              Reset
            </Button>
          )}
          {hasArrays && !isSkipped && (
            <Button
              variant="tertiary"
              size="small"
              onClick={() => setExpanded(!expanded)}
              className={expanded ? 'is-active' : ''}
            >
              {expanded ? 'Close' : 'Configure'}
            </Button>
          )}
        </div>
      </div>

      {expanded && !isSkipped && hasArrays && (
        <div className="component-row-detail">
          {component.screenshotUrl && (
            <div className="component-row-screenshot">
              <img src={component.screenshotUrl} alt={component.title} />
            </div>
          )}
          <div className="component-row-config">
            <h4>Array Fields</h4>
            {arrayFields.map(([key, def]) => (
              <ArrayFieldEditor
                key={key}
                fieldName={key}
                fieldDef={def}
                config={hasOverrides ? compConfig[key] : undefined}
                onChange={handleFieldChange}
                taxonomyOptions={taxonomyOptions}
                dynamicPostFields={dynamicPostFields}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeSection({ typeKey, components, importConfig, onChangeImport, taxonomyOptions }) {
  const typeConfig = importConfig[typeKey];
  const isDisabled = typeConfig === false;
  const [expanded, setExpanded] = useState(!isDisabled);

  const handleTypeToggle = (checked) => {
    if (!checked) {
      onChangeImport(typeKey, null, false);
    } else {
      onChangeImport(typeKey, null, undefined);
    }
  };

  const configuredCount = useMemo(() => {
    if (!typeConfig || typeof typeConfig !== 'object') return 0;
    return Object.entries(typeConfig).filter(
      ([, v]) => v === false || (typeof v === 'object' && v !== null)
    ).length;
  }, [typeConfig]);

  return (
    <div className={`handoff-type-section ${isDisabled ? 'is-disabled' : ''}`}>
      <div className="type-section-header" onClick={() => setExpanded(!expanded)}>
        <span className={`type-toggle-arrow ${expanded ? 'is-open' : ''}`}>&#9656;</span>
        <span className="type-name">{typeKey}</span>
        <span className="type-count">{components.length} components</span>
        {configuredCount > 0 && (
          <span className="type-configured">{configuredCount} customized</span>
        )}
        <div className="type-toggle" onClick={(e) => e.stopPropagation()}>
          <ToggleControl
            checked={!isDisabled}
            onChange={handleTypeToggle}
            __nextHasNoMarginBottom
          />
        </div>
      </div>

      {expanded && !isDisabled && (
        <div className="type-section-body">
          {components.map((comp) => (
            <ComponentRow
              key={comp.id}
              component={comp}
              importConfig={importConfig}
              typeKey={typeKey}
              onChangeImport={onChangeImport}
              taxonomyOptions={taxonomyOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ImportRulesEditor({ value, onChange }) {
  const [components, setComponents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [taxonomyOptions, setTaxonomyOptions] = useState([]);

  useEffect(() => {
    Promise.all([
      apiFetch({ path: '/handoff/v1/remote-components' }),
      apiFetch({ path: '/handoff/v1/taxonomies/post' }).catch(() => []),
    ])
      .then(([data, taxonomies]) => {
        setComponents(data.components || []);
        setTaxonomyOptions(taxonomies || []);
      })
      .catch((err) => {
        if (err?.data?.error) {
          setError(err.data.error);
        } else {
          setError(err?.message || 'Failed to fetch components from the Handoff API.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch({ path: '/handoff/v1/remote-components?refresh=1' })
      .then((data) => setComponents(data.components || []))
      .catch((err) =>
        setError(err?.data?.error || err?.message || 'Failed to refresh components.')
      )
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    if (!components) return {};
    const map = {};
    for (const c of components) {
      const t = c.type || 'block';
      if (!map[t]) map[t] = [];
      map[t].push(c);
    }
    return map;
  }, [components]);

  const importConfig = value && typeof value === 'object' ? value : {};

  const handleChangeImport = useCallback(
    (typeKey, componentId, newValue) => {
      const updated = { ...importConfig };

      if (componentId === null) {
        if (newValue === undefined) {
          delete updated[typeKey];
        } else {
          updated[typeKey] = newValue;
        }
      } else {
        let typeConfig = updated[typeKey];
        if (typeConfig === false || typeConfig === true || typeConfig === undefined) {
          typeConfig = {};
        } else {
          typeConfig = { ...typeConfig };
        }
        if (newValue === undefined) {
          delete typeConfig[componentId];
        } else {
          typeConfig[componentId] = newValue;
        }
        if (Object.keys(typeConfig).length === 0) {
          delete updated[typeKey];
        } else {
          updated[typeKey] = typeConfig;
        }
      }

      onChange(updated);
    },
    [importConfig, onChange]
  );

  if (loading) {
    return (
      <div className="handoff-import-editor-loading">
        <Spinner />
        <span>Loading components from Handoff API...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Notice status="error" isDismissible={false}>
        {error}
        <br />
        <Button variant="link" onClick={handleRefresh} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </Notice>
    );
  }

  if (!components || components.length === 0) {
    return (
      <Notice status="warning" isDismissible={false}>
        No components found. Make sure your Handoff API URL is correct and accessible.
      </Notice>
    );
  }

  const typeKeys = Object.keys(grouped).sort();

  return (
    <div className="handoff-import-editor">
      <div className="import-editor-toolbar">
        <p className="help-text">
          All components are imported by default. Toggle individual components off to
          skip them, or expand to configure dynamic array fields.
        </p>
        <Button variant="tertiary" size="small" onClick={handleRefresh}>
          Refresh from API
        </Button>
      </div>
      {typeKeys.map((typeKey) => (
        <TypeSection
          key={typeKey}
          typeKey={typeKey}
          components={grouped[typeKey]}
          importConfig={importConfig}
          onChangeImport={handleChangeImport}
          taxonomyOptions={taxonomyOptions}
        />
      ))}
    </div>
  );
}
