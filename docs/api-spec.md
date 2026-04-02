# Handoff Blocks REST API

Base URL: `/wp-json/handoff/v1`

All endpoints require the current user to have the `edit_posts` capability (editors and admins). Migration endpoints require `edit_others_posts`.

---

## Block Editor Endpoints

These endpoints support the block editor's dynamic array features — post type discovery, field introspection, and taxonomy listing.

### GET /post-types

Returns all public post types that are visible in the REST API (excludes `attachment`).

**Response** `200 OK`

```json
[
  {
    "name": "post",
    "label": "Posts",
    "singular": "Post",
    "rest_base": "posts",
    "icon": "dashicons-admin-post"
  },
  {
    "name": "page",
    "label": "Pages",
    "singular": "Page",
    "rest_base": "pages",
    "icon": "dashicons-admin-page"
  }
]
```

### GET /fields/{post_type}

Returns available fields for a given post type. Includes core fields, author fields, registered post meta, and public taxonomies.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `post_type` | path | string | yes | A valid WordPress post type slug |

**Response** `200 OK`

```json
[
  {
    "key": "post_title",
    "label": "Title",
    "type": "text",
    "group": "core"
  },
  {
    "key": "featured_image",
    "label": "Featured Image",
    "type": "image",
    "group": "core"
  },
  {
    "key": "author.name",
    "label": "Author Name",
    "type": "text",
    "group": "author"
  },
  {
    "key": "meta:custom_field",
    "label": "Custom Field",
    "type": "string",
    "group": "meta"
  },
  {
    "key": "taxonomy:category",
    "label": "Categories",
    "type": "taxonomy",
    "group": "taxonomy"
  }
]
```

**Field Groups**

| Group | Description |
|-------|-------------|
| `core` | Built-in post fields (title, content, excerpt, date, permalink, featured image) |
| `author` | Author metadata (name, URL, avatar, bio) |
| `meta` | Registered post meta (non-private keys only) |
| `taxonomy` | Public taxonomies attached to the post type |

The field list can be extended via the `handoff_available_fields` filter.

### GET /taxonomies/{post_type}

Returns public, REST-visible taxonomies for a post type.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `post_type` | path | string | yes | A valid WordPress post type slug |

**Response** `200 OK`

```json
[
  {
    "name": "category",
    "label": "Categories",
    "singular": "Category",
    "rest_base": "categories",
    "hierarchical": true
  },
  {
    "name": "post_tag",
    "label": "Tags",
    "singular": "Tag",
    "rest_base": "tags",
    "hierarchical": false
  }
]
```

---

## Migration Endpoints

These endpoints power the ACF-to-Handoff block migration admin page. They are under the `/migration` sub-namespace.

### GET /migration/schemas

Returns all available Handoff block migration schemas. Schemas are read from `migration-schema.json` files in each `build/<block>/` directory.

**Response** `200 OK`

```json
{
  "handoff/hero-basic": {
    "blockName": "handoff/hero-basic",
    "title": "Basic Hero",
    "description": "A basic subheader hero...",
    "category": "handoff-heroes",
    "properties": {
      "theme": {
        "type": "select",
        "attributeName": "theme",
        "label": "Theme",
        "options": [
          { "label": "Light", "value": "light" },
          { "label": "Dark", "value": "dark" }
        ],
        "default": "light"
      },
      "background_image": {
        "type": "image",
        "attributeName": "backgroundImage",
        "label": "Background Image"
      }
    }
  }
}
```

Schema properties include `type`, `label`, `attributeName` (camelCase Gutenberg key), `description`, `default`, `options`, and nested `properties` or `items` for objects and arrays.

### GET /migration/pages

Returns pages and posts that contain ACF blocks in their content.

**Parameters**

| Name | In | Type | Default | Description |
|------|-----|------|---------|-------------|
| `post_type` | query | string | `"any"` | Filter by post type, or `"any"` for pages and posts |
| `per_page` | query | integer | `50` | Results per page |
| `page` | query | integer | `1` | Page number |

**Response** `200 OK`

```json
{
  "pages": [
    {
      "id": 42,
      "title": "About Us",
      "postType": "page",
      "status": "publish",
      "editUrl": "https://example.com/wp-admin/post.php?post=42&action=edit",
      "acfBlockCount": 5,
      "acfBlockTypes": ["acf/hero", "acf/testimonial", "acf/cta"]
    }
  ],
  "total": 12,
  "totalPages": 1
}
```

### GET /migration/pages/{id}/blocks

Parses a single page's content and returns the ACF blocks found, with their field data.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `id` | path | integer | yes | The WordPress post ID |

**Response** `200 OK`

```json
[
  {
    "blockName": "acf/testimonial",
    "index": 0,
    "data": {
      "quote": "Great product!",
      "author_name": "Jane Doe",
      "author_photo": 123
    },
    "raw": { }
  },
  {
    "blockName": "acf/hero",
    "index": 1,
    "data": {
      "title": "Welcome",
      "background": 456
    },
    "raw": { }
  }
]
```

The `data` object contains the ACF field values with internal keys (prefixed with `_`) stripped. The `raw` object is the full parsed block array from WordPress.

### GET /migration/mappings

Returns all saved ACF-to-Handoff mapping templates, keyed by ACF block name.

**Response** `200 OK`

```json
{
  "acf/testimonial": {
    "targetBlock": "handoff/testimonial-card",
    "fieldMappings": {
      "quote": "content",
      "author_name": "author.name",
      "author_photo": "author.image"
    },
    "updatedAt": "2026-03-10T14:30:00+00:00"
  }
}
```

### POST /migration/mappings

Save or update a mapping template for an ACF block type. If a mapping for the given `acfBlock` already exists, it is overwritten.

**Request Body** `application/json`

```json
{
  "acfBlock": "acf/testimonial",
  "targetBlock": "handoff/testimonial-card",
  "fieldMappings": {
    "quote": "content",
    "author_name": "author.name",
    "author_photo": "author.image"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `acfBlock` | string | yes | The ACF block name (e.g. `"acf/testimonial"`) |
| `targetBlock` | string | yes | The target Handoff block name (e.g. `"handoff/testimonial-card"`) |
| `fieldMappings` | object | no | ACF field key → Handoff dot-notation property path |

**Response** `200 OK`

```json
{
  "success": true
}
```

**Error** `400 Bad Request`

```json
{
  "code": "missing_fields",
  "message": "acfBlock and targetBlock are required.",
  "data": { "status": 400 }
}
```

### DELETE /migration/mappings/{acfBlock}

Delete a saved mapping template.

**Parameters**

| Name | In | Type | Required | Description |
|------|-----|------|----------|-------------|
| `acfBlock` | path | string | yes | URL-encoded ACF block name (e.g. `acf%2Ftestimonial`) |

**Response** `200 OK`

```json
{
  "success": true
}
```

### POST /migration/migrate

Execute a migration for a specific page. Replaces ACF blocks with Handoff blocks using the saved mapping templates.

**Request Body** `application/json`

```json
{
  "postId": 42,
  "mode": "draft"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `postId` | integer | yes | The WordPress post ID to migrate |
| `mode` | string | no | `"draft"` (create a new draft copy, default) or `"in-place"` (update the existing post) |

**Response** `200 OK`

```json
{
  "success": true,
  "message": "Migrated 5 block(s) into new draft (skipped 1).",
  "postId": 99,
  "editUrl": "https://example.com/wp-admin/post.php?post=99&action=edit"
}
```

When `mode` is `"draft"`, `postId` is the ID of the newly created draft. When `mode` is `"in-place"`, `postId` is the original post.

ACF blocks without a saved mapping are left untouched in the output (counted as "skipped").

**Error** `400 Bad Request`

```json
{
  "code": "missing_post",
  "message": "postId is required.",
  "data": { "status": 400 }
}
```

**Error** `500 Internal Server Error`

```json
{
  "code": "migration_failed",
  "message": "Post not found.",
  "data": { "status": 500 }
}
```

---

## Authentication

All endpoints use WordPress cookie authentication (nonce-based). When calling from JavaScript in the admin, use `@wordpress/api-fetch` which handles nonces automatically:

```js
import apiFetch from '@wordpress/api-fetch';

const types = await apiFetch({ path: '/handoff/v1/post-types' });
```

For external requests, pass the `X-WP-Nonce` header with a valid nonce.

---

## Permissions

| Endpoint Group | Required Capability |
|---------------|---------------------|
| Block Editor (`/post-types`, `/fields`, `/taxonomies`) | `edit_posts` |
| Migration (`/migration/*`) | `edit_others_posts` |
