<?php
/**
 * Template Part: Header Compact
 * Transpiled from Handoff component: header-compact
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component
$logo = ['src' => 'https://placehold.co/250x50', 'alt' => 'Company Logo'];
$logoUrl = '/';

// Allow customization via filter
$header_compact_data = apply_filters('handoff_header_compact_data', [
  'logo' => $logo,
  'logoUrl' => $logoUrl,
]);
extract($header_compact_data);
?>

<header class="c-header c-header--higher c-header--float not-sticky">
      <div class="c-header__bottom">
        <div class="o-container">
          <div class="o-row">
            <div class="o-col-12">
              <div class="c-header__bottom-inner u-justify-center">
                <a class="c-header__logo" href="<?php echo esc_html($logoUrl ?? ''); ?>">
                  <img src="<?php echo esc_url($logo['src'] ?? ''); ?>" alt="<?php echo esc_attr(
  $logo['alt'] ?? '',
); ?>">
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="c-header__sticky-buffer"></div>
    </header>
