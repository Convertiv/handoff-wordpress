/**
 * Maps a WordPress REST API post entity to Handoff template item structure.
 * Mirrors PHP handoff_map_post_to_item for editor preview when using dynamic posts.
 *
 * @param {Object} record       REST API post entity (e.g. from getEntityRecords).
 * @param {Object} fieldMapping  Field mapping config: { 'item.path': sourceOrConfig }.
 * @param {Object} itemOverrides Optional overrides applied to every item (e.g. card type).
 * @param {Object} embedded     Optional _embedded from the REST response (featured media, author).
 * @return {Object} Mapped item for preview.
 */
export function mapPostEntityToItem(record, fieldMapping, itemOverrides = {}, embedded = {}) {
  const item = {};

  function setNested(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') current[k] = {};
      current = current[k];
    }
    current[keys[keys.length - 1]] = value;
  }

  function resolveValue(source) {
    if (source === null || source === undefined) return null;
    // Complex config: { type: 'static', value } or { type: 'meta', key }
    if (typeof source === 'object') {
      const type = source.type || '';
      if (type === 'static') return source.value ?? '';
      if (type === 'meta') return record.meta?.[source.key] ?? null;
      return null;
    }
    const s = String(source);
    // Core post fields (REST shape)
    if (s === 'post_title') return record.title?.rendered ?? '';
    if (s === 'post_content') return record.content?.rendered ?? '';
    if (s === 'post_excerpt') return record.excerpt?.rendered ?? '';
    if (s === 'post_date') return record.date ?? '';
    if (s === 'post_name') return record.slug ?? '';
    if (s === 'permalink') return record.link ?? '';
    if (s === 'post_id') return record.id ?? null;
    // Date parts (post_date:day_numeric, post_date:month_short, etc.)
    if (s.startsWith('post_date:')) {
      const part = s.slice(10);
      const dateStr = record.date;
      if (!dateStr) return '';
      const d = new Date(dateStr);
      const day = d.getDate();
      const month = d.getMonth();
      const year = d.getFullYear();
      const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if (part === 'day_numeric') return String(day);
      if (part === 'day') return String(day).padStart(2, '0');
      if (part === 'month_short') return monthsShort[month] ?? '';
      if (part === 'month_name') return monthsFull[month] ?? '';
      if (part === 'month') return String(month + 1).padStart(2, '0');
      if (part === 'year') return String(year);
      return dateStr;
    }
    // Featured image
    if (s === 'featured_image') {
      const media = embedded['wp:featuredmedia']?.[0];
      if (media) {
        return {
          src: media.source_url || media.url || '',
          alt: media.alt_text || media.caption?.rendered || '',
        };
      }
      return { src: '', alt: '' };
    }
    // Author (simplified: name from embedded or id)
    if (s.startsWith('author.')) {
      const authorEmbed = embedded.author?.[0];
      if (authorEmbed) {
        const field = s.slice(7);
        if (field === 'name') return authorEmbed.name ?? '';
        if (field === 'url') return authorEmbed.url ?? authorEmbed.link ?? '';
      }
      return '';
    }
    // Taxonomy (would need _embedded['wp:term'] by taxonomy) - simplified
    if (s.startsWith('taxonomy:')) return '';
    if (s.startsWith('meta:')) return record.meta?.[s.slice(5)] ?? null;
    return null;
  }

  if (fieldMapping && typeof fieldMapping === 'object') {
    for (const [path, source] of Object.entries(fieldMapping)) {
      const value = resolveValue(source);
      setNested(item, path, value);
    }
  }

  // Apply item overrides (e.g. card.type)
  if (itemOverrides && typeof itemOverrides === 'object') {
    for (const [path, value] of Object.entries(itemOverrides)) {
      if (path && value !== null && value !== undefined) setNested(item, path, value);
    }
  }

  return item;
}
