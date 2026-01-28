<?php
/**
 * The header for the theme
 * Transpiled from Handoff component: header
 *
 * @package Handoff Fetch
 * @since 1.0.0
 */

// Default values from component (can be overridden via theme options or customizer)
$logo = ['src' => 'https://placehold.co/250x50', 'alt' => 'Company Logo'];
$logoUrl = '/';
$utilityNav = [
  'webstore' => ['label' => 'Provider Webstore', 'url' => '#'],
  'login' => ['label' => 'Provider Log-In', 'url' => '#'],
];

// Allow theme customization via filter
$header_data = apply_filters('handoff_header_data', [
  'logo' => $logo,
  'logoUrl' => $logoUrl,
  'utilityNav' => $utilityNav,
]);
extract($header_data);
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="profile" href="https://gmpg.org/xfn/11">
    <?php wp_head(); ?>
</head>

<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<div id="page" class="site">
    <a class="skip-link screen-reader-text" href="#main">
        <?php esc_html_e('Skip to content', 'handoff'); ?>
    </a>

<header class="c-header">
      <div class="c-header__top">
        <div class="o-container">
          <div class="o-row">
            <div class="o-col-12">
              <div class="c-header__top-inner">
                <nav class="c-utility-nav">
                  <ul class="c-utility-nav__list">
                    <li class="c-utility-nav__item">
                      <a class="c-utility-nav__link" href="<?php echo esc_url(
                        $utilityNav['webstore']['url'] ?? '',
                      ); ?>">
                        <img src="https://cynosure.handoff.com/svg/cart.svg" alt="Cart" class="c-utility-nav__icon">
                        <span class="c-utility-nav__text"><?php echo esc_html(
                          $utilityNav['webstore']['label'] ?? '',
                        ); ?></span>
                      </a>
                    </li>
                    <li class="c-utility-nav__item">
                      <a class="c-utility-nav__link" href="<?php echo esc_url(
                        $utilityNav['login']['url'] ?? '',
                      ); ?>">
                        <img src="https://cynosure.handoff.com/svg/lock.svg" alt="Lock" class="c-utility-nav__icon">
                        <span class="c-utility-nav__text"><?php echo esc_html(
                          $utilityNav['login']['label'] ?? '',
                        ); ?></span>
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="c-header__bottom">
        <button class="c-hamburger-icon c-hamburger-icon--slider js-hamburger-icon js-offcanvas-toggle">
          <span class="c-hamburger-icon__box">
            <span class="c-hamburger-icon__inner"></span>
          </span>
        </button>
        <div class="o-container">
          <div class="o-row">
            <div class="o-col-12">
              <div class="c-header__bottom-inner">
                <a class="c-header__logo" href="<?php echo esc_html($logoUrl ?? ''); ?>">
                  <img src="<?php echo esc_url($logo['src'] ?? ''); ?>" alt="<?php echo esc_attr(
  $logo['alt'] ?? '',
); ?>">
                </a>
                <nav class="c-main-nav">
                  <ul class="c-main-nav__list">
                    <li class="c-main-nav__item c-main-nav__item--has-megamenu">
                      <a class="c-main-nav__link" href="#">
                        <span class="c-main-nav__text">For providers</span>
                      </a>
                      <div class="c-megamenu u-pt-5 u-pb-5">
                        <div class="o-container">
                          <div class="o-row">
                            <div class="o-col-8@md o-col-9@lg u-pie-gutter@md u-border-ie-1@md u-border-neutral-gray-200">
                              <h6 class="u-mb-3 u-font-basic">Products by Type</h6>
                              <div class="o-stack-2@md o-stack-3@lg o-stack-4@xl u-mb-n-gutter">
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic  c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-2.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic  c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-2.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic  c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-2.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Product Type</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <h6 class="u-mt-1 u-text-neutral-gray-500">Looking for a Specific Product?</h6>
                                  <a href="#" class="button button--outline-light button--full">View All Products</a>
                                </div>
                              </div>
                            </div>
                            <div class="o-col-4@md o-col-3@lg u-pis-gutter@md">
                              <nav class="c-secondary-nav u-mb-4">
                                <h5 class="c-secondary-nav__title u-h6">
                                  <a href="#">Events and Webinars</a>
                                </h5>
                                <ul class="c-secondary-nav__list u-text-sm">
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Aesthetic Innovation Tour</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Masters Series Seminars</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link is-active" href="#">Women's Health Events</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Tradeshows</a>
                                  </li>
                                </ul>
                              </nav>
                              <nav class="c-secondary-nav">
                                <h5 class="c-secondary-nav__title u-h6">
                                  <a href="#">Partnership Information</a>
                                </h5>
                                <ul class="c-secondary-nav__list u-text-sm">
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Benefits</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">AMPS Program</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Service</a>
                                  </li>
                                  <li class="c-secondary-nav__item">
                                    <a class="c-secondary-nav__link" href="#">Web Store</a>
                                  </li>
                                </ul>
                              </nav>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                    <li class="c-main-nav__item c-main-nav__item--has-megamenu">
                      <a class="c-main-nav__link" href="#">
                        <span class="c-main-nav__text">For patients</span>
                      </a>
                      <div class="c-megamenu c-megamenu--split-bg">
                        <div class="o-container">
                          <div class="o-row">
                            <div class="o-col-8@md o-col-9@xl u-pie-gutter@md  u-pt-5 u-pb-5">
                              <h6 class="u-mb-3 u-font-basic">Featured Treatments</h6>
                              <div class="o-stack-2@md o-stack-3@lg u-mb-n-gutter">
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic  c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-2.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Treatment 1</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-2.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Treatment 2</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Treatment 3</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Treatment 4</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <article class="c-product-card">
                                    <a href="#" class="c-product-card__pic c-product-card__pic--center c-product-card__pic--xs">
                                      <img src="https://cynosure.handoff.com/images/content/treatment-pic-1.jpeg" alt="">
                                    </a>
                                    <h3 class="c-product-card__title u-text-sm"><a href="#">Treatment 5</a></h3>
                                  </article>
                                </div>
                                <div class="u-mb-gutter">
                                  <h6 class="u-mt-1 u-text-neutral-gray-500">Looking for a Specific Treatment?</h6>
                                  <a href="#" class="button button--outline-light button--full">View All Treatments</a>
                                </div>
                              </div>
                            </div>
                            <div class="o-col-4@md o-col-3@xl u-pis-gutter@md u-pt-10 u-pb-10">
                              <div class="c-finder-card">
                                <img src="https://cynosure.handoff.com/svg/search.svg" alt="Search" class="c-finder-card__icon">
                                <div class="c-finder-card__content">
                                  <h5 class="c-finder-card__title">Find a Provider</h5>
                                  <div class="c-finder-card__text">
                                    <p>Lorem ipsum dolor sit amet, contetur adipiscing elit crasute.   nec lorem tincidunt  maximus.</p>
                                  </div>
                                  <a href="#" class="button button--outline-light button--md">Find a provider</a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                    <li class="c-main-nav__item c-main-nav__item--has-dropdown is-current">
                      <a class="c-main-nav__link" href="#">
                        <span class="c-main-nav__text">About us</span>
                      </a>
                      <div class="c-dropdown">
                        <ul class="c-dropdown__list">
                          <li class="c-dropdown__item is-current">
                            <a href="#" class="c-dropdown__link">Leadership</a>
                          </li>
                          <li class="c-dropdown__item">
                            <a href="#" class="c-dropdown__link">News</a>
                          </li>
                          <li class="c-dropdown__item">
                            <a href="#" class="c-dropdown__link">Careers</a>
                          </li>
                          <li class="c-dropdown__item">
                            <a href="#" class="c-dropdown__link">Investors</a>
                          </li>
                        </ul>
                      </div>
                    </li>
                    <li class="c-main-nav__item">
                      <a class="c-main-nav__link" href="#">
                        <span class="c-main-nav__text">Contact us</span>
                      </a>
                    </li>
                    <li class="c-main-nav__item">
                      <div class="c-search-bar">
                        <a href="#" class="c-search-bar__toggle js-open-search-bar">
                          <img src="https://cynosure.handoff.com/svg/search.svg" alt="Search" class="c-search-bar__icon">
                        </a>
                        <form class="c-search-bar__form">
                          <input class="c-search-bar__input" name="search" type="text" placeholder="Search">
                          <button class="c-search-bar__button">
                            <img src="https://cynosure.handoff.com/svg/search.svg" alt="Search" class="c-search-bar__icon">
                          </button>
                        </form>
                      </div>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="c-header__sticky-buffer"></div>
    </header>

    <div class="c-offcanvas">
      <nav class="c-mobile-nav">
        <ul class="c-mobile-nav__list">
          <li class="c-mobile-nav__item c-mobile-nav__item--has-panel">
            <a class="c-mobile-nav__link js-toggle-nav-panel" href="#">For Providers</a>
            <div class="c-mobile-nav__panel">
              <a href="#" class="c-mobile-nav__parent">For Providers</a>
              <a class="c-mobile-nav__back js-toggle-nav-panel" href="#">Back</a>
              <h6 class="c-mobile-nav__title">Products by Type</h6>
              <ul class="c-mobile-nav__list">
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Body Contouring</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Skin Revitalization</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Hair Removal</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Woman's Health</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Surgical</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Dental</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Veterinary</a>
                </li>
              </ul>
              <div class="c-mobile-nav__cta">
                <h6>Looking For a Specific Product?</h6>
                <a href="#" class="button button--outline-light button--lg">View all products</a>
              </div>
              <h6 class="c-mobile-nav__title">
                <a href="#">Events & Webinars</a>
              </h6>
              <ul class="c-mobile-nav__list">
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Aesthetic Innovation Tour</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Masters Series Seminars</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Women's Health Events</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">On-Demand Webcasts</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Conferences/Tradeshows</a>
                </li>
              </ul>
              <h6 class="c-mobile-nav__title">
                <a href="#">Partnership Information</a>
              </h6>
              <ul class="c-mobile-nav__list">
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Benefits</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">AMPS Program</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Service</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Web Store</a>
                </li>
              </ul>
            </div>
          </li>
          <li class="c-mobile-nav__item c-mobile-nav__item--has-panel">
            <a class="c-mobile-nav__link js-toggle-nav-panel" href="#">For Patients</a>
            <div class="c-mobile-nav__panel">
              <a href="#" class="c-mobile-nav__parent">For Patients</a>
              <a class="c-mobile-nav__back js-toggle-nav-panel" href="#">Back</a>
              <h6 class="c-mobile-nav__title">Treatments</h6>
              <ul class="c-mobile-nav__list">
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 1</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 2</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 3</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 4</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 5</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment 6</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Treatment ...</a>
                </li>
              </ul>
              <div class="c-mobile-nav__cta">
                <h6>Looking For a Specific Treatment?</h6>
                <a href="#" class="button button--outline-light button--lg">View all treatments</a>
              </div>
              <div class="c-mobile-nav__cta">
                <h6>Find a Provider</h6>
                <p>Lorem ipsum dolor sit amet, contetur adipiscing elit crasute.   nec lorem tincidunt  maximus.</p>
                <a href="#" class="button button--outline-light button--lg">Find a provider</a>
              </div>
            </div>
          </li>
          <li class="c-mobile-nav__item c-mobile-nav__item--has-panel">
            <a class="c-mobile-nav__link js-toggle-nav-panel" href="#">About Us</a>
            <div class="c-mobile-nav__panel">
              <a href="#" class="c-mobile-nav__parent">About Us</a>
              <a class="c-mobile-nav__back js-toggle-nav-panel" href="#">Back</a>
              <ul class="c-mobile-nav__list">
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Leadership</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">News</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Careers</a>
                </li>
                <li class="c-mobile-nav__item">
                  <a class="c-mobile-nav__link" href="#">Investors</a>
                </li>
              </ul>
            </div>
          </li>
          <li class="c-mobile-nav__item">
            <a class="c-mobile-nav__link" href="#">Contact Us</a>
          </li>
          <li class="c-mobile-nav__item">
            <form class="c-mobile-nav__search">
              <input class="c-mobile-nav__search-input" name="search" type="text" placeholder="Search">
              <button class="c-mobile-nav__search-button">
                <img src="https://cynosure.handoff.com/svg/search.svg" alt="Search" class="c-search-bar__icon">
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>

    <div id="content" class="site-content">
