<?php
/**
 * Template part for displaying posts
 *
 * @package Handoff
 * @since 1.0.0
 */
?>

<article id="post-<?php the_ID(); ?>" <?php post_class(); ?>>
    
    <header class="entry-header">
        <?php
        if (is_singular()) :
            the_title('<h1 class="entry-title">', '</h1>');
        else :
            the_title('<h2 class="entry-title"><a href="' . esc_url(get_permalink()) . '" rel="bookmark">', '</a></h2>');
        endif;

        if ('post' === get_post_type()) :
            ?>
            <div class="entry-meta">
                <span class="posted-on">
                    <?php
                    printf(
                        '<time class="entry-date" datetime="%1$s">%2$s</time>',
                        esc_attr(get_the_date('c')),
                        esc_html(get_the_date())
                    );
                    ?>
                </span>
                <span class="byline">
                    <?php
                    printf(
                        esc_html__('by %s', 'handoff'),
                        '<span class="author vcard"><a href="' . esc_url(get_author_posts_url(get_the_author_meta('ID'))) . '">' . esc_html(get_the_author()) . '</a></span>'
                    );
                    ?>
                </span>
            </div><!-- .entry-meta -->
        <?php endif; ?>
    </header><!-- .entry-header -->

    <?php if (has_post_thumbnail() && !is_singular()) : ?>
        <div class="post-thumbnail">
            <a href="<?php the_permalink(); ?>">
                <?php the_post_thumbnail('large'); ?>
            </a>
        </div>
    <?php endif; ?>

    <div class="entry-content">
        <?php
        if (is_singular()) :
            the_content();
        else :
            the_excerpt();
        endif;

        wp_link_pages(array(
            'before' => '<div class="page-links">' . esc_html__('Pages:', 'handoff'),
            'after'  => '</div>',
        ));
        ?>
    </div><!-- .entry-content -->

    <footer class="entry-footer">
        <?php
        $categories_list = get_the_category_list(esc_html__(', ', 'handoff'));
        if ($categories_list) {
            printf('<span class="cat-links">' . esc_html__('Posted in %1$s', 'handoff') . '</span>', $categories_list);
        }

        $tags_list = get_the_tag_list('', esc_html_x(', ', 'list item separator', 'handoff'));
        if ($tags_list) {
            printf('<span class="tags-links">' . esc_html__('Tagged %1$s', 'handoff') . '</span>', $tags_list);
        }
        ?>
    </footer><!-- .entry-footer -->

</article><!-- #post-<?php the_ID(); ?> -->



