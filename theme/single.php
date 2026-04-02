<?php
/**
 * The template for displaying all single posts
 *
 * @package Handoff
 * @since 1.0.0
 */

get_header();
?>

<main id="main" class="site-main o-container" role="main">
    <div class="o-row">
        <div class="o-col-8@md">

            <?php
            while (have_posts()) :
                the_post();

                get_template_part('template-parts/content', 'single');

                // If comments are open or we have at least one comment, load up the comment template
                if (comments_open() || get_comments_number()) :
                    comments_template();
                endif;

                // Previous/next post navigation
                the_post_navigation(array(
                    'prev_text' => '<span class="nav-subtitle">' . esc_html__('Previous:', 'handoff') . '</span> <span class="nav-title">%title</span>',
                    'next_text' => '<span class="nav-subtitle">' . esc_html__('Next:', 'handoff') . '</span> <span class="nav-title">%title</span>',
                ));

            endwhile;
            ?>

        </div>

        <?php get_sidebar(); ?>

    </div>
</main><!-- #main -->

<?php
get_footer();



