<?php
/**
 * The main template file
 *
 * @package Handoff
 * @since 1.0.0
 */

get_header();
?>

<main id="main" class="site-main o-container" role="main">

    <?php
    if (have_posts()) :
        
        if (is_home() && !is_front_page()) :
            ?>
            <header class="page-header">
                <h1 class="page-title"><?php single_post_title(); ?></h1>
            </header>
            <?php
        endif;

        // Start the Loop
        while (have_posts()) :
            the_post();

            /*
             * Include the Post-Type-specific template for the content.
             * If you want to override this in a child theme, then include a file
             * called content-___.php (where ___ is the Post Type name) and that
             * will be used instead.
             */
            get_template_part('template-parts/content', get_post_type());

        endwhile;

        // Previous/next page navigation
        the_posts_pagination(array(
            'mid_size'  => 2,
            'prev_text' => __('Previous', 'handoff'),
            'next_text' => __('Next', 'handoff'),
        ));

    else :

        get_template_part('template-parts/content', 'none');

    endif;
    ?>

</main><!-- #main -->

<?php
get_sidebar();
get_footer();



