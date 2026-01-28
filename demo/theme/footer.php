<?php
/**
 * The footer for the theme
 * Transpiled from Handoff component: footer
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component (can be overridden via theme options or customizer)
$logo = [
  'src' => 'https://cynosure.handoff.com/images/layout/logo-cynosure-black.svg',
  'alt' => 'Cynosure',
  'url' => '#',
];
$legalText = [
  'Cras posuere purus eu elementum congue vivamus rhoncus eget nibh tinciduntsemper gravida commodo porta nisi.',
  'Hologic, Inc. owns exclusive rights to photography. Use of photography without written permission of Cynosure is prohibited.',
];
$navColumns = [
  [
    'links' => [
      ['text' => 'For Providers', 'url' => '#'],
      ['text' => 'Products', 'url' => '#'],
      ['text' => 'Events and Webinars', 'url' => '#'],
      ['text' => 'Partnership Information', 'url' => '#'],
    ],
  ],
  [
    'links' => [
      ['text' => 'For Patients', 'url' => '#'],
      ['text' => 'Treatments', 'url' => '#'],
      ['text' => 'Find a Provider', 'url' => '#'],
    ],
  ],
  [
    'links' => [
      ['text' => 'About Us', 'url' => '#'],
      ['text' => 'Leadership', 'url' => '#'],
      ['text' => 'News', 'url' => '#'],
      ['text' => 'Careers', 'url' => '#'],
      ['text' => 'Investors', 'url' => '#'],
    ],
  ],
  [
    'links' => [
      ['text' => 'Contact Us', 'url' => '#'],
      ['text' => 'Terms & Conditions', 'url' => '#'],
      ['text' => 'Site Map', 'url' => '#'],
      ['text' => 'Privacy Policy', 'url' => '#'],
      ['text' => 'California Supply Chain Act', 'url' => '#'],
    ],
  ],
];
$socialLinks = [
  ['name' => 'Facebook', 'url' => '#', 'icon' => 'https://cynosure.handoff.com/svg/facebook.svg'],
  ['name' => 'Twitter', 'url' => '#', 'icon' => 'https://cynosure.handoff.com/svg/twitter.svg'],
  ['name' => 'Youtube', 'url' => '#', 'icon' => 'https://cynosure.handoff.com/svg/youtube.svg'],
  ['name' => 'Pinterest', 'url' => '#', 'icon' => 'https://cynosure.handoff.com/svg/pinterest.svg'],
  ['name' => 'Linkedin', 'url' => '#', 'icon' => 'https://cynosure.handoff.com/svg/linkedin.svg'],
];
$languageSwitcher = [
  'options' => ['International', 'English', 'English (UK)', 'Deutsch', 'Morocco', 'Australia'],
];

// Allow theme customization via filter
$footer_data = apply_filters('handoff_footer_data', [
  'logo' => $logo,
  'legalText' => $legalText,
  'navColumns' => $navColumns,
  'socialLinks' => $socialLinks,
  'languageSwitcher' => $languageSwitcher,
]);
extract($footer_data);
?>

    </div><!-- #content -->

<footer class="c-footer">
      <div class="o-container">
        <div class="o-row">
          <div class="o-col-12">
            <div class="c-footer__top">
              <div class="c-footer__left-col">
                <a class="c-footer__logo" href="<?php echo esc_url($logo['url'] ?? '#'); ?>">
                  <img src="<?php echo esc_url($logo['src'] ?? ''); ?>" alt="<?php echo esc_attr(
  $logo['alt'] ?? '',
); ?>">
                </a>
                <div class="c-footer__legal">
                  <?php if (!empty($legalText)):
                    $_loop_count = count($legalText);
                    foreach ($legalText as $index => $item): ?>
                  <p><?php echo esc_html($subItem ?? ($item ?? '')); ?></p>
                  <?php endforeach;
                  endif; ?>
                </div>
              </div>
              <div class="c-footer__right-col">
                <?php if (!empty($navColumns)):
                  $_loop_count = count($navColumns);
                  foreach ($navColumns as $index => $item): ?>
                <nav class="c-footer__nav">
                  <ul>
                    <?php if (!empty($item['links'])):
                      $_nested_loop_count = count($item['links']);
                      foreach ($item['links'] as $subIndex => $subItem): ?>
                    <li>
                      <a href="<?php echo esc_url($item['url'] ?? ''); ?>"><?php echo esc_html(
  $item['text'] ?? '',
); ?></a>
                    </li>
                    <?php endforeach;
                    endif; ?>
                  </ul>
                </nav>
                <?php endforeach;
                endif; ?>
              </div>
            </div>
            <div class="c-footer__bottom">
              <ul class="c-social-profiles u-mb-0@md">
                <?php if (!empty($socialLinks)):
                  $_loop_count = count($socialLinks);
                  foreach ($socialLinks as $index => $item): ?>
                <li class="c-social-profiles__item">
                  <a class="c-social-profiles__link" href="<?php echo esc_url(
                    $item['url'] ?? '',
                  ); ?>" target="_blank">
                    <img src="<?php echo esc_html(
                      $item['icon'] ?? '',
                    ); ?>" alt="<?php echo esc_html(
  $item['name'] ?? '',
); ?>" class="o-icon c-social-profiles__icon">
                  </a>
                </li>
                <?php endforeach;
                endif; ?>
              </ul>
              <div>
                <div class="c-lang-switcher">
                  <select>
                    <?php if (!empty($languageSwitcher)):
                      $_loop_count = count($languageSwitcher);
                      foreach ($languageSwitcher as $index => $item): ?>
                    <option><?php echo esc_html($subItem ?? ($item ?? '')); ?></option>
                    <?php endforeach;
                    endif; ?>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>

<?php wp_footer(); ?>

</div><!-- #page -->
</body>
</html>
