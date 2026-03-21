<?php

if (!function_exists('convertiv_breadcrumbs')) :
	/**
	 * Prints HTML with meta breadcrumbs.
	 */
	function convertiv_breadcrumbs()
	{
		/* === OPTIONS === */
		$text['home'] = apply_filters('convertiv_breadcrumbs_home_text', 'Home'); // text for the 'Home' link
		$text['blog'] = apply_filters('convertiv_breadcrumbs_blog_text', 'Blog'); // text for the 'Blog' link
		//$text['category'] = 'Archive by Category "%s"'; // text for a category page
		$text['category'] = '%s'; // text for a category page
		$text['search'] = 'Search Results for "%s" Query'; // text for a search results page
		$text['tag'] = 'Posts Tagged "%s"'; // text for a tag page
		$text['author'] = 'Articles Posted by %s'; // text for an author page
		$text['404'] = 'Error 404'; // text for the 404 page
		$text['page'] = 'Page %s'; // text 'Page N'
		$text['cpage'] = 'Comment Page %s'; // text 'Comment Page N'

		//$wrap_before    = '<div class="breadcrumbs" itemscope itemtype="http://schema.org/BreadcrumbList">'; // the opening wrapper tag
		//$wrap_after     = '</div><!-- .breadcrumbs -->'; // the closing wrapper tag
		$wrap_before = ''; // the opening wrapper tag
		$wrap_after = ''; // the closing wrapper tag
		//$sep            = '›'; // separator between crumbs
		$sep = sprite('caret-right', 'c-breadcrumbs__separator', false); // separator between crumbs
		//$sep_before     = '<span class="sep">'; // tag before separator
		//$sep_after      = '</span>'; // tag after separator
		$sep_before = '<li class="c-breadcrumbs__item">'; // tag before separator
		$sep_after = '</li>'; // tag after separator
		$show_home_link = 1; // 1 - show the 'Home' link, 0 - don't show
		$show_blog_link = 1; // 1 - show the 'Blog' link, 0 - don't show
		$show_on_home = 1; // 1 - show breadcrumbs on the homepage, 0 - don't show
		$show_current = 1; // 1 - show current page title, 0 - don't show
		//$before         = '<span class="current">'; // tag before the current crumb
		//$after          = '</span>'; // tag after the current crumb
		//$before         = '<li class="c-breadcrumbs__item">'; // tag before the current crumb
		$before = apply_filters('convertiv_breadcrumbs_before', '<li class="c-breadcrumbs__item">');
		$after = '</li>'; // tag after the current crumb
		/* === END OF OPTIONS === */

		/**
		 * Set our own $wp_the_query variable. Do not use the global variable version due to reliability
		 */
		$wp_the_query = $GLOBALS['wp_the_query'] ?? null;
		if (!$wp_the_query) {
			return;
		}
		$queried_object = $wp_the_query->get_queried_object();

		global $post;
		//$home_url = home_url('/');
		$home_url = apply_filters('convertiv_breadcrumbs_home_url', home_url('/'));
		$page_for_posts = (int) get_option('page_for_posts');
		$blog_url = $page_for_posts > 0 ? get_permalink($page_for_posts) : '';
		//$link_before    = '<span itemprop="itemListElement" itemscope itemtype="http://schema.org/ListItem">';
		//$link_after     = '</span>';
		$link_before = '<li class="c-breadcrumbs__item">';
		$link_after = '</li>';
		$link_attr = ' class="c-breadcrumbs__link"';
		$home_link_attr = ' class="c-breadcrumbs__link home"';
		$blog_link_attr = ' class="c-breadcrumbs__link blog"';
		//$link_in_before = '<span itemprop="name">';
		//$link_in_after  = '</span>';
		$link_in_before = '';
		$link_in_after = '';
		$link = $link_before . '<a href="%1$s"' . $link_attr . '>' . $link_in_before . '%2$s' . $link_in_after . '</a>' . $link_after;
		$frontpage_id = get_option('page_on_front');
		$parent_id = (is_object($post) && isset($post->post_parent)) ? (int) $post->post_parent : 0;
		$paged = (int) get_query_var('paged');
		$cpage = (int) get_query_var('cpage');
		$current_post_type = get_post_type();
		$sep = ' ' . $sep_before . $sep . $sep_after . ' ';
		$sep_pattern = preg_quote($sep, '#');
		$home_link = $link_before . '<a href="' . esc_url($home_url) . '"' . $home_link_attr . '>' . $link_in_before . $text['home'] . $link_in_after . '</a>' . $link_after;
		$blog_link = '';
		if (!empty($blog_url)) {
			$blog_link = $link_before . '<a href="' . esc_url($blog_url) . '"' . $blog_link_attr . '>' . $link_in_before . $text['blog'] . $link_in_after . '</a>' . $link_after;
		}
		$has_blog_link = $show_blog_link && $blog_link !== '';
		$crumbs = array();

		$append_crumb = static function ($crumb) use (&$crumbs) {
			if ($crumb !== null && $crumb !== '') {
				$crumbs[] = $crumb;
			}
		};
		$append_split_crumbs = static function ($crumb_html, $separator) use (&$crumbs) {
			if ($crumb_html === null || $crumb_html === '') {
				return;
			}
			$parts = array_filter(
				array_map('trim', explode($separator, (string) $crumb_html)),
				static function ($item) {
					return $item !== '';
				}
			);
			foreach ($parts as $part) {
				$crumbs[] = $part;
			}
		};
		$append_current = static function ($value) use (&$crumbs, $before, $after) {
			if ($value !== null && $value !== '') {
				$crumbs[] = $before . $value . $after;
			}
		};

		if (is_home() || is_front_page()) {
			if ($show_on_home) {
				$append_crumb($home_link);
			}
			if ($show_current && $page_for_posts > 0) {
				$append_current(get_the_title($page_for_posts));
			}
		} else {
			if ($show_home_link) {
				$append_crumb($home_link);
			}

			$append_crumb(apply_filters('convertiv_breadcrumbs_after_home', ''));

			if (is_category()) {
				$cat = get_category((int) get_query_var('cat'), false);
				if ($cat && !is_wp_error($cat) && !empty($cat->parent)) {
					$cats = get_category_parents((int) $cat->parent, true, $sep);
					$cats = preg_replace("#^(.+){$sep_pattern}$#", "$1", $cats);
					$cats = preg_replace('#<a([^>]+)>([^<]+)<\/a>#', $link_before . '<a$1' . $link_attr . '>' . $link_in_before . '$2' . $link_in_after . '</a>' . $link_after, $cats);
					if ($has_blog_link) {
						$append_crumb($blog_link);
					}
					$append_split_crumbs($cats, $sep);
				}
				if ($paged > 0 && $cat && !is_wp_error($cat)) {
					$cat_id = (int) $cat->cat_ID;
					if ($has_blog_link) {
						$append_crumb($blog_link);
					}
					$append_crumb(sprintf($link, get_category_link($cat_id), get_cat_name($cat_id)));
					$append_current(sprintf($text['page'], $paged));
				} else {
					if ($has_blog_link) {
						$append_crumb($blog_link);
					}
					if ($show_current) {
						$append_current(sprintf($text['category'], single_cat_title('', false)));
					}
				}
			} elseif (is_tax('event_category')) {
				if ($show_current && is_object($queried_object) && isset($queried_object->name)) {
					$append_current($queried_object->name);
				}
			} elseif (is_tax('webinar_type')) {
				$queried_parent = (is_object($queried_object) && isset($queried_object->parent)) ? (int) $queried_object->parent : 0;
				if ($queried_parent !== 0) {
					$parent = get_term($queried_parent, 'webinar_type');
					if ($parent && !is_wp_error($parent)) {
						$parent_link = get_term_link($parent, 'webinar_type');
						if (!is_wp_error($parent_link)) {
							$append_crumb($link_before . '<a href="' . esc_url($parent_link) . '"' . $blog_link_attr . '>' . $link_in_before . $parent->name . $link_in_after . '</a>' . $link_after);
						}
					}
				}
				if ($show_current && is_object($queried_object) && isset($queried_object->name)) {
					$append_current($queried_object->name);
				}
			} elseif (is_search()) {
				if ($show_current) {
					$append_current(sprintf($text['search'], get_search_query()));
				}
			} elseif (is_day()) {
				$current_year = get_the_time('Y');
				$current_month_num = get_the_time('m');
				$current_month = get_the_time('F');
				$current_day = get_the_time('d');
				$append_crumb(sprintf($link, get_year_link($current_year), $current_year));
				$append_crumb(sprintf($link, get_month_link($current_year, $current_month_num), $current_month));
				if ($show_current) {
					$append_current($current_day);
				}
			} elseif (is_month()) {
				$current_year = get_the_time('Y');
				$current_month = get_the_time('F');
				$append_crumb(sprintf($link, get_year_link($current_year), $current_year));
				if ($show_current) {
					$append_current($current_month);
				}
			} elseif (is_year()) {
				$current_year = get_the_time('Y');
				if ($show_current) {
					$append_current($current_year);
				}
			} elseif (is_single() && !is_attachment()) {
				if ($current_post_type !== 'post') {
					if ($current_post_type === 'product') {
						$products_page = __get_page_by_template('page-template-products.php');
						if ($products_page && isset($products_page->ID)) {
							$append_crumb(sprintf($link, get_permalink($products_page->ID), get_the_title($products_page)));
						}
					} elseif ($current_post_type === 'treatment') {
						$treatments_page = __get_page_by_template('page-template-treatments.php');
						if ($treatments_page && isset($treatments_page->ID)) {
							$append_crumb(sprintf($link, get_permalink($treatments_page->ID), get_the_title($treatments_page)));
						}
					} else {
						$post_type = get_post_type_object($current_post_type);
						if ($post_type && isset($post_type->rewrite['slug'], $post_type->labels->name)) {
							$append_crumb(sprintf($link, $home_url . $post_type->rewrite['slug'] . '/', $post_type->labels->name));
						}
					}
					if ($parent_id) {
						$append_crumb($link_before . '<a href="' . esc_url(get_permalink($parent_id)) . '"' . $blog_link_attr . '>' . $link_in_before . get_the_title($parent_id) . $link_in_after . '</a>' . $link_after);
					}
					if ($show_current) {
						$append_current(get_the_title());
					}
				} else {
					if ($has_blog_link) {
						$append_crumb($blog_link);
					}
					$cats_list = get_the_category();
					$cat = !empty($cats_list) && isset($cats_list[0]) ? $cats_list[0] : null;
					if ($cat && !is_wp_error($cat)) {
						$cats = get_category_parents($cat, true, $sep);
						if (!$show_current || $cpage > 0) {
							$cats = preg_replace("#^(.+){$sep_pattern}$#", "$1", $cats);
						}
						$cats = preg_replace('#<a([^>]+)>([^<]+)<\/a>#', $link_before . '<a$1' . $link_attr . '>' . $link_in_before . '$2' . $link_in_after . '</a>' . $link_after, $cats);
						$append_split_crumbs($cats, $sep);
					}
					if ($cpage > 0) {
						$append_crumb(sprintf($link, get_permalink(), get_the_title()));
						$append_current(sprintf($text['cpage'], $cpage));
					} elseif ($show_current) {
						$append_current(get_the_title());
					}
				}
				// custom post type
			} elseif (!is_single() && !is_page() && $current_post_type !== 'post' && !is_404()) {
				$query_post_type = $wp_the_query->query_vars['post_type'] ?? $current_post_type;
				if (is_array($query_post_type)) {
					$query_post_type = reset($query_post_type);
				}
				$post_type = $query_post_type ? get_post_type_object($query_post_type) : null;
				if ($post_type) {
					$append_crumb(sprintf($link, get_post_type_archive_link($post_type->name), $post_type->label));
					if ($paged > 0) {
						$append_current(sprintf($text['page'], $paged));
					} elseif ($show_current) {
						$append_current($post_type->label);
					}
				}
			} elseif (is_attachment()) {
				$parent = get_post($parent_id);
				if ($parent && isset($parent->ID)) {
					$cat_list = get_the_category($parent->ID);
					$cat = !empty($cat_list) && isset($cat_list[0]) ? $cat_list[0] : null;
					if ($cat && !is_wp_error($cat)) {
						$cats = get_category_parents($cat, true, $sep);
						$cats = preg_replace('#<a([^>]+)>([^<]+)<\/a>#', $link_before . '<a$1' . $link_attr . '>' . $link_in_before . '$2' . $link_in_after . '</a>' . $link_after, $cats);
						$append_split_crumbs($cats, $sep);
					}
					$append_crumb(sprintf($link, get_permalink($parent), $parent->post_title));
				}
				if ($show_current) {
					$append_current(get_the_title());
				}
			} elseif (is_page() && !$parent_id) {
				if ($show_current) {
					$append_current(get_the_title());
				}
			} elseif (is_page() && $parent_id) {
				if ($parent_id !== (int) $frontpage_id) {
					$breadcrumbs = array();
					$breadcrumb_depth = 0;
					while ($parent_id) {
						$breadcrumb_depth++;
						if ($breadcrumb_depth > 50) {
							break;
						}
						$page = get_page($parent_id);
						if (!$page || !isset($page->post_parent, $page->ID)) {
							break;
						}
						if ($parent_id !== (int) $frontpage_id) {
							$parent_link      = apply_filters('convertiv_breadcrumbs_parent_page_link', $link);
							$parent_permalink = apply_filters('convertiv_breadcrumbs_parent_page_permalink', get_permalink($page->ID));
							$parent_title     = apply_filters('convertiv_breadcrumbs_parent_page_title', get_the_title($page->ID));

							$breadcrumbs[] = sprintf($parent_link, $parent_permalink, $parent_title);
						}
						$parent_id = $page->post_parent;
					}
					$breadcrumbs = array_reverse($breadcrumbs);
					foreach ($breadcrumbs as $parent_crumb) {
						$append_crumb($parent_crumb);
					}
				}
				if ($show_current) {
					$append_current(get_the_title());
				}
			} elseif (is_tag()) {
				if ($paged > 0) {
					$tag_id = get_queried_object_id();
					$tag = get_tag($tag_id);
					if ($tag && !is_wp_error($tag)) {
						$append_crumb(sprintf($link, get_tag_link($tag_id), $tag->name));
						$append_current(sprintf($text['page'], $paged));
					}
				} elseif ($show_current) {
					$append_current(sprintf($text['tag'], single_tag_title('', false)));
				}
			} elseif (is_author()) {
				$author_id = is_object($queried_object) && isset($queried_object->ID) ? (int) $queried_object->ID : (int) get_query_var('author');
				$author = $author_id > 0 ? get_userdata($author_id) : false;
				if ($author) {
					if ($paged > 0) {
						$append_crumb(sprintf($link, get_author_posts_url($author->ID), $author->display_name));
						$append_current(sprintf($text['page'], $paged));
					} elseif ($show_current) {
						$append_current(sprintf($text['author'], $author->display_name));
					}
				}
			} elseif (is_404()) {
				if ($show_current) {
					$append_current($text['404']);
				}
			} elseif (has_post_format() && !is_singular()) {
				$append_crumb(get_post_format_string(get_post_format()));
			}
		}

		if (!empty($crumbs)) {
			echo $wrap_before . implode($sep, $crumbs) . $wrap_after;
		}
	} // end of convertiv_breadcrumbs()
endif;
